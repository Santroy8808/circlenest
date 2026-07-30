package net.thetaspace.communications.realtime

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import net.thetaspace.communications.ThetaCommApplication
import net.thetaspace.communications.push.ThetaCommNotifications

class ThetaCommConnectionService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        val serviceType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
        } else {
            0
        }
        ServiceCompat.startForeground(
            this,
            ThetaCommNotifications.CONNECTION_NOTIFICATION_ID,
            ThetaCommNotifications.connectionNotification(this),
            serviceType,
        )
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        val app = application as ThetaCommApplication
        scope.launch {
            val session = app.container.sessionStore.current()
            if (session?.commDeviceId == null) {
                stopSelf()
            } else {
                app.container.realtime.start()
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        (application as ThetaCommApplication).container.realtime.stop()
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        fun start(context: Context) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, ThetaCommConnectionService::class.java),
            )
        }

        fun stop(context: Context) {
            context.stopService(
                Intent(context, ThetaCommConnectionService::class.java),
            )
        }
    }
}
