package net.thetaspace.communications.push

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import net.thetaspace.communications.MainActivity
import net.thetaspace.communications.R
import androidx.work.ForegroundInfo

object ThetaCommNotifications {
    private const val CHANNEL_MESSAGES = "theta_comm_messages"
    private const val CHANNEL_TRANSFERS = "theta_comm_transfers"
    private const val CHANNEL_CONNECTION = "theta_comm_connection"
    const val CONNECTION_NOTIFICATION_ID = 7202

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_MESSAGES,
            "Theta-Comm messages",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Private alerts for new Theta-Comm activity"
            lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
        }
        context.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
        context.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(
                NotificationChannel(
                    CHANNEL_TRANSFERS,
                    "Theta-Comm transfers",
                    NotificationManager.IMPORTANCE_LOW,
                ).apply {
                    description = "Encrypted media preparation and transfer progress"
                    lockscreenVisibility = NotificationCompat.VISIBILITY_SECRET
                },
            )
        context.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(
                NotificationChannel(
                    CHANNEL_CONNECTION,
                    "Theta-Comm connection",
                    NotificationManager.IMPORTANCE_LOW,
                ).apply {
                    description = "Keeps Theta-Comm connected to the Theta-Space server"
                    lockscreenVisibility = NotificationCompat.VISIBILITY_SECRET
                    setShowBadge(false)
                },
            )
    }

    fun connectionNotification(context: Context): Notification {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            1,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(context, CHANNEL_CONNECTION)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle("Theta-Comm")
            .setContentText("Connected securely")
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .build()
    }

    fun transferForegroundInfo(
        context: Context,
        clientMessageId: String,
        preparing: Boolean,
    ): ForegroundInfo {
        val notification = NotificationCompat.Builder(context, CHANNEL_TRANSFERS)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle("Theta-Comm")
            .setContentText(
                if (preparing) "Encrypting media" else "Sending encrypted media",
            )
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(0, 0, true)
            .build()
        val id = clientMessageId.hashCode().and(0x7FFFFFFF).coerceAtLeast(1)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(id, notification)
        }
    }

    fun showPrivateWakeup(context: Context) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle("Theta-Comm")
            .setContentText("New encrypted message")
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        NotificationManagerCompat.from(context)
            .notify((System.currentTimeMillis() and 0x7FFFFFFF).toInt(), notification)
    }
}
