package net.thetaspace.communications.realtime

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import net.thetaspace.communications.ThetaCommApplication

class ThetaCommBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (
            intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val app = context.applicationContext as ThetaCommApplication
                if (app.container.sessionStore.current()?.commDeviceId != null) {
                    ThetaCommConnectionService.start(context)
                }
            } finally {
                pending.finish()
            }
        }
    }
}
