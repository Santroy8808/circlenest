package net.thetaspace.communications.data

import androidx.room.withTransaction
import android.net.Uri
import android.util.Base64
import java.time.Instant
import java.util.UUID
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import net.thetaspace.communications.data.local.ConversationEntity
import net.thetaspace.communications.data.local.AttachmentEntity
import net.thetaspace.communications.data.local.AttachmentStates
import net.thetaspace.communications.data.local.ConversationSummary
import net.thetaspace.communications.data.local.MessageEntity
import net.thetaspace.communications.data.local.MessageKinds
import net.thetaspace.communications.data.local.MessageStates
import net.thetaspace.communications.data.local.DraftEntity
import net.thetaspace.communications.data.local.ParticipantEntity
import net.thetaspace.communications.data.local.PendingOperationEntity
import net.thetaspace.communications.data.local.ReceiptEntity
import net.thetaspace.communications.data.local.SyncStateEntity
import net.thetaspace.communications.data.local.ThetaCommDatabase
import net.thetaspace.communications.data.remote.LoginRequestDto
import net.thetaspace.communications.data.remote.CreateGroupConversationRequestDto
import net.thetaspace.communications.data.remote.ConversationPreferenceRequestDto
import net.thetaspace.communications.data.remote.RenameGroupRequestDto
import net.thetaspace.communications.data.remote.ReportMessageRequestDto
import net.thetaspace.communications.data.remote.ContactDto
import net.thetaspace.communications.data.remote.DeviceDto
import net.thetaspace.communications.data.remote.MessageDto
import net.thetaspace.communications.data.remote.ReceiptRequestDto
import net.thetaspace.communications.data.remote.SendMessageRequestDto
import net.thetaspace.communications.data.remote.ThetaCommApi
import net.thetaspace.communications.data.remote.ThetaCommApiException
import net.thetaspace.communications.data.remote.TypingRequestDto
import net.thetaspace.communications.security.LocalKeyCipher
import net.thetaspace.communications.security.AttachmentCrypto
import net.thetaspace.communications.security.SessionStore
import net.thetaspace.communications.security.SignalCryptoEngine
import net.thetaspace.communications.work.ThetaCommWork

@Serializable
data class EncryptedMessageContent(
    val version: Int = 2,
    val clientMessageId: String,
    val body: String? = null,
    val attachmentKeys: List<EncryptedAttachmentKey> = emptyList(),
    val reaction: String? = null,
    val groupTitle: String? = null,
)

@Serializable
data class EncryptedAttachmentKey(
    val attachmentId: String,
    val filename: String,
    val mimeType: String,
    val byteSize: Long,
    val key: String,
    val nonce: String,
    val thumbnailKey: String? = null,
    val thumbnailNonce: String? = null,
    val caption: String? = null,
)

data class ConversationListItem(
    val id: String,
    val type: String,
    val title: String,
    val preview: String,
    val lastMessageAt: Long?,
    val unreadCount: Int,
    val isPinned: Boolean,
    val isArchived: Boolean,
    val mutedUntil: Long?,
    val lastMessageState: String?,
)

data class MessageListItem(
    val clientMessageId: String,
    val serverMessageId: String?,
    val senderUserId: String,
    val kind: String,
    val body: String?,
    val createdAt: Long,
    val state: String,
    val isDeleted: Boolean,
    val isEdited: Boolean,
    val replyToMessageId: String?,
    val eventTargetMessageId: String?,
    val attachments: List<AttachmentListItem>,
    val reactions: List<ReactionListItem>,
    val receipts: List<ReceiptListItem>,
)

data class ReceiptListItem(
    val userId: String,
    val deviceId: String,
    val deliveredAt: Long?,
    val seenAt: Long?,
)

data class ReactionListItem(
    val emoji: String,
    val userIds: List<String>,
)

data class AttachmentListItem(
    val id: String,
    val kind: String,
    val filename: String,
    val caption: String?,
    val mimeType: String,
    val byteSize: Long,
    val sourceUri: String?,
    val encryptedFilePath: String?,
    val encryptedThumbnailPath: String?,
    val uploadedBytes: Long,
    val encryptedSizeBytes: Long?,
    val state: String,
)

data class ConversationHeader(
    val id: String,
    val type: String,
    val title: String,
    val avatarAttachmentId: String?,
    val participants: List<ParticipantEntity>,
    val isPinned: Boolean,
    val isArchived: Boolean,
    val mutedUntil: Long?,
)

class ThetaCommRepository(
    private val database: ThetaCommDatabase,
    private val api: ThetaCommApi,
    private val sessionStore: SessionStore,
    private val localCipher: LocalKeyCipher,
    private val signalCrypto: SignalCryptoEngine,
    private val attachmentCrypto: AttachmentCrypto,
    private val attachmentUploader: EncryptedAttachmentUploader,
    private val attachmentDownloader: EncryptedAttachmentDownloader,
    private val work: ThetaCommWork,
    private val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    },
) {
    private val dao = database.thetaCommDao()
    private val typingByConversation = MutableStateFlow<Map<String, Set<String>>>(emptyMap())
    private val encryptionMutex = Mutex()

    fun conversations(archived: Boolean = false): Flow<List<ConversationListItem>> =
        dao.observeConversationSummaries(archived).map { summaries ->
            summaries.map(::toListItem)
        }

    fun messages(conversationId: String): Flow<List<MessageListItem>> =
        combine(
            dao.observeMessages(conversationId),
            dao.observeConversationAttachments(conversationId),
            dao.observeConversationReceipts(conversationId),
        ) { messages, attachments, receipts ->
            val attachmentsByMessage = attachments.groupBy(AttachmentEntity::clientMessageId)
            val receiptsByServerMessage = receipts.groupBy(ReceiptEntity::messageId)
            val itemsByClientId = messages
                .filterNot { it.kind in EVENT_MESSAGE_KINDS }
                .associate { message ->
                    message.clientMessageId to MessageListItem(
                    clientMessageId = message.clientMessageId,
                    serverMessageId = message.serverMessageId,
                    senderUserId = message.senderUserId,
                    kind = message.kind,
                    body = message.sealedBody?.let(::openSafely)?.let { body ->
                        if (message.kind == MessageKinds.SYSTEM &&
                            body.startsWith(GROUP_TITLE_PREFIX)
                        ) {
                            "Chat group renamed to ${body.removePrefix(GROUP_TITLE_PREFIX)}."
                        } else if (
                            message.kind == MessageKinds.SYSTEM &&
                            body == GROUP_AVATAR_EVENT
                        ) {
                            "Chat group image updated."
                        } else if (
                            message.kind == MessageKinds.SYSTEM &&
                            body == GROUP_AVATAR_REMOVED_EVENT
                        ) {
                            "Chat group image removed."
                        } else {
                            body
                        }
                    },
                    createdAt = message.createdAt,
                    state = message.state,
                    isDeleted = message.deletedAt != null,
                    isEdited = message.editedAt != null,
                    replyToMessageId = message.replyToMessageId,
                    eventTargetMessageId = message.eventTargetMessageId,
                    attachments = attachmentsByMessage[message.clientMessageId]
                        .orEmpty()
                        .map(::toAttachmentListItem),
                    reactions = emptyList(),
                    receipts = message.serverMessageId
                        ?.let(receiptsByServerMessage::get)
                        .orEmpty()
                        .map {
                            ReceiptListItem(
                                userId = it.userId,
                                deviceId = it.deviceId,
                                deliveredAt = it.deliveredAt,
                                seenAt = it.seenAt,
                            )
                        },
                )
                }.toMutableMap()
            val clientIdByServerId = messages.mapNotNull { message ->
                message.serverMessageId?.let { it to message.clientMessageId }
            }.toMap()
            val reactionsByTarget = mutableMapOf<String, MutableMap<String, String>>()
            messages
                .filter { it.kind in EVENT_MESSAGE_KINDS && it.state != MessageStates.FAILED }
                .sortedWith(compareBy<MessageEntity> { it.sequence ?: Long.MAX_VALUE }.thenBy { it.createdAt })
                .forEach { event ->
                    val targetClientId = event.eventTargetMessageId
                        ?.let(clientIdByServerId::get)
                        ?: return@forEach
                    val target = itemsByClientId[targetClientId] ?: return@forEach
                    when (event.kind) {
                        MessageKinds.EDIT -> itemsByClientId[targetClientId] = target.copy(
                            body = event.sealedBody?.let(::openSafely) ?: target.body,
                            isEdited = true,
                        )
                        MessageKinds.DELETE -> itemsByClientId[targetClientId] = target.copy(
                            isDeleted = true,
                        )
                        MessageKinds.REACTION -> {
                            val byUser = reactionsByTarget.getOrPut(targetClientId) {
                                mutableMapOf()
                            }
                            val emoji = event.sealedBody?.let(::openSafely).orEmpty()
                            if (emoji.isBlank()) byUser.remove(event.senderUserId)
                            else byUser[event.senderUserId] = emoji
                        }
                    }
                }
            reactionsByTarget.forEach { (targetClientId, byUser) ->
                val target = itemsByClientId[targetClientId] ?: return@forEach
                val reactions = byUser.entries
                    .groupBy(Map.Entry<String, String>::value)
                    .map { (emoji, entries) ->
                        ReactionListItem(emoji, entries.map(Map.Entry<String, String>::key))
                    }
                itemsByClientId[targetClientId] = target.copy(reactions = reactions)
            }
            messages.mapNotNull { itemsByClientId[it.clientMessageId] }
        }

    private fun toAttachmentListItem(attachment: AttachmentEntity) = AttachmentListItem(
        id = attachment.id,
        kind = attachment.kind,
        filename = openSafely(attachment.sealedFilename),
        caption = attachment.sealedCaption?.let(::openSafely),
        mimeType = attachment.mimeType,
        byteSize = attachment.byteSize,
        sourceUri = attachment.sourceUri,
        encryptedFilePath = attachment.encryptedFilePath,
        encryptedThumbnailPath = attachment.encryptedThumbnailPath,
        uploadedBytes = attachment.uploadedBytes,
        encryptedSizeBytes = attachment.encryptedSizeBytes,
        state = attachment.state,
    )

    fun conversationHeader(conversationId: String): Flow<ConversationHeader?> =
        combine(
            dao.observeConversation(conversationId),
            dao.observeParticipants(conversationId),
        ) { conversation, participants ->
            conversation?.let {
                ConversationHeader(
                    id = it.id,
                    type = it.type,
                    title = it.sealedTitle?.let(::openSafely) ?: "Conversation",
                    avatarAttachmentId = it.sealedAvatarReference?.let(::openSafely),
                    participants = participants,
                    isPinned = it.isPinned,
                    isArchived = it.isArchived,
                    mutedUntil = it.mutedUntil,
                )
            }
        }

    suspend fun setConversationArchived(conversationId: String, archived: Boolean) {
        applyConversationPreference(
            conversationId,
            ConversationPreferenceRequestDto(archived = archived),
        )
    }

    suspend fun setConversationPinned(conversationId: String, pinned: Boolean) {
        applyConversationPreference(
            conversationId,
            ConversationPreferenceRequestDto(pinned = pinned),
        )
    }

    suspend fun muteConversation(conversationId: String, until: Long) {
        applyConversationPreference(
            conversationId,
            ConversationPreferenceRequestDto(
                mutedUntil = Instant.ofEpochMilli(until).toString(),
            ),
        )
    }

    suspend fun unmuteConversation(conversationId: String) {
        val response = api.clearConversationMute(conversationId)
        storeConversationPreference(conversationId, response.preferences)
    }

    private suspend fun applyConversationPreference(
        conversationId: String,
        request: ConversationPreferenceRequestDto,
    ) {
        val response = api.updateConversationPreference(conversationId, request)
        storeConversationPreference(conversationId, response.preferences)
    }

    private suspend fun storeConversationPreference(
        conversationId: String,
        preferences: net.thetaspace.communications.data.remote.ConversationPreferencesDto,
    ) {
        dao.updateConversationPreference(
            conversationId = conversationId,
            archived = preferences.archived,
            pinned = preferences.pinned,
            mutedUntil = preferences.mutedUntil?.let(::parseTime),
            notificationLevel = preferences.notificationLevel,
            updatedAt = System.currentTimeMillis(),
        )
    }

    suspend fun addGroupMembers(conversationId: String, userIds: List<String>) {
        val result = api.addGroupMembers(conversationId, userIds.distinct())
        sync()
        if (result.systemMessageRequired) {
            queueSystemMessage(conversationId, "Chat group membership changed.")
        }
    }

    suspend fun removeGroupMember(conversationId: String, userId: String) {
        val result = api.removeGroupMember(conversationId, userId)
        sync()
        if (result.systemMessageRequired) {
            queueSystemMessage(conversationId, "Chat group membership changed.")
        }
    }

    suspend fun setGroupRole(conversationId: String, userId: String, role: String) {
        require(role in setOf("OWNER", "ADMIN", "MEMBER")) {
            "Invalid chat group role."
        }
        val result = api.setGroupRole(conversationId, userId, role)
        sync()
        if (result.systemMessageRequired) {
            queueSystemMessage(conversationId, "Chat group roles changed.")
        }
    }

    suspend fun leaveGroup(conversationId: String) {
        api.leaveGroup(conversationId)
        dao.deleteConversation(conversationId)
    }

    suspend fun renameGroup(conversationId: String, title: String) {
        val cleanTitle = title.trim()
        require(cleanTitle.length in 1..80) {
            "Enter a chat group name up to 80 characters."
        }
        val session = sessionStore.current() ?: error("Login required.")
        val localDeviceId = session.commDeviceId ?: error("Device registration required.")
        val participants = dao.activeParticipants(conversationId)
        val content = EncryptedMessageContent(
            clientMessageId = UUID.randomUUID().toString(),
            groupTitle = cleanTitle,
        )
        val envelopes = encryptForParticipants(
            plaintext = json.encodeToString(content).encodeToByteArray(),
            participantUserIds = participants.map(ParticipantEntity::userId).distinct(),
            localUserId = session.userId,
            localDeviceId = localDeviceId,
        )
        val result = api.renameGroup(
            conversationId,
            RenameGroupRequestDto(
                titleCiphertext = opaqueMetadataCiphertext(cleanTitle),
                metadataEnvelopes = envelopes,
            ),
        )
        if (result.systemMessageRequired) {
            queueSystemMessage(conversationId, "$GROUP_TITLE_PREFIX$cleanTitle")
        }
    }

    fun draft(conversationId: String): Flow<String> =
        dao.observeDraft(conversationId).map {
            it?.sealedText?.let(::openSafely).orEmpty()
        }

    fun typingUsers(conversationId: String): Flow<Set<String>> =
        typingByConversation.map { it[conversationId].orEmpty() }

    suspend fun login(identifier: String, password: String) {
        val stableDeviceId = sessionStore.installationId()
        val response = api.login(
            LoginRequestDto(
                email = identifier.trim(),
                password = password,
                deviceId = stableDeviceId,
            ),
        )
        sessionStore.saveLogin(response.token, response.user.id, stableDeviceId)
        try {
            registerCurrentDevice()
        } catch (error: Throwable) {
            sessionStore.clear()
            withContext(Dispatchers.IO) {
                database.clearAllTables()
                attachmentCrypto.clearLocalFiles()
            }
            throw error
        }
        work.schedulePeriodicSync()
        work.enqueueImmediateSync()
    }

    suspend fun registerCurrentDevice() {
        val session = sessionStore.current() ?: return
        val request = signalCrypto.registrationRequest(
            stableDeviceId = session.stableDeviceId,
        )
        val registered = api.registerDevice(request)
        sessionStore.bindCommDevice(registered.device.id)
    }

    suspend fun searchContacts(query: String): List<ContactDto> {
        val normalized = query.trim()
        if (normalized.length < 2) return emptyList()
        return api.searchContacts(normalized).people
    }

    suspend fun listDevices(): List<DeviceDto> = api.listDevices().devices

    suspend fun revokeDevice(deviceId: String) {
        val session = sessionStore.current() ?: error("Login required.")
        api.revokeDevice(deviceId)
        if (session.commDeviceId == deviceId) {
            logout()
        }
    }

    suspend fun blockUser(conversationId: String, targetUserId: String) {
        api.blockUser(targetUserId)
        setConversationArchived(conversationId, archived = true)
    }

    suspend fun reportMessage(
        clientMessageId: String,
        reason: String,
        description: String,
    ): String {
        val message = dao.message(clientMessageId) ?: error("Message is unavailable.")
        val serverMessageId = message.serverMessageId
            ?: error("Wait until the message is delivered before reporting it.")
        val response = api.reportMessage(
            ReportMessageRequestDto(
                conversationId = message.conversationId,
                messageId = serverMessageId,
                reason = reason.trim().take(120),
                description = description.trim().take(3_000),
            ),
        )
        return response.ticketId
    }

    suspend fun startDirectConversation(targetUserId: String): String {
        val response = api.createDirectConversation(targetUserId)
        sync()
        return response.conversation.id
    }

    suspend fun startGroupConversation(
        title: String,
        participantUserIds: List<String>,
    ): String {
        val cleanTitle = title.trim()
        require(cleanTitle.length in 1..80) {
            "Enter a chat group name up to 80 characters."
        }
        val targets = participantUserIds.distinct()
        require(targets.size in 2..99) {
            "Select at least two people for a chat group."
        }
        val session = sessionStore.current() ?: error("Login required.")
        val commDeviceId = session.commDeviceId ?: error("Device registration required.")
        val clientMessageId = UUID.randomUUID().toString()
        val content = EncryptedMessageContent(
            clientMessageId = clientMessageId,
            groupTitle = cleanTitle,
        )
        val plaintext = json.encodeToString(content).encodeToByteArray()
        val envelopes = encryptForParticipants(
            plaintext = plaintext,
            participantUserIds = (targets + session.userId).distinct(),
            localUserId = session.userId,
            localDeviceId = commDeviceId,
        )
        val response = api.createGroupConversation(
            CreateGroupConversationRequestDto(
                clientMessageId = clientMessageId,
                senderDeviceId = commDeviceId,
                clientCreatedAt = Instant.now().toString(),
                participantUserIds = targets,
                titleCiphertext = opaqueMetadataCiphertext(cleanTitle),
                metadataEnvelopes = envelopes,
            ),
        )
        sync()
        return response.conversation.id
    }

    suspend fun queueTextMessage(
        conversationId: String,
        text: String,
        replyToMessageId: String? = null,
    ): String {
        val normalized = text.trim()
        require(normalized.isNotEmpty()) { "Message cannot be empty." }
        val session = sessionStore.current() ?: error("Login required.")
        val commDeviceId = session.commDeviceId ?: error("Device registration required.")
        val conversation = dao.conversation(conversationId)
            ?: error("Conversation is unavailable.")
        val clientMessageId = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()

        database.withTransaction {
            dao.insertMessage(
                MessageEntity(
                    clientMessageId = clientMessageId,
                    serverMessageId = null,
                    conversationId = conversation.id,
                    senderUserId = session.userId,
                    senderDeviceId = commDeviceId,
                    kind = MessageKinds.TEXT,
                    sealedBody = localCipher.sealString(normalized),
                    serverCiphertext = null,
                    protocolVersion = 2,
                    membershipVersion = conversation.membershipVersion,
                    replyToMessageId = replyToMessageId,
                    eventTargetMessageId = null,
                    sequence = null,
                    createdAt = now,
                    acceptedAt = null,
                    editedAt = null,
                    deletedAt = null,
                    state = MessageStates.QUEUED,
                    retryCount = 0,
                    failureCode = null,
                ),
            )
            dao.upsertPendingOperation(
                PendingOperationEntity(
                    id = "send:$clientMessageId",
                    clientMessageId = clientMessageId,
                    type = "SEND_MESSAGE",
                    state = "QUEUED",
                    attempts = 0,
                    nextAttemptAt = now,
                    lastError = null,
                    createdAt = now,
                ),
            )
            dao.touchConversation(conversationId, now)
        }
        work.enqueueSend(clientMessageId)
        dao.deleteDraft(conversationId)
        return clientMessageId
    }

    suspend fun reactToMessage(clientMessageId: String, emoji: String) {
        require(emoji.length <= 16) { "Reaction is too long." }
        queueMessageEvent(clientMessageId, MessageKinds.REACTION, emoji)
    }

    suspend fun editMessage(clientMessageId: String, text: String) {
        val normalized = text.trim()
        require(normalized.isNotEmpty()) { "Message cannot be empty." }
        val target = dao.message(clientMessageId) ?: error("Message is unavailable.")
        require(System.currentTimeMillis() - target.createdAt <= EDIT_WINDOW_MS) {
            "Messages may be edited for 15 minutes."
        }
        queueMessageEvent(clientMessageId, MessageKinds.EDIT, normalized)
    }

    suspend fun deleteMessage(clientMessageId: String) {
        val target = dao.message(clientMessageId) ?: error("Message is unavailable.")
        require(System.currentTimeMillis() - target.createdAt <= DELETE_WINDOW_MS) {
            "Delete for everyone is available for 48 hours."
        }
        queueMessageEvent(clientMessageId, MessageKinds.DELETE, null)
    }

    private suspend fun queueMessageEvent(
        targetClientMessageId: String,
        kind: String,
        value: String?,
    ) {
        require(kind in EVENT_MESSAGE_KINDS) { "Unsupported message event." }
        val target = dao.message(targetClientMessageId) ?: error("Message is unavailable.")
        val targetServerId = target.serverMessageId
            ?: error("Wait until the message is sent before changing it.")
        val session = sessionStore.current() ?: error("Login required.")
        val commDeviceId = session.commDeviceId ?: error("Device registration required.")
        val conversation = dao.conversation(target.conversationId)
            ?: error("Conversation is unavailable.")
        val clientMessageId = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        database.withTransaction {
            dao.insertMessage(
                MessageEntity(
                    clientMessageId = clientMessageId,
                    serverMessageId = null,
                    conversationId = conversation.id,
                    senderUserId = session.userId,
                    senderDeviceId = commDeviceId,
                    kind = kind,
                    sealedBody = value?.let(localCipher::sealString),
                    serverCiphertext = null,
                    protocolVersion = 2,
                    membershipVersion = conversation.membershipVersion,
                    replyToMessageId = null,
                    eventTargetMessageId = targetServerId,
                    sequence = null,
                    createdAt = now,
                    acceptedAt = null,
                    editedAt = null,
                    deletedAt = null,
                    state = MessageStates.QUEUED,
                    retryCount = 0,
                    failureCode = null,
                ),
            )
            dao.upsertPendingOperation(
                PendingOperationEntity(
                    id = "send:$clientMessageId",
                    clientMessageId = clientMessageId,
                    type = "SEND_MESSAGE",
                    state = "QUEUED",
                    attempts = 0,
                    nextAttemptAt = now,
                    lastError = null,
                    createdAt = now,
                ),
            )
        }
        work.enqueueSend(clientMessageId)
    }

    private suspend fun queueSystemMessage(
        conversationId: String,
        body: String,
    ): String {
        val session = sessionStore.current() ?: error("Login required.")
        val commDeviceId = session.commDeviceId ?: error("Device registration required.")
        val conversation = dao.conversation(conversationId)
            ?: error("Conversation is unavailable.")
        val clientMessageId = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        database.withTransaction {
            dao.insertMessage(
                MessageEntity(
                    clientMessageId = clientMessageId,
                    serverMessageId = null,
                    conversationId = conversationId,
                    senderUserId = session.userId,
                    senderDeviceId = commDeviceId,
                    kind = MessageKinds.SYSTEM,
                    sealedBody = localCipher.sealString(body),
                    serverCiphertext = null,
                    protocolVersion = 2,
                    membershipVersion = conversation.membershipVersion,
                    replyToMessageId = null,
                    eventTargetMessageId = null,
                    sequence = null,
                    createdAt = now,
                    acceptedAt = null,
                    editedAt = null,
                    deletedAt = null,
                    state = MessageStates.QUEUED,
                    retryCount = 0,
                    failureCode = null,
                ),
            )
            dao.upsertPendingOperation(
                PendingOperationEntity(
                    id = "send:$clientMessageId",
                    clientMessageId = clientMessageId,
                    type = "SEND_MESSAGE",
                    state = "QUEUED",
                    attempts = 0,
                    nextAttemptAt = now,
                    lastError = null,
                    createdAt = now,
                ),
            )
        }
        work.enqueueSend(clientMessageId)
        return clientMessageId
    }

    suspend fun queueAttachments(
        conversationId: String,
        uriValues: List<String>,
        caption: String = "",
        voiceNote: Boolean = false,
    ): String = queueAttachmentsInternal(
        conversationId = conversationId,
        uriValues = uriValues,
        caption = caption,
        voiceNote = voiceNote,
    )

    suspend fun queueGroupAvatar(conversationId: String, uriValue: String): String {
        val source = attachmentCrypto.inspect(Uri.parse(uriValue))
        require(source.mimeType.startsWith("image/")) {
            "Choose an image for the chat group."
        }
        require(source.byteSize <= MAX_GROUP_AVATAR_BYTES) {
            "Chat group images must be no larger than 10 MB."
        }
        return queueAttachmentsInternal(
            conversationId = conversationId,
            uriValues = listOf(uriValue),
            caption = "",
            voiceNote = false,
            forcedKind = MessageKinds.SYSTEM,
            systemBody = GROUP_AVATAR_EVENT,
        )
    }

    suspend fun removeGroupAvatar(conversationId: String): String =
        queueSystemMessage(conversationId, GROUP_AVATAR_REMOVED_EVENT)

    private suspend fun queueAttachmentsInternal(
        conversationId: String,
        uriValues: List<String>,
        caption: String,
        voiceNote: Boolean,
        forcedKind: String? = null,
        systemBody: String? = null,
    ): String {
        require(uriValues.isNotEmpty()) { "Choose at least one attachment." }
        require(uriValues.size <= 10) { "A message can include at most 10 attachments." }
        val session = sessionStore.current() ?: error("Login required.")
        val commDeviceId = session.commDeviceId ?: error("Device registration required.")
        val conversation = dao.conversation(conversationId)
            ?: error("Conversation is unavailable.")
        val sources = uriValues.map { attachmentCrypto.inspect(Uri.parse(it)) }
        val kind = forcedKind ?: when {
            voiceNote -> MessageKinds.VOICE
            sources.size > 1 -> MessageKinds.FILE
            sources.single().mimeType == "image/gif" -> MessageKinds.GIF
            sources.single().mimeType.startsWith("image/") -> MessageKinds.IMAGE
            sources.single().mimeType.startsWith("video/") -> MessageKinds.VIDEO
            else -> MessageKinds.FILE
        }
        val clientMessageId = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        database.withTransaction {
            dao.insertMessage(
                MessageEntity(
                    clientMessageId = clientMessageId,
                    serverMessageId = null,
                    conversationId = conversation.id,
                    senderUserId = session.userId,
                    senderDeviceId = commDeviceId,
                    kind = kind,
                    sealedBody = (systemBody ?: caption.trim()).takeIf(String::isNotEmpty)
                        ?.let(localCipher::sealString),
                    serverCiphertext = null,
                    protocolVersion = 2,
                    membershipVersion = conversation.membershipVersion,
                    replyToMessageId = null,
                    eventTargetMessageId = null,
                    sequence = null,
                    createdAt = now,
                    acceptedAt = null,
                    editedAt = null,
                    deletedAt = null,
                    state = MessageStates.QUEUED,
                    retryCount = 0,
                    failureCode = null,
                ),
            )
            sources.forEach { source ->
                val attachmentId = UUID.randomUUID().toString()
                dao.upsertAttachment(
                    AttachmentEntity(
                        id = attachmentId,
                        clientMessageId = clientMessageId,
                        kind = kind,
                        sealedFilename = localCipher.sealString(source.filename),
                        sealedCaption = caption.trim().takeIf(String::isNotEmpty)
                            ?.let(localCipher::sealString),
                        mimeType = source.mimeType,
                        byteSize = source.byteSize,
                        sourceUri = source.uri.toString(),
                        encryptedFilePath = null,
                        encryptedThumbnailPath = null,
                        encryptedSizeBytes = null,
                        ciphertextSha256 = null,
                        thumbnailCiphertextSha256 = null,
                        sealedEncryptionKey = null,
                        sealedNonce = null,
                        sealedThumbnailKey = null,
                        sealedThumbnailNonce = null,
                        uploadId = null,
                        serverAttachmentId = null,
                        uploadedBytes = 0,
                        state = AttachmentStates.QUEUED,
                    ),
                )
            }
            dao.upsertPendingOperation(
                PendingOperationEntity(
                    id = "send:$clientMessageId",
                    clientMessageId = clientMessageId,
                    type = "SEND_MESSAGE",
                    state = "QUEUED",
                    attempts = 0,
                    nextAttemptAt = now,
                    lastError = null,
                    createdAt = now,
                ),
            )
            dao.touchConversation(conversationId, now)
        }
        work.enqueueSend(clientMessageId)
        return clientMessageId
    }

    suspend fun prepareOutgoingMessage(clientMessageId: String): Boolean {
        val message = dao.message(clientMessageId) ?: return true
        val attachments = dao.attachments(clientMessageId)
        if (attachments.isEmpty() || attachments.all {
                it.state in setOf(
                    AttachmentStates.ENCRYPTED,
                    AttachmentStates.UPLOADING,
                    AttachmentStates.UPLOADED,
                )
            }
        ) {
            return true
        }
        dao.updateMessageState(
            clientMessageId,
            MessageStates.ENCRYPTING,
            message.retryCount,
            null,
        )
        return runCatching {
            attachments
                .filterNot {
                    it.state in setOf(
                        AttachmentStates.ENCRYPTED,
                        AttachmentStates.UPLOADING,
                        AttachmentStates.UPLOADED,
                    )
                }
                .forEach { attachment ->
                    dao.updateAttachmentState(attachment.id, AttachmentStates.ENCRYPTING)
                    val prepared = attachmentCrypto.prepare(attachment)
                    dao.markAttachmentEncrypted(
                        attachmentId = attachment.id,
                        encryptedFilePath = prepared.encryptedFile.absolutePath,
                        encryptedThumbnailPath = prepared.encryptedThumbnail?.absolutePath,
                        encryptedSizeBytes = prepared.encryptedSizeBytes,
                        ciphertextSha256 = prepared.ciphertextSha256,
                        thumbnailCiphertextSha256 = prepared.thumbnailCiphertextSha256,
                        sealedEncryptionKey = localCipher.sealString(prepared.key.base64()),
                        sealedNonce = localCipher.sealString(prepared.nonce.base64()),
                        sealedThumbnailKey = prepared.thumbnailKey?.base64()
                            ?.let(localCipher::sealString),
                        sealedThumbnailNonce = prepared.thumbnailNonce?.base64()
                            ?.let(localCipher::sealString),
                    )
                    attachmentCrypto.deleteOwnedPlaintextSource(attachment.sourceUri)
                }
            dao.updateMessageState(
                clientMessageId,
                MessageStates.QUEUED,
                message.retryCount,
                null,
            )
            true
        }.getOrElse {
            attachments.forEach { attachment ->
                dao.updateAttachmentState(attachment.id, AttachmentStates.FAILED)
            }
            dao.updateMessageState(
                clientMessageId,
                MessageStates.FAILED,
                message.retryCount,
                "ATTACHMENT_ENCRYPTION_FAILED",
            )
            false
        }
    }

    suspend fun messageHasAttachments(clientMessageId: String): Boolean =
        dao.attachments(clientMessageId).isNotEmpty()

    suspend fun saveDraft(conversationId: String, text: String) {
        if (text.isEmpty()) {
            dao.deleteDraft(conversationId)
        } else {
            dao.upsertDraft(
                DraftEntity(
                    conversationId = conversationId,
                    sealedText = localCipher.sealString(text),
                    updatedAt = System.currentTimeMillis(),
                ),
            )
        }
    }

    suspend fun setTyping(conversationId: String, typing: Boolean) {
        val session = sessionStore.current() ?: return
        val commDeviceId = session.commDeviceId ?: return
        runCatching {
            api.setTyping(
                TypingRequestDto(
                    conversationId = conversationId,
                    senderDeviceId = commDeviceId,
                    typing = typing,
                ),
            )
        }
    }

    suspend fun retryMessage(clientMessageId: String) {
        val message = dao.message(clientMessageId) ?: return
        dao.updateMessageState(
            clientMessageId,
            MessageStates.QUEUED,
            message.retryCount,
            null,
        )
        work.enqueueSend(clientMessageId, replace = true)
    }

    suspend fun cancelOutgoingMessage(clientMessageId: String) {
        val message = dao.message(clientMessageId) ?: return
        require(message.serverMessageId == null) {
            "A sent message cannot be canceled."
        }
        work.cancelSend(clientMessageId)
        dao.attachments(clientMessageId).forEach { attachment ->
            attachment.uploadId?.let { runCatching { api.cancelUpload(it) } }
            attachment.encryptedFilePath?.let { java.io.File(it).delete() }
            attachment.encryptedThumbnailPath?.let { java.io.File(it).delete() }
        }
        dao.deleteOperation("send:$clientMessageId")
        dao.deleteMessage(clientMessageId)
    }

    suspend fun downloadAttachment(attachmentId: String): Boolean =
        runCatching {
            attachmentDownloader.download(attachmentId)
            true
        }.getOrDefault(false)

    suspend fun openAttachment(attachmentId: String, preferThumbnail: Boolean): String {
        val attachment = attachmentDownloader.download(attachmentId)
        val useThumbnail = preferThumbnail &&
            attachment.encryptedThumbnailPath != null &&
            attachment.sealedThumbnailKey != null &&
            attachment.sealedThumbnailNonce != null
        val encryptedFile = if (useThumbnail) {
            attachment.encryptedThumbnailPath
        } else {
            attachment.encryptedFilePath
        }?.let { java.io.File(it) } ?: error("Encrypted attachment is unavailable.")
        val sealedKey = if (useThumbnail) {
            attachment.sealedThumbnailKey
        } else {
            attachment.sealedEncryptionKey
        } ?: error("Attachment key is unavailable.")
        val sealedNonce = if (useThumbnail) {
            attachment.sealedThumbnailNonce
        } else {
            attachment.sealedNonce
        } ?: error("Attachment nonce is unavailable.")
        val key = Base64.decode(localCipher.openString(sealedKey), Base64.NO_WRAP)
        val nonce = Base64.decode(localCipher.openString(sealedNonce), Base64.NO_WRAP)
        val outputName = if (useThumbnail) {
            "${attachment.id}.thumbnail.jpg"
        } else {
            "${attachment.id}-${localCipher.openString(attachment.sealedFilename)}"
        }
        return attachmentCrypto.decryptToCache(
            encryptedFile = encryptedFile,
            key = key,
            nonce = nonce,
            outputName = outputName,
        ).absolutePath
    }

    suspend fun processOutgoingMessage(clientMessageId: String): SendOutcome {
        if (!prepareOutgoingMessage(clientMessageId)) return SendOutcome.FAILED
        val message = dao.message(clientMessageId) ?: return SendOutcome.COMPLETE
        if (message.serverMessageId != null) return SendOutcome.COMPLETE
        val session = sessionStore.current() ?: return fail(message, "LOGIN_REQUIRED", false)
        val commDeviceId = session.commDeviceId
            ?: return fail(message, "DEVICE_NOT_REGISTERED", false)
        val conversation = dao.conversation(message.conversationId)
            ?: return fail(message, "CONVERSATION_MISSING", false)

        dao.updateMessageState(
            clientMessageId,
            MessageStates.ENCRYPTING,
            message.retryCount,
            null,
        )

        return try {
            var attachments = dao.attachments(clientMessageId)
            if (attachments.isNotEmpty()) {
                dao.updateMessageState(
                    clientMessageId,
                    MessageStates.UPLOADING,
                    message.retryCount,
                    null,
                )
                attachments = attachments.map { attachment ->
                    attachmentUploader.upload(
                        attachment = attachment,
                        conversationId = message.conversationId,
                        senderDeviceId = commDeviceId,
                    )
                }
            }
            val participants = dao.activeParticipants(message.conversationId)
            val openedBody = message.sealedBody?.let(localCipher::openString)
            val groupTitle = openedBody
                ?.takeIf { message.kind == MessageKinds.SYSTEM }
                ?.takeIf { it.startsWith(GROUP_TITLE_PREFIX) }
                ?.removePrefix(GROUP_TITLE_PREFIX)
            val content = EncryptedMessageContent(
                clientMessageId = message.clientMessageId,
                body = if (message.kind == MessageKinds.REACTION) {
                    null
                } else if (groupTitle != null) {
                    null
                } else {
                    openedBody
                },
                reaction = if (message.kind == MessageKinds.REACTION) {
                    message.sealedBody?.let(localCipher::openString)
                } else {
                    null
                },
                groupTitle = groupTitle,
                attachmentKeys = attachments.map { attachment ->
                    EncryptedAttachmentKey(
                        attachmentId = attachment.id,
                        filename = localCipher.openString(attachment.sealedFilename),
                        mimeType = attachment.mimeType,
                        byteSize = attachment.byteSize,
                        key = localCipher.openString(
                            attachment.sealedEncryptionKey
                                ?: error("Attachment key is unavailable."),
                        ),
                        nonce = localCipher.openString(
                            attachment.sealedNonce
                                ?: error("Attachment nonce is unavailable."),
                        ),
                        thumbnailKey = attachment.sealedThumbnailKey
                            ?.let(localCipher::openString),
                        thumbnailNonce = attachment.sealedThumbnailNonce
                            ?.let(localCipher::openString),
                        caption = attachment.sealedCaption?.let(localCipher::openString),
                    )
                },
            )
            val plaintext = json.encodeToString(content).encodeToByteArray()
            val envelopes = encryptForParticipants(
                plaintext = plaintext,
                participantUserIds = participants
                    .map(ParticipantEntity::userId)
                    .distinct(),
                localUserId = session.userId,
                localDeviceId = commDeviceId,
            )
            if (envelopes.isEmpty()) {
                return fail(message, "RECIPIENT_HAS_NO_DEVICE", false)
            }

            dao.updateMessageState(
                clientMessageId,
                MessageStates.SENDING,
                message.retryCount,
                null,
            )
            val response = api.sendMessage(
                SendMessageRequestDto(
                    clientMessageId = message.clientMessageId,
                    conversationId = message.conversationId,
                    senderDeviceId = commDeviceId,
                    kind = message.kind,
                    membershipVersion = conversation.membershipVersion,
                    replyToMessageId = message.replyToMessageId,
                    eventTargetMessageId = message.eventTargetMessageId,
                    clientCreatedAt = Instant.ofEpochMilli(message.createdAt).toString(),
                    envelopes = envelopes,
                    attachmentUploadIds = attachments.mapNotNull { it.uploadId },
                ),
            )
            when (openedBody) {
                GROUP_AVATAR_EVENT -> {
                    val avatarAttachmentId = attachments.firstOrNull()?.id
                        ?: error("The encrypted group image is unavailable.")
                    api.setGroupAvatar(message.conversationId, response.message.id)
                    dao.updateConversationAvatarReference(
                        conversationId = message.conversationId,
                        sealedAvatarReference = localCipher.sealString(avatarAttachmentId),
                        updatedAt = System.currentTimeMillis(),
                    )
                }
                GROUP_AVATAR_REMOVED_EVENT -> {
                    api.setGroupAvatar(message.conversationId, null)
                    dao.updateConversationAvatarReference(
                        conversationId = message.conversationId,
                        sealedAvatarReference = null,
                        updatedAt = System.currentTimeMillis(),
                    )
                }
            }
            dao.markMessageAccepted(
                clientMessageId = clientMessageId,
                serverMessageId = response.message.id,
                sequence = response.message.sequence.toLong(),
                acceptedAt = Instant.parse(response.message.createdAt).toEpochMilli(),
            )
            dao.deleteOperation("send:$clientMessageId")
            SendOutcome.COMPLETE
        } catch (error: ThetaCommApiException) {
            val canRetry = error.statusCode >= 500 ||
                error.statusCode == 408 ||
                error.statusCode == 409 ||
                error.statusCode == 429
            fail(message, error.errorCode ?: "HTTP_${error.statusCode}", canRetry)
        } catch (_: Exception) {
            fail(message, "NETWORK_OR_ENCRYPTION", true)
        }
    }

    suspend fun sync(): Boolean {
        val session = sessionStore.current() ?: return false
        val commDeviceId = session.commDeviceId ?: return false
        var cursor = dao.syncState(SYNC_CURSOR)
        var continueSync: Boolean

        do {
            val page = api.sync(commDeviceId, cursor)
            if (commDeviceId in page.revokedDeviceIds) {
                sessionStore.clear()
                return false
            }
            val delivered = mutableListOf<Pair<String, String>>()
            val pendingDownloads = mutableSetOf<String>()
            database.withTransaction {
                for (conversation in page.conversations) {
                    val existing = dao.conversation(conversation.id)
                    val directTitle = conversation.participants
                        .firstOrNull { it.userId != session.userId }
                        ?.displayName
                    val title = directTitle ?: existing?.sealedTitle?.let(::openSafely) ?: "Chat group"
                    dao.upsertConversations(
                        listOf(
                            ConversationEntity(
                                id = conversation.id,
                                type = conversation.type,
                                sealedTitle = localCipher.sealString(title),
                                sealedAvatarReference = existing?.sealedAvatarReference,
                                membershipVersion = conversation.membershipVersion,
                                lastSequence = conversation.lastSequence.toLong(),
                                lastMessageAt = conversation.lastMessageAt?.let(::parseTime),
                                unreadCount = conversation.unreadCount,
                                isPinned = conversation.preferences.pinned,
                                isArchived = conversation.preferences.archived,
                                mutedUntil = conversation.preferences.mutedUntil?.let(::parseTime),
                                notificationLevel = conversation.preferences.notificationLevel,
                                updatedAt = System.currentTimeMillis(),
                            ),
                        ),
                    )
                    dao.replaceConversationParticipants(
                        conversation.id,
                        conversation.participants.map {
                            ParticipantEntity(
                                conversationId = conversation.id,
                                userId = it.userId,
                                username = it.username,
                                displayName = it.displayName,
                                avatarUrl = it.avatarUrl,
                                role = it.role,
                                joinedAt = parseTime(it.joinedAt),
                                leftAt = it.leftAt?.let(::parseTime),
                                removedAt = it.removedAt?.let(::parseTime),
                            )
                        },
                    )
                }

                for (remote in page.messages) {
                    val decrypted = decryptRemote(remote, session.userId, commDeviceId)
                    val existing = dao.message(remote.clientMessageId)
                    val participants = dao.activeParticipants(remote.conversationId)
                    val state = messageState(
                        remote,
                        session.userId,
                        participants.map(ParticipantEntity::userId),
                    )
                    dao.upsertMessage(
                        MessageEntity(
                            clientMessageId = remote.clientMessageId,
                            serverMessageId = remote.id,
                            conversationId = remote.conversationId,
                            senderUserId = remote.senderUserId,
                            senderDeviceId = remote.senderDeviceId,
                            kind = remote.kind,
                            sealedBody = existing?.sealedBody
                                ?: (
                                    decrypted?.body
                                        ?: decrypted?.reaction
                                        ?: decrypted?.groupTitle?.let {
                                            "$GROUP_TITLE_PREFIX$it"
                                        }
                                    )
                                    ?.let(localCipher::sealString),
                            serverCiphertext = remote.ciphertext,
                            protocolVersion = remote.protocolVersion,
                            membershipVersion = remote.membershipVersion,
                            replyToMessageId = remote.replyToMessageId,
                            eventTargetMessageId = remote.eventTargetMessageId,
                            sequence = remote.sequence.toLong(),
                            createdAt = parseTime(remote.createdAt),
                            acceptedAt = parseTime(remote.createdAt),
                            editedAt = remote.editedAt?.let(::parseTime),
                            deletedAt = remote.deletedAt?.let(::parseTime),
                            state = if (existing?.serverMessageId == null && remote.senderUserId == session.userId) {
                                MessageStates.SENT
                            } else {
                                state
                            },
                            retryCount = existing?.retryCount ?: 0,
                            failureCode = null,
                        ),
                    )
                    decrypted?.groupTitle?.takeIf(String::isNotBlank)?.let { groupTitle ->
                        dao.updateConversationTitle(
                            remote.conversationId,
                            localCipher.sealString(groupTitle),
                            System.currentTimeMillis(),
                        )
                    }
                    dao.upsertReceipts(
                        remote.receipts.map {
                            ReceiptEntity(
                                messageId = remote.id,
                                userId = it.recipientUserId,
                                deviceId = it.recipientDeviceId,
                                deliveredAt = it.deliveredAt?.let(::parseTime),
                                seenAt = it.seenAt?.let(::parseTime),
                            )
                        },
                    )
                    decrypted?.attachmentKeys?.forEachIndexed { index, attachment ->
                        val existingAttachment = dao.attachment(attachment.attachmentId)
                        val serverAttachmentId = remote.attachmentIds.getOrNull(index)
                            ?: existingAttachment?.serverAttachmentId
                        dao.upsertAttachment(
                            AttachmentEntity(
                                id = attachment.attachmentId,
                                clientMessageId = remote.clientMessageId,
                                kind = remote.kind,
                                sealedFilename = existingAttachment?.sealedFilename
                                    ?: localCipher.sealString(attachment.filename),
                                sealedCaption = existingAttachment?.sealedCaption
                                    ?: attachment.caption?.let(localCipher::sealString),
                                mimeType = attachment.mimeType,
                                byteSize = attachment.byteSize,
                                sourceUri = existingAttachment?.sourceUri,
                                encryptedFilePath = existingAttachment?.encryptedFilePath,
                                encryptedThumbnailPath = existingAttachment?.encryptedThumbnailPath,
                                encryptedSizeBytes = existingAttachment?.encryptedSizeBytes,
                                ciphertextSha256 = existingAttachment?.ciphertextSha256,
                                thumbnailCiphertextSha256 =
                                    existingAttachment?.thumbnailCiphertextSha256,
                                sealedEncryptionKey = existingAttachment?.sealedEncryptionKey
                                    ?: localCipher.sealString(attachment.key),
                                sealedNonce = existingAttachment?.sealedNonce
                                    ?: localCipher.sealString(attachment.nonce),
                                sealedThumbnailKey = existingAttachment?.sealedThumbnailKey
                                    ?: attachment.thumbnailKey?.let(localCipher::sealString),
                                sealedThumbnailNonce = existingAttachment?.sealedThumbnailNonce
                                    ?: attachment.thumbnailNonce?.let(localCipher::sealString),
                                uploadId = existingAttachment?.uploadId,
                                serverAttachmentId = serverAttachmentId,
                                uploadedBytes = existingAttachment?.uploadedBytes ?: 0,
                                state = existingAttachment?.state ?: AttachmentStates.QUEUED,
                            ),
                        )
                        if (
                            remote.senderUserId != session.userId &&
                            serverAttachmentId != null &&
                            existingAttachment?.state != AttachmentStates.READY
                        ) {
                            pendingDownloads += attachment.attachmentId
                        }
                    }
                    when (decrypted?.body) {
                        GROUP_AVATAR_EVENT -> {
                            decrypted.attachmentKeys.firstOrNull()?.attachmentId?.let {
                                dao.updateConversationAvatarReference(
                                    conversationId = remote.conversationId,
                                    sealedAvatarReference = localCipher.sealString(it),
                                    updatedAt = System.currentTimeMillis(),
                                )
                            }
                        }
                        GROUP_AVATAR_REMOVED_EVENT -> {
                            dao.updateConversationAvatarReference(
                                conversationId = remote.conversationId,
                                sealedAvatarReference = null,
                                updatedAt = System.currentTimeMillis(),
                            )
                        }
                    }
                    if (
                        remote.senderUserId != session.userId &&
                        decrypted != null &&
                        remote.envelopeId != null
                    ) {
                        delivered += remote.conversationId to remote.id
                    }
                }
                cursor = page.cursor
                dao.upsertSyncState(SyncStateEntity(SYNC_CURSOR, page.cursor))
            }

            pendingDownloads.forEach(work::enqueueDownload)
            delivered.forEach { (conversationId, messageId) ->
                runCatching {
                    api.acknowledge(
                        ReceiptRequestDto(
                            conversationId = conversationId,
                            messageId = messageId,
                            recipientDeviceId = commDeviceId,
                            status = "DELIVERED",
                            occurredAt = Instant.now().toString(),
                        ),
                    )
                }
            }
            val now = System.currentTimeMillis()
            typingByConversation.value = page.typing
                .filter { parseTime(it.expiresAt) > now && it.userId != session.userId }
                .groupBy { it.conversationId }
                .mapValues { (_, values) -> values.map { it.userId }.toSet() }
            continueSync = page.hasMore
        } while (continueSync)
        runCatching {
            api.preKeyStatus(session.stableDeviceId)
        }.getOrNull()?.let { status ->
            signalCrypto.replenishmentRequest(
                stableDeviceId = session.stableDeviceId,
                serverAvailable = status.available,
                serverKyberAvailable = status.kyberAvailable,
            )?.let { request ->
                runCatching { api.replenishPreKeys(request) }
            }
        }
        return true
    }

    suspend fun markConversationSeen(conversationId: String) {
        val session = sessionStore.current() ?: return
        val commDeviceId = session.commDeviceId ?: return
        val messages = dao.messagesToMarkSeen(conversationId, session.userId)
        messages.forEach { message ->
            val serverMessageId = message.serverMessageId ?: return@forEach
            runCatching {
                api.acknowledge(
                    ReceiptRequestDto(
                        conversationId = conversationId,
                        messageId = serverMessageId,
                        recipientDeviceId = commDeviceId,
                        status = "SEEN",
                        occurredAt = Instant.now().toString(),
                    ),
                )
            }
        }
        dao.markConversationRead(conversationId, System.currentTimeMillis())
    }

    suspend fun logout() {
        try {
            work.cancelAll()
        } finally {
            sessionStore.clear()
            withContext(Dispatchers.IO) {
                database.clearAllTables()
                attachmentCrypto.clearLocalFiles()
            }
        }
    }

    private fun decryptRemote(
        remote: MessageDto,
        localUserId: String,
        localDeviceId: String,
    ): EncryptedMessageContent? {
        if (remote.ciphertext == null || remote.envelopeType == null) return null
        return runCatching {
            val plaintext = signalCrypto.decrypt(
                ciphertext = remote.ciphertext,
                envelopeType = remote.envelopeType,
                senderUserId = remote.senderUserId,
                senderDeviceId = remote.senderDeviceId,
                localUserId = localUserId,
                localDeviceId = localDeviceId,
            )
            json.decodeFromString<EncryptedMessageContent>(plaintext.decodeToString())
        }.getOrNull()
    }

    private suspend fun fail(
        message: MessageEntity,
        code: String,
        retry: Boolean,
    ): SendOutcome {
        val attempts = message.retryCount + 1
        val state = if (retry && attempts < MAX_AUTOMATIC_ATTEMPTS) {
            MessageStates.QUEUED
        } else {
            MessageStates.FAILED
        }
        val delay = (1L shl attempts.coerceAtMost(10)) * 1_000L
        dao.updateMessageState(message.clientMessageId, state, attempts, code)
        dao.updateOperation(
            id = "send:${message.clientMessageId}",
            state = state,
            attempts = attempts,
            nextAttemptAt = System.currentTimeMillis() + delay,
            lastError = code,
        )
        return if (state == MessageStates.QUEUED) SendOutcome.RETRY else SendOutcome.FAILED
    }

    private fun messageState(
        message: MessageDto,
        currentUserId: String,
        participantUserIds: List<String>,
    ): String {
        if (message.senderUserId != currentUserId) return MessageStates.DELIVERED
        return MessageStatusReducer.aggregate(
            MessageStatusReducer.perParticipant(
                participantUserIds = participantUserIds,
                senderUserId = currentUserId,
                receipts = message.receipts,
            ),
        )
    }

    private fun toListItem(summary: ConversationSummary): ConversationListItem {
        val title = summary.sealedTitle?.let(::openSafely) ?: "Conversation"
        val preview = when (summary.lastMessageKind) {
            MessageKinds.IMAGE -> "Photo"
            MessageKinds.VIDEO -> "Video"
            MessageKinds.FILE -> "File"
            MessageKinds.VOICE -> "Voice message"
            else -> summary.lastSealedBody?.let(::openSafely).orEmpty()
        }
        return ConversationListItem(
            id = summary.id,
            type = summary.type,
            title = title,
            preview = preview,
            lastMessageAt = summary.lastMessageAt,
            unreadCount = summary.unreadCount,
            isPinned = summary.isPinned,
            isArchived = summary.isArchived,
            mutedUntil = summary.mutedUntil,
            lastMessageState = summary.lastMessageState,
        )
    }

    private suspend fun encryptForParticipants(
        plaintext: ByteArray,
        participantUserIds: List<String>,
        localUserId: String,
        localDeviceId: String,
    ) = encryptionMutex.withLock {
        val devices = api.recipientDevices(participantUserIds)
            .devices
            .filterNot { it.deviceId == localDeviceId }
        val missingDevices = devices.filterNot { device ->
            signalCrypto.hasTrustedSession(
                recipientUserId = device.userId,
                recipientDeviceId = device.deviceId,
                serializedIdentityKey = device.identityKey,
            )
        }
        val bundlesByDeviceId = if (missingDevices.isEmpty()) {
            emptyMap()
        } else {
            api.preKeyBundles(
                userIds = missingDevices.map { it.userId }.distinct(),
                verifierDeviceId = localDeviceId,
                deviceIds = missingDevices.map { it.deviceId },
            ).bundles.associateBy { it.deviceId }
        }
        devices.map { device ->
            val bundle = bundlesByDeviceId[device.deviceId]
            if (bundle != null) {
                signalCrypto.encrypt(
                    plaintext = plaintext,
                    bundle = bundle,
                    localUserId = localUserId,
                    localDeviceId = localDeviceId,
                )
            } else {
                check(
                    signalCrypto.hasTrustedSession(
                        recipientUserId = device.userId,
                        recipientDeviceId = device.deviceId,
                        serializedIdentityKey = device.identityKey,
                    ),
                ) {
                    "A recipient device changed its encryption identity."
                }
                signalCrypto.encryptEstablishedSession(
                    plaintext = plaintext,
                    recipientUserId = device.userId,
                    recipientDeviceId = device.deviceId,
                    recipientKeyVersion = device.keyVersion,
                    localUserId = localUserId,
                    localDeviceId = localDeviceId,
                )
            }
        }
    }

    private fun openSafely(value: String): String =
        runCatching { localCipher.openString(value) }.getOrDefault("")

    private fun parseTime(value: String): Long = Instant.parse(value).toEpochMilli()

    private fun ByteArray.base64(): String =
        Base64.encodeToString(this, Base64.NO_WRAP)

    private fun opaqueMetadataCiphertext(value: String): String {
        val random = SecureRandom()
        val key = ByteArray(32).also(random::nextBytes)
        val nonce = ByteArray(12).also(random::nextBytes)
        val encrypted = Cipher.getInstance("AES/GCM/NoPadding").run {
            init(
                Cipher.ENCRYPT_MODE,
                SecretKeySpec(key, "AES"),
                GCMParameterSpec(128, nonce),
            )
            doFinal(value.encodeToByteArray())
        }
        return (nonce + encrypted).base64()
    }

    private companion object {
        const val SYNC_CURSOR = "sync_cursor"
        const val MAX_AUTOMATIC_ATTEMPTS = 6
        const val EDIT_WINDOW_MS = 15 * 60 * 1_000L
        const val DELETE_WINDOW_MS = 48 * 60 * 60 * 1_000L
        const val GROUP_TITLE_PREFIX = "GROUP_TITLE:"
        const val GROUP_AVATAR_EVENT = "GROUP_AVATAR_UPDATED"
        const val GROUP_AVATAR_REMOVED_EVENT = "GROUP_AVATAR_REMOVED"
        const val MAX_GROUP_AVATAR_BYTES = 10L * 1024 * 1024
        val EVENT_MESSAGE_KINDS = setOf(
            MessageKinds.REACTION,
            MessageKinds.EDIT,
            MessageKinds.DELETE,
        )
    }
}

enum class SendOutcome {
    COMPLETE,
    RETRY,
    FAILED,
}
