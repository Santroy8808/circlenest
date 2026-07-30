package net.thetaspace.communications.realtime

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.thetaspace.communications.BuildConfig
import net.thetaspace.communications.push.ThetaCommNotifications
import net.thetaspace.communications.security.SessionStore
import net.thetaspace.communications.work.ThetaCommWork
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources

class ThetaCommRealtime(
    context: Context,
    private val httpClient: OkHttpClient,
    private val sessionStore: SessionStore,
    private val work: ThetaCommWork,
) {
    private val preferences = context.getSharedPreferences(
        "theta_comm_realtime_v2",
        Context.MODE_PRIVATE,
    )
    private val notificationContext = context.applicationContext
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var startup: Job? = null
    private var eventSource: EventSource? = null
    @Volatile
    private var started = false
    @Volatile
    private var activeUserId: String? = null
    private var reconnectAttempt = 0

    fun start() {
        started = true
        connect()
    }

    private fun connect(delayMs: Long = 0) {
        if (startup?.isActive == true || eventSource != null) return
        startup = scope.launch {
            if (delayMs > 0) delay(delayMs)
            if (!started) return@launch
            val session = sessionStore.current() ?: return@launch
            val commDeviceId = session.commDeviceId ?: return@launch
            activeUserId = session.userId
            val cursor = preferences.getString(cursorKey(session.userId), null)
            work.enqueueImmediateSync()
            val url = buildString {
                append(BuildConfig.THETA_API_BASE_URL.trimEnd('/'))
                append("/api/mobile/comm/events?deviceId=")
                append(commDeviceId)
                if (cursor != null) {
                    append("&cursor=")
                    append(cursor)
                }
            }
            val request = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer ${session.accessToken}")
                .header("X-Theta-Device-Id", session.stableDeviceId)
                .header("Accept", "text/event-stream")
                .build()
            eventSource = EventSources.createFactory(httpClient)
                .newEventSource(request, Listener())
            startup = null
        }
    }

    fun stop() {
        started = false
        startup?.cancel()
        startup = null
        eventSource?.cancel()
        eventSource = null
        activeUserId = null
    }

    private inner class Listener : EventSourceListener() {
        override fun onEvent(
            eventSource: EventSource,
            id: String?,
            type: String?,
            data: String,
        ) {
            work.enqueueImmediateSync()
            if (type != "sync") return
            val payload = runCatching { json.parseToJsonElement(data).jsonObject }
                .getOrNull()
                ?: return
            val cursor = payload["cursor"]?.jsonPrimitive?.content
            val userId = activeUserId
            if (cursor != null && userId != null) {
                preferences.edit().putString(cursorKey(userId), cursor).apply()
            }
            if (
                payload["incomingMessage"]?.jsonPrimitive?.booleanOrNull == true
            ) {
                ThetaCommNotifications.showPrivateWakeup(notificationContext)
            }
        }

        override fun onOpen(eventSource: EventSource, response: Response) {
            reconnectAttempt = 0
        }

        override fun onClosed(eventSource: EventSource) {
            this@ThetaCommRealtime.eventSource = null
            scheduleReconnect()
        }

        override fun onFailure(
            eventSource: EventSource,
            t: Throwable?,
            response: Response?,
        ) {
            this@ThetaCommRealtime.eventSource = null
            scheduleReconnect()
        }
    }

    private fun scheduleReconnect() {
        if (!started) return
        reconnectAttempt = (reconnectAttempt + 1).coerceAtMost(6)
        val delayMs = (1_000L shl (reconnectAttempt - 1)).coerceAtMost(30_000L)
        connect(delayMs)
    }

    private fun cursorKey(userId: String) = "cursor_$userId"
}
