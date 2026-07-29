package net.thetaspace.communications.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import net.thetaspace.communications.ThetaCommApplication

class ThetaCommMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onMessageReceived(message: RemoteMessage) {
        val container = (application as ThetaCommApplication).container
        container.work.enqueueImmediateSync()
        ThetaCommNotifications.showPrivateWakeup(this)
    }

    override fun onNewToken(token: String) {
        val container = (application as ThetaCommApplication).container
        scope.launch {
            runCatching { container.repository.registerCurrentDevice() }
        }
    }
}
