package app.grove.music

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class SpotifyImportService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  companion object {
    private const val channelId = "zonic_spotify_import"
    private const val notificationId = 8421
    const val actionStart = "app.grove.music.IMPORT_START"
    const val actionUpdate = "app.grove.music.IMPORT_UPDATE"
    const val actionStop = "app.grove.music.IMPORT_STOP"

    fun start(context: Context, processed: Int, total: Int) {
      val intent = Intent(context, SpotifyImportService::class.java).apply {
        action = actionStart
        putExtra("processed", processed)
        putExtra("total", total)
      }
      ContextCompat.startForegroundService(context, intent)
    }

    fun update(context: Context, processed: Int, total: Int) {
      context.startService(Intent(context, SpotifyImportService::class.java).apply {
        action = actionUpdate
        putExtra("processed", processed)
        putExtra("total", total)
      })
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, SpotifyImportService::class.java))
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == actionStop) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    val processed = intent?.getIntExtra("processed", 0) ?: 0
    val total = intent?.getIntExtra("total", 0) ?: 0
    if (wakeLock?.isHeld != true) {
      wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Zonic:SpotifyImport")
        // A foreground import can take a while; this prevents screen-off from
        // stalling it while still giving Android a bounded safety limit.
        .also { it.acquire(2 * 60 * 60 * 1000L) }
    }
    val notification = notification(processed, total)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(notificationId, notification)
    }
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    super.onDestroy()
  }

  private fun notification(processed: Int, total: Int): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(
        channelId,
        "Spotify playlist imports",
        NotificationManager.IMPORTANCE_LOW,
      ))
    }
    val progressText = if (total > 0) "$processed of $total songs" else "Preparing playlist"
    return NotificationCompat.Builder(this, channelId)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Importing Spotify playlist")
      .setContentText(progressText)
      .setOnlyAlertOnce(true)
      .setOngoing(true)
      .setProgress(total, processed.coerceAtMost(total), total <= 0)
      .build()
  }
}
