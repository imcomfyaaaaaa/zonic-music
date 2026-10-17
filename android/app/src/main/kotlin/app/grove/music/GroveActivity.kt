package app.grove.music

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.content.ContentValues
import android.provider.MediaStore
import java.io.File
import com.ryanheise.audioservice.AudioServiceActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class GroveActivity : AudioServiceActivity() {
  override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)
    MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "grove/platform").setMethodCallHandler { call, result ->
      if (call.method == "info") {
        val mode = getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
        val accent = if (Build.VERSION.SDK_INT >= 31) getColor(android.R.color.system_accent1_200) else 0xffc5ed9b.toInt()
        val isTv = mode.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION || packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
        val isAuto = mode.currentModeType == Configuration.UI_MODE_TYPE_CAR || packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)
        result.success(mapOf("tv" to isTv, "auto" to isAuto, "accent" to String.format("#%06X", accent and 0xffffff)))
      } else if (call.method == "requestNotifications") {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
          ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 604)
        }
        result.success(true)
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
