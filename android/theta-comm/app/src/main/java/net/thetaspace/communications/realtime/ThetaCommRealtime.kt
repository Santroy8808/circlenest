package net.thetaspace.communications.realtime

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import net.thetaspace.communications.BuildConfig
import net.thetaspace.communications.security.SessionStore
import net.thetaspace.communications.work.ThetaCommWork
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources

class ThetaCommRealtime(
    private val httpClient: OkHttpClient,
    private val sessionStore: SessionStore,
    private val work: ThetaCommWork,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var startup: Job? = null
    private var eventSource: EventSource? = null

    fun start() {
        if (startup?.isActive == true || eventSource != null) return
        startup = scope.launch {
            val session = sessionStore.current() ?: return@launch
            val commDeviceId = session.commDeviceId ?: return@launch
            work.enqueueImmediateSync()
            val request = Request.Builder()
                .url(
                    BuildConfig.THETA_API_BASE_URL.trimEnd('/') +
                        "/api/mobile/comm/events?deviceId=$commDeviceId",
                )
                .header("Authorization", "Bearer ${session.accessToken}")
                .header("X-Theta-Device-Id", session.stableDeviceId)
                .header("Accept", "text/event-stream")
                .build()
            eventSource = EventSources.createFactory(httpClient)
                .newEventSource(request, Listener())
        }
    }

    fun stop() {
        startup?.cancel()
        startup = null
        eventSource?.cancel()
        eventSource = null
    }

    private inner class Listener : EventSourceListener() {
        override fun onEvent(
            eventSource: EventSource,
            id: String?,
            type: String?,
            data: String,
        ) {
            work.enqueueImmediateSync()
        }

        override fun onFailure(
            eventSource: EventSource,
            throwable: Throwable?,
            response: Response?,
        ) {
            this@ThetaCommRealtime.eventSource = null
        }
    }
}
