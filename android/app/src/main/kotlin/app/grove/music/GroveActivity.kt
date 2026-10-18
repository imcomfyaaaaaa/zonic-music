package app.grove.music

import android.app.UiModeManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import android.content.ContentValues
import android.provider.MediaStore
import android.provider.Settings
import java.io.File
import com.ryanheise.audioservice.AudioServiceActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class GroveActivity : AudioServiceActivity() {
  private var pendingNotificationPermission: MethodChannel.Result? = null

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == 604) {
      pendingNotificationPermission?.success(grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED)
      pendingNotificationPermission = null
    }
  }

  override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)
    MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "grove/platform").setMethodCallHandler { call, result ->
      if (call.method == "info") {
        val mode = getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
        val accent = if (Build.VERSION.SDK_INT >= 31) getColor(android.R.color.system_accent1_200) else 0xffc5ed9b.toInt()
        // ADB-only development overrides make it possible to test the real TV
        // and Automotive branches on a phone. Normal launches still depend on
        // the actual device mode/features.
        val forceTv = intent?.getBooleanExtra("zonic_force_tv", false) == true
        val forceAuto = intent?.getBooleanExtra("zonic_force_auto", false) == true
        val isTv = forceTv || mode.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION || packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
        val isAuto = forceAuto || mode.currentModeType == Configuration.UI_MODE_TYPE_CAR || packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)
        result.success(mapOf("tv" to isTv, "auto" to isAuto, "accent" to String.format("#%06X", accent and 0xffffff)))
      } else if (call.method == "requestNotifications") {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
          pendingNotificationPermission?.error("superseded", "Another notification permission request started", null)
          pendingNotificationPermission = result
          ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 604)
        } else {
          result.success(true)
        }
      } else if (call.method == "spotifyImportForeground") {
        val action = call.argument<String>("action")
        val processed = call.argument<Int>("processed") ?: 0
        val total = call.argument<Int>("total") ?: 0
        when (action) {
          "start" -> SpotifyImportService.start(this, processed, total)
          "update" -> SpotifyImportService.update(this, processed, total)
          "stop" -> SpotifyImportService.stop(this)
          else -> { result.error("invalid_action", "Unknown Spotify import action", null); return@setMethodCallHandler }
        }
        result.success(true)
      } else if (call.method == "installUpdate") {
        try {
          val path = call.argument<String>("path") ?: throw IllegalArgumentException("Missing APK path")
          val updateDirectory = File(cacheDir, "updates").canonicalFile
          val apk = File(path).canonicalFile
          if (!apk.path.startsWith(updateDirectory.path + File.separator) ||
              !apk.name.endsWith(".apk") || !apk.isFile || apk.length() < 1024 * 1024) {
            throw IllegalArgumentException("Invalid update APK")
          }
          if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
              Uri.parse("package:$packageName")))
            result.error("permission_required", "Allow installs from Zonic and try again", null)
            return@setMethodCallHandler
          }
          val uri = FileProvider.getUriForFile(this, "$packageName.updates", apk)
          val install = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            data = uri
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }
          startActivity(install)
          result.success(true)
        } catch (error: Exception) {
          result.error("install_failed", error.message, null)
        }
      } else if (call.method == "exportToDownloads" && Build.VERSION.SDK_INT >= 29) {
        try {
          val source = File(call.argument<String>("path")!!)
          val name = call.argument<String>("name")!!
          val values = ContentValues().apply { put(MediaStore.Downloads.DISPLAY_NAME, name); put(MediaStore.Downloads.MIME_TYPE, if (name.endsWith(".zip")) "application/zip" else "application/json"); put(MediaStore.Downloads.RELATIVE_PATH, "Download/Grove"); put(MediaStore.Downloads.IS_PENDING, 1) }
          val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw IllegalStateException("Downloads unavailable")
          contentResolver.openOutputStream(uri).use { output -> if (output == null) throw IllegalStateException("Could not open export"); source.inputStream().use { input -> input.copyTo(output) } }
          values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0); contentResolver.update(uri, values, null, null)
          result.success("Downloads/Grove/$name")
        } catch (error: Exception) { result.error("export_failed", error.message, null) }
      } else result.notImplemented()
    }
  }
}
