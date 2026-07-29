package net.thetaspace.communications.data

import androidx.room.withTransaction
import com.google.firebase.messaging.FirebaseMessaging
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import net.thetaspace.communications.data.local.ConversationEntity
import net.thetaspace.communications.data.local.ConversationSummary
import net.thetaspace.communications.data.local.MessageEntity
import net.thetaspace.communications.data.local.MessageKinds
import net.thetaspace.communications.data.local.MessageStates
import net.thetaspace.communications.data.local.ParticipantEntity
import net.thetaspace.communications.data.local.PendingOperationEntity
import net.thetaspace.communications.data.local.ReceiptEntity
import net.thetaspace.communications.data.local.SyncStateEntity
import net.thetaspace.communications.data.local.ThetaCommDatabase
import net.thetaspace.communications.data.remote.LoginRequestDto
import net.thetaspace.communications.data.remote.MessageDto
import net.thetaspace.communications.data.remote.ReceiptRequestDto
import net.thetaspace.communications.data.remote.SendMessageRequestDto
import net.thetaspace.communications.data.remote.ThetaCommApi
import net.thetaspace.communications.data.remote.ThetaCommApiException
import net.thetaspace.communications.security.LocalKeyCipher
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
    val replyToMessageId: String?,
    val eventTargetMessageId: String?,
)

class ThetaCommRepository(
    private val database: ThetaCommDatabase,
    private val api: ThetaCommApi,
    private val sessionStore: SessionStore,
    private val localCipher: LocalKeyCipher,
    private val signalCrypto: SignalCryptoEngine,
    private val work: ThetaCommWork,
    private val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    },
) {
    private val dao = database.thetaCommDao()

    fun conversations(archived: Boolean = false): Flow<List<ConversationListItem>> =
        dao.observeConversationSummaries(archived).map { summaries ->
            summaries.map(::toListItem)
        }

    fun messages(conversationId: String): Flow<List<MessageListItem>> =
        dao.observeMessages(conversationId).map { messages ->
            messages.map { message ->
                MessageListItem(
                    clientMessageId = message.clientMessageId,
                    serverMessageId = message.serverMessageId,
                    senderUserId = message.senderUserId,
                    kind = message.kind,
                    body = message.sealedBody?.let(::openSafely),
                    createdAt = message.createdAt,
                    state = message.state,
                    isDeleted = message.deletedAt != null,
                    replyToMessageId = message.replyToMessageId,
                    eventTargetMessageId = message.eventTargetMessageId,
                )
            }
        }

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
        registerCurrentDevice()
        work.enqueueImmediateSync()
    }

    suspend fun registerCurrentDevice() {
        val session = sessionStore.current() ?: return
        val pushToken = runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull()
        val request = signalCrypto.registrationRequest(
            stableDeviceId = session.stableDeviceId,
            pushToken = pushToken,
            appInstanceId = session.stableDeviceId,
        )
        val registered = api.registerDevice(request)
        sessionStore.bindCommDevice(registered.device.id)
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
        return clientMessageId
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

    suspend fun processOutgoingMessage(clientMessageId: String): SendOutcome {
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
            val participants = dao.activeParticipants(message.conversationId)
            val bundles = api.preKeyBundles(
                participants.map(ParticipantEntity::userId).distinct(),
                commDeviceId,
            ).bundles.filterNot { it.deviceId == commDeviceId }
            val content = EncryptedMessageContent(
                clientMessageId = message.clientMessageId,
                body = message.sealedBody?.let(localCipher::openString),
            )
            val plaintext = json.encodeToString(content).encodeToByteArray()
            val envelopes = bundles.map { bundle ->
                signalCrypto.encrypt(
                    plaintext = plaintext,
                    bundle = bundle,
                    localUserId = session.userId,
                    localDeviceId = commDeviceId,
                )
            }
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
                    attachmentUploadIds = dao.attachments(clientMessageId)
                        .mapNotNull { it.uploadId },
                ),
            )
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
            val delivered = mutableListOf<Pair<String, String>>()
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
                                ?: decrypted?.body?.let(localCipher::sealString),
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
            continueSync = page.hasMore
        } while (continueSync)
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
        sessionStore.clear()
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

    private fun openSafely(value: String): String =
        runCatching { localCipher.openString(value) }.getOrDefault("")

    private fun parseTime(value: String): Long = Instant.parse(value).toEpochMilli()

    private companion object {
        const val SYNC_CURSOR = "sync_cursor"
        const val MAX_AUTOMATIC_ATTEMPTS = 6
    }
}

enum class SendOutcome {
    COMPLETE,
    RETRY,
    FAILED,
}
