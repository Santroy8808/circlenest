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

    suspend fun revokeDevice(deviceId: String): RevokeDeviceResponseDto =
        delete("/api/mobile/comm/devices", RevokeDeviceRequestDto(deviceId))

    suspend fun replenishPreKeys(
        request: ReplenishPreKeysRequestDto,
    ): ReplenishPreKeysResponseDto =
        post("/api/mobile/comm/devices/prekeys", request)

    suspend fun preKeyStatus(deviceId: String): PreKeyStatusResponseDto =
        get("/api/mobile/comm/devices/prekeys?mode=status&deviceId=$deviceId")

    suspend fun preKeyBundles(
        userIds: List<String>,
        verifierDeviceId: String,
        deviceIds: List<String>? = null,
    ): PreKeyBundlesResponseDto {
        val users = userIds.joinToString(",")
        val devices = deviceIds
            ?.takeIf(List<String>::isNotEmpty)
            ?.joinToString(",")
            ?.let { "&deviceIds=$it" }
            .orEmpty()
        return get(
            "/api/mobile/comm/devices/prekeys?deviceId=$verifierDeviceId&userIds=$users$devices",
        )
    }

    suspend fun recipientDevices(userIds: List<String>): RecipientDevicesResponseDto {
        val query = userIds.joinToString(",")
        return get("/api/mobile/comm/devices/prekeys?mode=devices&userIds=$query")
    }

    suspend fun createDirectConversation(targetUserId: String): CreateConversationResponseDto =
        post(
            "/api/mobile/comm/conversations",
            CreateDirectConversationRequestDto(targetUserId = targetUserId),
        )

    suspend fun createGroupConversation(
        request: CreateGroupConversationRequestDto,
    ): CreateConversationResponseDto =
        post("/api/mobile/comm/conversations", request)

    suspend fun updateConversationPreference(
        conversationId: String,
        request: ConversationPreferenceRequestDto,
    ): ConversationPreferenceResponseDto =
        patch("/api/mobile/comm/conversations/$conversationId", request)

    suspend fun clearConversationMute(
        conversationId: String,
    ): ConversationPreferenceResponseDto =
        patch(
            "/api/mobile/comm/conversations/$conversationId",
            ClearConversationMuteRequestDto(),
        )

    suspend fun addGroupMembers(
        conversationId: String,
        userIds: List<String>,
    ): GroupCommandResponseDto =
        patch(
            "/api/mobile/comm/conversations/$conversationId/group",
            AddGroupMembersRequestDto(userIds = userIds),
        )

    suspend fun removeGroupMember(
        conversationId: String,
        userId: String,
    ): GroupCommandResponseDto =
        patch(
            "/api/mobile/comm/conversations/$conversationId/group",
            RemoveGroupMemberRequestDto(userId = userId),
        )

    suspend fun setGroupRole(
        conversationId: String,
        userId: String,
        role: String,
    ): GroupCommandResponseDto =
        patch(
            "/api/mobile/comm/conversations/$conversationId/group",
            SetGroupRoleRequestDto(userId = userId, role = role),
        )

    suspend fun leaveGroup(conversationId: String): GroupCommandResponseDto =
        patch(
            "/api/mobile/comm/conversations/$conversationId/group",
            LeaveGroupRequestDto(),
        )

    suspend fun renameGroup(
        conversationId: String,
        request: RenameGroupRequestDto,
    ): GroupCommandResponseDto =
        patch("/api/mobile/comm/conversations/$conversationId/group", request)

    suspend fun setGroupAvatar(
        conversationId: String,
        messageId: String?,
    ): GroupCommandResponseDto =
        patch(
            "/api/mobile/comm/conversations/$conversationId/group",
            SetGroupAvatarRequestDto(messageId = messageId),
        )

    suspend fun searchContacts(query: String): ContactSearchResponseDto =
        get("/api/mobile/contacts/search?q=${java.net.URLEncoder.encode(query, "UTF-8")}")

    suspend fun sendMessage(request: SendMessageRequestDto): SendMessageResponseDto =
        post("/api/mobile/comm/messages", request)

    suspend fun acknowledge(request: ReceiptRequestDto): OkResponseDto =
        post("/api/mobile/comm/receipts", request)

    suspend fun setTyping(request: TypingRequestDto): OkResponseDto =
        post("/api/mobile/comm/typing", request)

    suspend fun createUpload(request: CreateUploadRequestDto): CreateUploadResponseDto =
        post("/api/mobile/comm/uploads", request)

    suspend fun uploadPart(
        uploadId: String,
        partNumber: Int,
        bytes: ByteArray,
    ): OkResponseDto = putBinary(
        "/api/mobile/comm/uploads/$uploadId/parts/$partNumber",
        bytes,
    )

    suspend fun uploadThumbnail(
        uploadId: String,
        bytes: ByteArray,
    ): OkResponseDto = putBinary(
        "/api/mobile/comm/uploads/$uploadId/thumbnail",
        bytes,
    )

    suspend fun completeUpload(request: CompleteUploadRequestDto): OkResponseDto =
        post("/api/mobile/comm/uploads", request)

    suspend fun uploadStatus(uploadId: String): UploadStatusResponseDto =
        post("/api/mobile/comm/uploads", UploadStatusRequestDto(uploadId = uploadId))

    suspend fun cancelUpload(uploadId: String): OkResponseDto =
        post("/api/mobile/comm/uploads", CancelUploadRequestDto(uploadId = uploadId))

    suspend fun attachmentDownload(attachmentId: String): AttachmentDownloadDto =
        get("/api/mobile/comm/attachments/$attachmentId")

    suspend fun authenticatedBinaryGet(
        url: String,
        rangeStart: Long? = null,
    ): Request {
        val session = sessionStore.current()
            ?: throw ThetaCommApiException(401, "LOGIN_REQUIRED", "Login required.")
        if (!url.startsWith("/api/mobile/comm/attachments/")) {
            throw ThetaCommApiException(
                400,
                "INVALID_ATTACHMENT_URL",
                "Attachment download must use the Theta-Space server.",
            )
        }
        val absoluteUrl = BuildConfig.THETA_API_BASE_URL.trimEnd('/') + url
        return Request.Builder()
            .url(absoluteUrl)
            .header("Authorization", "Bearer ${session.accessToken}")
            .header("X-Theta-Device-Id", session.stableDeviceId)
            .apply {
                if (rangeStart != null && rangeStart > 0) {
                    header("Range", "bytes=$rangeStart-")
                }
            }
            .get()
            .build()
    }

    suspend fun blockUser(targetUserId: String): OkResponseDto =
        post("/api/mobile/comm/safety", BlockUserRequestDto(targetUserId = targetUserId))

    suspend fun reportMessage(
        request: ReportMessageRequestDto,
    ): ReportMessageResponseDto =
        post("/api/mobile/comm/safety", request)

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

    private suspend inline fun <reified B, reified T> patch(
        path: String,
        body: B,
    ): T = execute(
        "PATCH",
        path,
        json.encodeToString(body),
    )

    private suspend inline fun <reified B, reified T> delete(
        path: String,
        body: B,
    ): T = execute(
        "DELETE",
        path,
        json.encodeToString(body),
    )

    private suspend inline fun <reified T> putBinary(
        path: String,
        bytes: ByteArray,
    ): T = withContext(Dispatchers.IO) {
        val session = sessionStore.current()
            ?: throw ThetaCommApiException(401, "LOGIN_REQUIRED", "Login required.")
        val request = Request.Builder()
            .url(BuildConfig.THETA_API_BASE_URL.trimEnd('/') + path)
            .header("Accept", "application/json")
            .header("Authorization", "Bearer ${session.accessToken}")
            .header("X-Theta-Device-Id", session.stableDeviceId)
            .put(bytes.toRequestBody(BINARY))
            .build()
        httpClient.newCall(request).execute().use { response ->
            val responseBody = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val error = runCatching {
                    json.decodeFromString<ApiErrorDto>(responseBody)
                }.getOrNull()
                throw ThetaCommApiException(
                    response.code,
                    error?.code,
                    error?.error ?: "Encrypted transfer failed (${response.code}).",
                )
            }
            json.decodeFromString<T>(responseBody)
        }
    }

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
        private val BINARY = "application/octet-stream".toMediaType()
    }
}
