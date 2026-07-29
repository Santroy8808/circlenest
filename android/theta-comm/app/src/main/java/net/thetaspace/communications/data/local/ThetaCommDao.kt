package net.thetaspace.communications.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

data class ConversationSummary(
    val id: String,
    val type: String,
    val sealedTitle: String?,
    val sealedAvatarReference: String?,
    val lastMessageAt: Long?,
    val unreadCount: Int,
    val isPinned: Boolean,
    val isArchived: Boolean,
    val mutedUntil: Long?,
    val lastSealedBody: String?,
    val lastMessageKind: String?,
    val lastMessageState: String?,
)

@Dao
interface ThetaCommDao {
    @Query(
        """
        SELECT c.id, c.type, c.sealedTitle, c.sealedAvatarReference, c.lastMessageAt,
               c.unreadCount, c.isPinned, c.isArchived, c.mutedUntil,
               m.sealedBody AS lastSealedBody, m.kind AS lastMessageKind,
               m.state AS lastMessageState
          FROM conversations c
          LEFT JOIN messages m ON m.clientMessageId = (
              SELECT latest.clientMessageId
                FROM messages latest
               WHERE latest.conversationId = c.id
               ORDER BY COALESCE(latest.sequence, 9223372036854775807) DESC,
                        latest.createdAt DESC
               LIMIT 1
          )
         WHERE c.isArchived = :archived
         ORDER BY c.isPinned DESC, COALESCE(c.lastMessageAt, c.updatedAt) DESC
        """,
    )
    fun observeConversationSummaries(archived: Boolean = false): Flow<List<ConversationSummary>>

    @Query("SELECT * FROM conversations WHERE id = :id")
    fun observeConversation(id: String): Flow<ConversationEntity?>

    @Query("SELECT * FROM conversations WHERE id = :id")
    suspend fun conversation(id: String): ConversationEntity?

    @Query("UPDATE conversations SET sealedTitle = :sealedTitle, updatedAt = :updatedAt WHERE id = :conversationId")
    suspend fun updateConversationTitle(
        conversationId: String,
        sealedTitle: String,
        updatedAt: Long,
    )

    @Query(
        """
        SELECT * FROM messages
         WHERE conversationId = :conversationId
         ORDER BY COALESCE(sequence, 9223372036854775807), createdAt, clientMessageId
        """,
    )
    fun observeMessages(conversationId: String): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages WHERE clientMessageId = :clientMessageId")
    suspend fun message(clientMessageId: String): MessageEntity?

    @Query("SELECT * FROM messages WHERE serverMessageId = :serverMessageId LIMIT 1")
    suspend fun messageByServerId(serverMessageId: String): MessageEntity?

    @Query("SELECT * FROM participants WHERE conversationId = :conversationId AND leftAt IS NULL AND removedAt IS NULL")
    fun observeActiveParticipants(conversationId: String): Flow<List<ParticipantEntity>>

    @Query("SELECT * FROM participants WHERE conversationId = :conversationId AND leftAt IS NULL AND removedAt IS NULL")
    suspend fun activeParticipants(conversationId: String): List<ParticipantEntity>

    @Query("SELECT * FROM participants WHERE conversationId = :conversationId ORDER BY joinedAt")
    fun observeParticipants(conversationId: String): Flow<List<ParticipantEntity>>

    @Query("SELECT * FROM receipts WHERE messageId = :messageId")
    fun observeReceipts(messageId: String): Flow<List<ReceiptEntity>>

    @Query("SELECT * FROM attachments WHERE clientMessageId = :clientMessageId ORDER BY id")
    fun observeAttachments(clientMessageId: String): Flow<List<AttachmentEntity>>

    @Query(
        """
        SELECT a.* FROM attachments a
        INNER JOIN messages m ON m.clientMessageId = a.clientMessageId
        WHERE m.conversationId = :conversationId
        ORDER BY m.createdAt, a.id
        """,
    )
    fun observeConversationAttachments(conversationId: String): Flow<List<AttachmentEntity>>

    @Query("SELECT * FROM attachments WHERE clientMessageId = :clientMessageId ORDER BY id")
    suspend fun attachments(clientMessageId: String): List<AttachmentEntity>

    @Query("SELECT * FROM attachments WHERE id = :attachmentId")
    suspend fun attachment(attachmentId: String): AttachmentEntity?

    @Query(
        """
        UPDATE attachments
           SET encryptedFilePath = :encryptedFilePath,
               encryptedThumbnailPath = :encryptedThumbnailPath,
               encryptedSizeBytes = :encryptedSizeBytes,
               uploadedBytes = :downloadedBytes,
               state = :state
         WHERE id = :attachmentId
        """,
    )
    suspend fun markAttachmentDownloaded(
        attachmentId: String,
        encryptedFilePath: String,
        encryptedThumbnailPath: String?,
        encryptedSizeBytes: Long,
        downloadedBytes: Long,
        state: String,
    )

    @Query("UPDATE attachments SET uploadedBytes = :downloadedBytes, state = :state WHERE id = :attachmentId")
    suspend fun updateAttachmentDownloadProgress(
        attachmentId: String,
        downloadedBytes: Long,
        state: String,
    )

    @Query("SELECT * FROM drafts WHERE conversationId = :conversationId")
    fun observeDraft(conversationId: String): Flow<DraftEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertConversations(items: List<ConversationEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertParticipants(items: List<ParticipantEntity>)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertMessage(message: MessageEntity): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertMessage(message: MessageEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertReceipts(items: List<ReceiptEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAttachment(attachment: AttachmentEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertDraft(draft: DraftEntity)

    @Query("DELETE FROM drafts WHERE conversationId = :conversationId")
    suspend fun deleteDraft(conversationId: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPendingOperation(operation: PendingOperationEntity)

    @Query(
        """
        SELECT * FROM pending_operations
         WHERE state IN ('QUEUED', 'FAILED') AND nextAttemptAt <= :now
         ORDER BY createdAt
         LIMIT :limit
        """,
    )
    suspend fun readyOperations(now: Long, limit: Int = 20): List<PendingOperationEntity>

    @Query(
        """
        UPDATE pending_operations
           SET state = :state, attempts = :attempts, nextAttemptAt = :nextAttemptAt,
               lastError = :lastError
         WHERE id = :id
        """,
    )
    suspend fun updateOperation(
        id: String,
        state: String,
        attempts: Int,
        nextAttemptAt: Long,
        lastError: String?,
    )

    @Query("DELETE FROM pending_operations WHERE id = :id")
    suspend fun deleteOperation(id: String)

    @Query(
        """
        UPDATE messages
           SET state = :state, retryCount = :retryCount, failureCode = :failureCode
         WHERE clientMessageId = :clientMessageId
        """,
    )
    suspend fun updateMessageState(
        clientMessageId: String,
        state: String,
        retryCount: Int,
        failureCode: String?,
    )

    @Query(
        """
        UPDATE messages
           SET serverMessageId = :serverMessageId, sequence = :sequence,
               acceptedAt = :acceptedAt, state = 'SENT', failureCode = NULL
         WHERE clientMessageId = :clientMessageId
        """,
    )
    suspend fun markMessageAccepted(
        clientMessageId: String,
        serverMessageId: String,
        sequence: Long,
        acceptedAt: Long,
    )

    @Query(
        """
        UPDATE conversations
           SET lastMessageAt = :lastMessageAt, updatedAt = :lastMessageAt
         WHERE id = :conversationId
        """,
    )
    suspend fun touchConversation(conversationId: String, lastMessageAt: Long)

    @Query(
        """
        UPDATE conversations
           SET unreadCount = 0, updatedAt = :now
         WHERE id = :conversationId
        """,
    )
    suspend fun markConversationRead(conversationId: String, now: Long)

    @Query(
        """
        SELECT * FROM messages
         WHERE conversationId = :conversationId
           AND senderUserId != :currentUserId
           AND serverMessageId IS NOT NULL
           AND deletedAt IS NULL
        """,
    )
    suspend fun messagesToMarkSeen(
        conversationId: String,
        currentUserId: String,
    ): List<MessageEntity>

    @Query(
        """
        UPDATE attachments
           SET uploadId = :uploadId, uploadedBytes = :uploadedBytes, state = :state
         WHERE id = :attachmentId
        """,
    )
    suspend fun updateAttachmentProgress(
        attachmentId: String,
        uploadId: String?,
        uploadedBytes: Long,
        state: String,
    )

    @Query(
        """
        UPDATE attachments
           SET encryptedFilePath = :encryptedFilePath,
               encryptedThumbnailPath = :encryptedThumbnailPath,
               encryptedSizeBytes = :encryptedSizeBytes,
               ciphertextSha256 = :ciphertextSha256,
               thumbnailCiphertextSha256 = :thumbnailCiphertextSha256,
               sealedEncryptionKey = :sealedEncryptionKey,
               sealedNonce = :sealedNonce,
               sealedThumbnailKey = :sealedThumbnailKey,
               sealedThumbnailNonce = :sealedThumbnailNonce,
               state = 'ENCRYPTED'
         WHERE id = :attachmentId
        """,
    )
    suspend fun markAttachmentEncrypted(
        attachmentId: String,
        encryptedFilePath: String,
        encryptedThumbnailPath: String?,
        encryptedSizeBytes: Long,
        ciphertextSha256: String,
        thumbnailCiphertextSha256: String?,
        sealedEncryptionKey: String,
        sealedNonce: String,
        sealedThumbnailKey: String?,
        sealedThumbnailNonce: String?,
    )

    @Query(
        """
        UPDATE attachments
           SET serverAttachmentId = :serverAttachmentId
         WHERE id = :attachmentId
        """,
    )
    suspend fun bindServerAttachment(attachmentId: String, serverAttachmentId: String)

    @Query("UPDATE attachments SET state = :state WHERE id = :attachmentId")
    suspend fun updateAttachmentState(attachmentId: String, state: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSyncState(state: SyncStateEntity)

    @Query("SELECT value FROM sync_state WHERE `key` = :key")
    suspend fun syncState(key: String): String?

    @Query("SELECT * FROM signal_records WHERE recordType = :type AND recordKey = :key")
    suspend fun signalRecord(type: String, key: String): SignalRecordEntity?

    @Query("SELECT * FROM signal_records WHERE recordType = :type")
    suspend fun signalRecords(type: String): List<SignalRecordEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSignalRecord(record: SignalRecordEntity)

    @Query("DELETE FROM signal_records WHERE recordType = :type AND recordKey = :key")
    suspend fun deleteSignalRecord(type: String, key: String)

    @Transaction
    suspend fun replaceConversationParticipants(
        conversationId: String,
        participants: List<ParticipantEntity>,
    ) {
        deleteConversationParticipants(conversationId)
        upsertParticipants(participants)
    }

    @Query("DELETE FROM participants WHERE conversationId = :conversationId")
    suspend fun deleteConversationParticipants(conversationId: String)
}
