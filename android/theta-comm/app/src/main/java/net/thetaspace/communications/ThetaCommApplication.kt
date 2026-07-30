package net.thetaspace.communications

import android.app.Application
import net.thetaspace.communications.push.ThetaCommNotifications

class ThetaCommApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        clearEphemeralPlaintext()
        container = AppContainer(this)
        ThetaCommNotifications.createChannels(this)
        container.work.schedulePeriodicSync()
    }

    private fun clearEphemeralPlaintext() {
        listOf("theta_comm_open", "theta_comm_video").forEach { directory ->
            cacheDir.resolve(directory).deleteRecursively()
        }
    }
}
