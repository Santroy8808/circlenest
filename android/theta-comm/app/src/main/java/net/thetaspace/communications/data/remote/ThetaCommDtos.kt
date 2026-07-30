package net.thetaspace.communications.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull

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
    val recipientKeyVersion: Int,
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
data class RegisterDeviceRequestDto(
    val deviceId: String,
    val platform: String = "android",
    val appVersion: String,
    val registrationId: Int,
    val identityKey: String,
    val signedPreKey: SignedPreKeyDto,
    val oneTimePreKeys: List<PreKeyDto>,
    val oneTimeKyberPreKeys: List<KyberPreKeyDto>,
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
    val keyVersion: Int = 1,
    val identityKeyFingerprint: String? = null,
)

@Serializable
data class RegisterDeviceResponseDto(
    val device: DeviceDto,
    val preKeyCount: Int,
    val kyberPreKeyCount: Int,
    val identityChanged: Boolean,
)

@Serializable
data class ReplenishPreKeysRequestDto(
    val deviceId: String,
    val oneTimePreKeys: List<PreKeyDto>,
    val oneTimeKyberPreKeys: List<KyberPreKeyDto>,
)

@Serializable
data class ReplenishPreKeysResponseDto(
    val ok: Boolean,
    val available: Int,
    val kyberAvailable: Int,
)

@Serializable
data class PreKeyStatusResponseDto(
    val available: Int,
    val kyberAvailable: Int,
)

@Serializable
data class DeviceListResponseDto(
    val devices: List<DeviceDto>,
)

@Serializable
data class RevokeDeviceRequestDto(
    val deviceId: String,
)

@Serializable
data class RevokeDeviceResponseDto(
    val ok: Boolean,
    val revokedAt: String,
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
    val keyVersion: Int,
)

@Serializable
data class PreKeyBundlesResponseDto(
    val bundles: List<PreKeyBundleDto>,
)

@Serializable
data class RecipientDeviceDto(
    val userId: String,
    val deviceId: String,
    val registrationId: Int,
    val identityKey: String,
    val keyVersion: Int,
)

@Serializable
data class RecipientDevicesResponseDto(
    val devices: List<RecipientDeviceDto>,
)

@Serializable
data class CreateDirectConversationRequestDto(
    val type: String = "DIRECT",
    val targetUserId: String,
)

@Serializable
data class CreateGroupConversationRequestDto(
    val type: String = "GROUP",
    val clientMessageId: String,
    val senderDeviceId: String,
    val clientCreatedAt: String,
    val participantUserIds: List<String>,
    val titleCiphertext: String,
    val metadataEnvelopes: List<RecipientEnvelopeDto>,
)

@Serializable
data class CreateConversationResponseDto(
    val conversation: ConversationDto,
    val created: Boolean,
)

@Serializable
data class ConversationPreferenceRequestDto(
    val archived: Boolean? = null,
    val pinned: Boolean? = null,
    val mutedUntil: String? = null,
    val notificationLevel: String? = null,
)

@Serializable
data class ConversationPreferenceResponseDto(
    val ok: Boolean,
    val preferences: ConversationPreferencesDto,
)

@Serializable
data class ClearConversationMuteRequestDto(
    val mutedUntil: JsonElement = JsonNull,
)

@Serializable
data class AddGroupMembersRequestDto(
    val action: String = "ADD_MEMBERS",
    val userIds: List<String>,
)

@Serializable
data class RemoveGroupMemberRequestDto(
    val action: String = "REMOVE_MEMBER",
    val userId: String,
)

@Serializable
data class SetGroupRoleRequestDto(
    val action: String = "SET_ROLE",
    val userId: String,
    val role: String,
)

@Serializable
data class LeaveGroupRequestDto(
    val action: String = "LEAVE",
)

@Serializable
data class RenameGroupRequestDto(
    val action: String = "RENAME",
    val titleCiphertext: String,
    val metadataEnvelopes: List<RecipientEnvelopeDto>,
)

@Serializable
data class SetGroupAvatarRequestDto(
    val action: String = "SET_AVATAR",
    val messageId: String? = null,
)

@Serializable
data class GroupCommandResponseDto(
    val ok: Boolean,
    val membershipVersion: Int,
    val systemMessageRequired: Boolean,
)

@Serializable
data class ContactSearchResponseDto(
    val people: List<ContactDto>,
)

@Serializable
data class ContactDto(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
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
    val thumbnailRequired: Boolean = false,
)

@Serializable
data class CompleteUploadRequestDto(
    val action: String = "complete",
    val uploadId: String,
    val ciphertextSha256: String,
)

@Serializable
data class UploadStatusRequestDto(
    val action: String = "status",
    val uploadId: String,
)

@Serializable
data class UploadStatusResponseDto(
    val uploadId: String,
    val status: String,
    val chunkSizeBytes: Int,
    val totalChunks: Int,
    val encryptedSizeBytes: String,
    val uploadedSizeBytes: String,
    val completedPartNumbers: List<Int>,
    val expiresAt: String,
    val thumbnailRequired: Boolean = false,
)

@Serializable
data class CancelUploadRequestDto(
    val action: String = "cancel",
    val uploadId: String,
)

@Serializable
data class AttachmentDownloadDto(
    val attachmentId: String,
    val encryptedSizeBytes: String,
    val chunkCount: Int,
    val downloadUrl: String,
    val thumbnailUrl: String? = null,
)

@Serializable
data class OkResponseDto(
    val ok: Boolean,
)

@Serializable
data class BlockUserRequestDto(
    val action: String = "BLOCK",
    val targetUserId: String,
)

@Serializable
data class ReportMessageRequestDto(
    val action: String = "REPORT",
    val conversationId: String,
    val messageId: String,
    val reason: String,
    val description: String,
)

@Serializable
data class ReportMessageResponseDto(
    val ok: Boolean,
    val ticketId: String,
)
