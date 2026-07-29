package net.thetaspace.communications.data.local

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

object ConversationTypes {
    const val DIRECT = "DIRECT"
    const val GROUP = "GROUP"
}

object MessageStates {
    const val QUEUED = "QUEUED"
    const val ENCRYPTING = "ENCRYPTING"
    const val UPLOADING = "UPLOADING"
    const val SENDING = "SENDING"
    const val SENT = "SENT"
    const val DELIVERED = "DELIVERED"
    const val SEEN = "SEEN"
    const val FAILED = "FAILED"
}

object MessageKinds {
    const val TEXT = "TEXT"
    const val IMAGE = "IMAGE"
    const val VIDEO = "VIDEO"
    const val GIF = "GIF"
    const val FILE = "FILE"
    const val VOICE = "VOICE"
    const val REACTION = "REACTION"
    const val EDIT = "EDIT"
    const val DELETE = "DELETE"
    const val SYSTEM = "SYSTEM"
}

@Entity(
    tableName = "conversations",
    indices = [
        Index(value = ["lastMessageAt"]),
        Index(value = ["isPinned", "isArchived"]),
    ],
)
data class ConversationEntity(
    @androidx.room.PrimaryKey val id: String,
    val type: String,
    val sealedTitle: String?,
    val sealedAvatarReference: String?,
    val membershipVersion: Int,
    val lastSequence: Long,
    val lastMessageAt: Long?,
    val unreadCount: Int,
    val isPinned: Boolean,
    val isArchived: Boolean,
    val mutedUntil: Long?,
    val notificationLevel: String,
    val updatedAt: Long,
)

@Entity(
    tableName = "participants",
    primaryKeys = ["conversationId", "userId"],
    foreignKeys = [
        ForeignKey(
            entity = ConversationEntity::class,
            parentColumns = ["id"],
            childColumns = ["conversationId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("conversationId"), Index("userId")],
)
data class ParticipantEntity(
    val conversationId: String,
    val userId: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String?,
    val role: String,
    val joinedAt: Long,
    val leftAt: Long?,
    val removedAt: Long?,
)

@Entity(
    tableName = "messages",
    foreignKeys = [
        ForeignKey(
            entity = ConversationEntity::class,
            parentColumns = ["id"],
            childColumns = ["conversationId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index(value = ["serverMessageId"], unique = true),
        Index(value = ["conversationId", "sequence"]),
        Index(value = ["conversationId", "createdAt"]),
        Index(value = ["state"]),
    ],
)
data class MessageEntity(
    @androidx.room.PrimaryKey val clientMessageId: String,
    val serverMessageId: String?,
    val conversationId: String,
    val senderUserId: String,
    val senderDeviceId: String,
    val kind: String,
    val sealedBody: String?,
    val serverCiphertext: String?,
    val protocolVersion: Int,
    val membershipVersion: Int,
    val replyToMessageId: String?,
    val eventTargetMessageId: String?,
    val sequence: Long?,
    val createdAt: Long,
    val acceptedAt: Long?,
    val editedAt: Long?,
    val deletedAt: Long?,
    val state: String,
    val retryCount: Int,
    val failureCode: String?,
)

@Entity(
    tableName = "receipts",
    primaryKeys = ["messageId", "userId", "deviceId"],
    indices = [Index("messageId"), Index("userId")],
)
data class ReceiptEntity(
    val messageId: String,
    val userId: String,
    val deviceId: String,
    val deliveredAt: Long?,
    val seenAt: Long?,
)

@Entity(
    tableName = "attachments",
    foreignKeys = [
        ForeignKey(
            entity = MessageEntity::class,
            parentColumns = ["clientMessageId"],
            childColumns = ["clientMessageId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("clientMessageId"), Index("uploadId")],
)
data class AttachmentEntity(
    @androidx.room.PrimaryKey val id: String,
    val clientMessageId: String,
    val kind: String,
    val sealedFilename: String,
    val sealedCaption: String?,
    val mimeType: String,
    val byteSize: Long,
    val sourceUri: String?,
    val encryptedFilePath: String?,
    val encryptedThumbnailPath: String?,
    val ciphertextSha256: String?,
    val uploadId: String?,
    val uploadedBytes: Long,
    val state: String,
)

@Entity(
    tableName = "drafts",
    foreignKeys = [
        ForeignKey(
            entity = ConversationEntity::class,
            parentColumns = ["id"],
            childColumns = ["conversationId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
)
data class DraftEntity(
    @androidx.room.PrimaryKey val conversationId: String,
    val sealedText: String,
    val updatedAt: Long,
)

@Entity(
    tableName = "pending_operations",
    indices = [
        Index("clientMessageId"),
        Index("state", "nextAttemptAt"),
    ],
)
data class PendingOperationEntity(
    @androidx.room.PrimaryKey val id: String,
    val clientMessageId: String?,
    val type: String,
    val state: String,
    val attempts: Int,
    val nextAttemptAt: Long,
    val lastError: String?,
    val createdAt: Long,
)

@Entity(tableName = "sync_state")
data class SyncStateEntity(
    @androidx.room.PrimaryKey val key: String,
    val value: String,
)

@Entity(
    tableName = "signal_records",
    primaryKeys = ["recordType", "recordKey"],
)
data class SignalRecordEntity(
    val recordType: String,
    val recordKey: String,
    val sealedValue: ByteArray,
    val updatedAt: Long,
)
