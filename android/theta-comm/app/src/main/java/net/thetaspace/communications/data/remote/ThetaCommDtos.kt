package net.thetaspace.communications.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ApiErrorDto(
    val error: String = "Request failed.",
    val code: String? = null,
)

@Serializable
data class ParticipantDto(
    val userId: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val role: String,
    val joinedAt: String,
    val leftAt: String? = null,
    val removedAt: String? = null,
)

@Serializable
data class ConversationPreferencesDto(
    val archived: Boolean = false,
    val pinned: Boolean = false,
    val mutedUntil: String? = null,
    val notificationLevel: String = "ALL",
)

@Serializable
data class ConversationDto(
    val id: String,
    val type: String,
    val titleCiphertext: String? = null,
    val hasEncryptedAvatar: Boolean = false,
    val membershipVersion: Int,
    val lastSequence: String,
    val lastMessageAt: String? = null,
    val unreadCount: Int = 0,
    val preferences: ConversationPreferencesDto = ConversationPreferencesDto(),
    val participants: List<ParticipantDto> = emptyList(),
)

@Serializable
data class ReceiptDto(
    val recipientUserId: String,
    val recipientDeviceId: String,
    val deliveredAt: String? = null,
    val seenAt: String? = null,
)

@Serializable
data class MessageDto(
    val id: String,
    val clientMessageId: String,
    val conversationId: String,
    val senderUserId: String,
    val senderDeviceId: String,
    val sequence: String,
    val kind: String,
    val protocolVersion: Int,
    val membershipVersion: Int,
    val replyToMessageId: String? = null,
    val eventTargetMessageId: String? = null,
    val ciphertext: String? = null,
    val envelopeId: String? = null,
    val envelopeType: String? = null,
    val createdAt: String,
    val editedAt: String? = null,
    val deletedAt: String? = null,
    val attachmentIds: List<String> = emptyList(),
    val receipts: List<ReceiptDto> = emptyList(),
)

@Serializable
data class TypingDto(
    val conversationId: String,
    val userId: String,
    val expiresAt: String,
)

@Serializable
data class SyncEventDto(
    val id: String,
    val kind: String,
    val conversationId: String? = null,
    val messageId: String? = null,
)

@Serializable
data class SyncResponseDto(
    val cursor: String,
    val hasMore: Boolean,
    val conversations: List<ConversationDto>,
    val messages: List<MessageDto>,
    val typing: List<TypingDto> = emptyList(),
    val events: List<SyncEventDto> = emptyList(),
    val revokedDeviceIds: List<String> = emptyList(),
)

@Serializable
data class RecipientEnvelopeDto(
    val recipientUserId: String,
    val recipientDeviceId: String,
    val envelopeType: String,
    val ciphertext: String,
)

@Serializable
data class SendMessageRequestDto(
    val clientMessageId: String,
    val conversationId: String,
    val senderDeviceId: String,
    val kind: String,
    val protocolVersion: Int = 2,
    val membershipVersion: Int,
    val replyToMessageId: String? = null,
    val eventTargetMessageId: String? = null,
    val clientCreatedAt: String,
    val envelopes: List<RecipientEnvelopeDto>,
    val attachmentUploadIds: List<String> = emptyList(),
)

@Serializable
data class AcceptedMessageDto(
    val id: String,
    val clientMessageId: String,
    val conversationId: String,
    val senderUserId: String,
    val senderDeviceId: String,
    val sequence: String,
    val kind: String,
    val protocolVersion: Int,
    val membershipVersion: Int,
    val replyToMessageId: String? = null,
    val eventTargetMessageId: String? = null,
    val createdAt: String,
)

@Serializable
data class SendMessageResponseDto(
    val message: AcceptedMessageDto,
    val replayed: Boolean,
)

@Serializable
data class ReceiptRequestDto(
    val conversationId: String,
    val messageId: String,
    val recipientDeviceId: String,
    val status: String,
    val occurredAt: String,
)

@Serializable
data class TypingRequestDto(
    val conversationId: String,
    val senderDeviceId: String,
    val typing: Boolean,
)

@Serializable
data class PreKeyDto(
    val keyId: Int,
    val publicKey: String,
)

@Serializable
data class SignedPreKeyDto(
    val keyId: Int,
    val publicKey: String,
    val signature: String,
)

@Serializable
data class KyberPreKeyDto(
    val keyId: Int,
    val publicKey: String,
    val signature: String,
)

@Serializable
data class PushRegistrationDto(
    val provider: String = "FCM",
    val token: String,
    val appInstanceId: String? = null,
)

@Serializable
data class RegisterDeviceRequestDto(
    val deviceId: String,
    val platform: String = "android",
    val appVersion: String,
    val registrationId: Int,
    val identityKey: String,
    val signedPreKey: SignedPreKeyDto,
    val oneTimePreKeys: List<PreKeyDto>,
    val oneTimeKyberPreKeys: List<KyberPreKeyDto>,
    val push: PushRegistrationDto? = null,
)

@Serializable
data class DeviceDto(
    val id: String,
    val deviceId: String,
    val platform: String,
    val appVersion: String? = null,
    val lastSeenAt: String,
    val revokedAt: String? = null,
    val verified: Boolean = false,
)

@Serializable
data class RegisterDeviceResponseDto(
    val device: DeviceDto,
    val preKeyCount: Int,
    val kyberPreKeyCount: Int,
    val identityChanged: Boolean,
)

@Serializable
data class DeviceListResponseDto(
    val devices: List<DeviceDto>,
)

@Serializable
data class PreKeyBundleDto(
    val userId: String,
    val deviceId: String,
    val registrationId: Int,
    val identityKey: String,
    val signedPreKey: SignedPreKeyDto,
    val oneTimePreKey: PreKeyDto? = null,
    val kyberPreKey: KyberPreKeyDto,
)

@Serializable
data class PreKeyBundlesResponseDto(
    val bundles: List<PreKeyBundleDto>,
)

@Serializable
data class CreateDirectConversationRequestDto(
    val type: String = "DIRECT",
    val targetUserId: String,
)

@Serializable
data class CreateConversationResponseDto(
    val conversation: ConversationDto,
    val created: Boolean,
)

@Serializable
data class LoginRequestDto(
    val email: String,
    val password: String,
    val deviceId: String,
)

@Serializable
data class LoginResponseDto(
    val token: String,
    val user: LoginUserDto,
)

@Serializable
data class LoginUserDto(
    val id: String,
    val email: String? = null,
    val username: String? = null,
)

@Serializable
data class CreateUploadRequestDto(
    val action: String = "create",
    val conversationId: String? = null,
    val senderDeviceId: String,
    val encryptedSizeBytes: Long,
    val ciphertextSha256: String,
    val encryptedThumbnail: EncryptedThumbnailDto? = null,
)

@Serializable
data class EncryptedThumbnailDto(
    val sizeBytes: Long,
    val ciphertextSha256: String,
)

@Serializable
data class CreateUploadResponseDto(
    val uploadId: String,
    val chunkSizeBytes: Int,
    val totalChunks: Int,
    val expiresAt: String,
    val thumbnailUpload: PresignedUploadDto? = null,
)

@Serializable
data class PresignedUploadDto(
    val uploadUrl: String,
    val headers: Map<String, String> = emptyMap(),
)

@Serializable
data class UploadPartRequestDto(
    val action: String = "part",
    val uploadId: String,
    val partNumber: Int,
)

@Serializable
data class UploadPartResponseDto(
    val uploadId: String,
    val partNumber: Int,
    val sizeBytes: Long,
    val uploadUrl: String,
    val headers: Map<String, String> = emptyMap(),
)

@Serializable
data class RecordUploadPartRequestDto(
    val action: String = "recordPart",
    val uploadId: String,
    val partNumber: Int,
    val etag: String,
    val sizeBytes: Long,
)

@Serializable
data class CompleteUploadRequestDto(
    val action: String = "complete",
    val uploadId: String,
    val ciphertextSha256: String,
)

@Serializable
data class OkResponseDto(
    val ok: Boolean,
)
