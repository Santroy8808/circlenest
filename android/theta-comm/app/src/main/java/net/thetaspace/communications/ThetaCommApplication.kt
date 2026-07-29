package net.thetaspace.communications

import android.app.Application
import net.thetaspace.communications.push.ThetaCommNotifications

class ThetaCommApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        ThetaCommNotifications.createChannel(this)
        container.work.schedulePeriodicSync()
    }
}
