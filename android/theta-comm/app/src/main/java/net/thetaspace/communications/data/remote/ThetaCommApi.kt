package net.thetaspace.communications.data.remote

import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import net.thetaspace.communications.BuildConfig
import net.thetaspace.communications.security.SessionStore
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class ThetaCommApiException(
    val statusCode: Int,
    val errorCode: String?,
    override val message: String,
) : IOException(message)

class ThetaCommApi(
    private val httpClient: OkHttpClient,
    private val sessionStore: SessionStore,
    private val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    },
) {
    suspend fun login(request: LoginRequestDto): LoginResponseDto =
        post(
            "/api/mobile/login",
            request,
            authenticated = false,
            deviceHeader = request.deviceId,
        )

    suspend fun sync(deviceId: String, cursor: String?): SyncResponseDto {
        val query = buildString {
            append("?deviceId=")
            append(deviceId)
            append("&limit=200")
            if (cursor != null) {
                append("&cursor=")
                append(cursor)
            }
        }
        return get("/api/mobile/comm/sync$query")
    }

    suspend fun registerDevice(request: RegisterDeviceRequestDto): RegisterDeviceResponseDto =
        post("/api/mobile/comm/devices", request)

    suspend fun listDevices(): DeviceListResponseDto = get("/api/mobile/comm/devices")

    suspend fun preKeyBundles(
        userIds: List<String>,
        verifierDeviceId: String,
    ): PreKeyBundlesResponseDto {
        val query = userIds.joinToString(",")
        return get(
            "/api/mobile/comm/devices/prekeys?deviceId=$verifierDeviceId&userIds=$query",
        )
    }

    suspend fun createDirectConversation(targetUserId: String): CreateConversationResponseDto =
        post(
            "/api/mobile/comm/conversations",
            CreateDirectConversationRequestDto(targetUserId = targetUserId),
        )

    suspend fun sendMessage(request: SendMessageRequestDto): SendMessageResponseDto =
        post("/api/mobile/comm/messages", request)

    suspend fun acknowledge(request: ReceiptRequestDto): OkResponseDto =
        post("/api/mobile/comm/receipts", request)

    suspend fun setTyping(request: TypingRequestDto): OkResponseDto =
        post("/api/mobile/comm/typing", request)

    suspend fun createUpload(request: CreateUploadRequestDto): CreateUploadResponseDto =
        post("/api/mobile/comm/uploads", request)

    suspend fun requestUploadPart(request: UploadPartRequestDto): UploadPartResponseDto =
        post("/api/mobile/comm/uploads", request)

    suspend fun recordUploadPart(request: RecordUploadPartRequestDto): OkResponseDto =
        post("/api/mobile/comm/uploads", request)

    suspend fun completeUpload(request: CompleteUploadRequestDto): OkResponseDto =
        post("/api/mobile/comm/uploads", request)

    private suspend inline fun <reified T> get(path: String): T =
        execute("GET", path, null)

    private suspend inline fun <reified B, reified T> post(
        path: String,
        body: B,
        authenticated: Boolean = true,
        deviceHeader: String? = null,
    ): T = execute(
        "POST",
        path,
        json.encodeToString(body),
        authenticated,
        deviceHeader,
    )

    private suspend inline fun <reified T> execute(
        method: String,
        path: String,
        body: String?,
        authenticated: Boolean = true,
        deviceHeader: String? = null,
    ): T = withContext(Dispatchers.IO) {
        val builder = Request.Builder()
            .url(BuildConfig.THETA_API_BASE_URL.trimEnd('/') + path)
            .header("Accept", "application/json")

        if (authenticated) {
            val session = sessionStore.current()
                ?: throw ThetaCommApiException(401, "LOGIN_REQUIRED", "Login required.")
            builder
                .header("Authorization", "Bearer ${session.accessToken}")
                .header("X-Theta-Device-Id", session.stableDeviceId)
        } else if (deviceHeader != null) {
            builder.header("X-Theta-Device-Id", deviceHeader)
        }

        val requestBody = body?.toRequestBody(JSON)
        builder.method(method, if (method == "GET") null else requestBody)

        httpClient.newCall(builder.build()).execute().use { response ->
            val responseBody = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val error = runCatching {
                    json.decodeFromString<ApiErrorDto>(responseBody)
                }.getOrNull()
                throw ThetaCommApiException(
                    response.code,
                    error?.code,
                    error?.error ?: "Theta-Space request failed (${response.code}).",
                )
            }
            json.decodeFromString<T>(responseBody)
        }
    }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
