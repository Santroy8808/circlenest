package net.thetaspace.communications.data

import java.io.File
import java.io.RandomAccessFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import net.thetaspace.communications.data.local.AttachmentEntity
import net.thetaspace.communications.data.local.AttachmentStates
import net.thetaspace.communications.data.local.ThetaCommDao
import net.thetaspace.communications.data.remote.CompleteUploadRequestDto
import net.thetaspace.communications.data.remote.CreateUploadRequestDto
import net.thetaspace.communications.data.remote.EncryptedThumbnailDto
import net.thetaspace.communications.data.remote.ThetaCommApi

class EncryptedAttachmentUploader(
    private val api: ThetaCommApi,
    private val dao: ThetaCommDao,
) {
    suspend fun upload(
        attachment: AttachmentEntity,
        conversationId: String,
        senderDeviceId: String,
    ): AttachmentEntity = withContext(Dispatchers.IO) {
        if (attachment.state == AttachmentStates.UPLOADED && attachment.uploadId != null) {
            return@withContext attachment
        }
        val encryptedFile = attachment.encryptedFilePath?.let(::File)
            ?.takeIf(File::exists)
            ?: error("Encrypted attachment is unavailable.")
        val encryptedSize = attachment.encryptedSizeBytes ?: encryptedFile.length()
        val checksum = attachment.ciphertextSha256
            ?: error("Attachment checksum is unavailable.")
        val thumbnailFile = attachment.encryptedThumbnailPath?.let(::File)
            ?.takeIf(File::exists)

        val resumed = attachment.uploadId?.let { uploadId ->
            runCatching { api.uploadStatus(uploadId) }.getOrNull()
        }
        if (resumed?.status == "UPLOADED") {
            dao.updateAttachmentProgress(
                attachmentId = attachment.id,
                uploadId = resumed.uploadId,
                uploadedBytes = encryptedSize,
                state = AttachmentStates.UPLOADED,
            )
            return@withContext dao.attachment(attachment.id) ?: attachment.copy(
                uploadId = resumed.uploadId,
                uploadedBytes = encryptedSize,
                state = AttachmentStates.UPLOADED,
            )
        }
        val session = if (resumed != null) {
            check(resumed.encryptedSizeBytes.toLong() == encryptedSize) {
                "Encrypted upload size changed."
            }
            UploadSession(
                uploadId = resumed.uploadId,
                chunkSizeBytes = resumed.chunkSizeBytes,
                totalChunks = resumed.totalChunks,
                uploadedBytes = resumed.uploadedSizeBytes.toLong(),
                completedPartNumbers = resumed.completedPartNumbers.toSet(),
                thumbnailRequired = resumed.thumbnailRequired,
            )
        } else {
            val created = api.createUpload(
                CreateUploadRequestDto(
                    conversationId = conversationId,
                    senderDeviceId = senderDeviceId,
                    encryptedSizeBytes = encryptedSize,
                    ciphertextSha256 = checksum,
                    encryptedThumbnail = thumbnailFile?.let {
                        EncryptedThumbnailDto(
                            sizeBytes = it.length(),
                            ciphertextSha256 = attachment.thumbnailCiphertextSha256
                                ?: error("Thumbnail checksum is unavailable."),
                        )
                    },
                ),
            )
            UploadSession(
                uploadId = created.uploadId,
                chunkSizeBytes = created.chunkSizeBytes,
                totalChunks = created.totalChunks,
                uploadedBytes = 0,
                completedPartNumbers = emptySet(),
                thumbnailRequired = created.thumbnailRequired,
            )
        }
        dao.updateAttachmentProgress(
            attachmentId = attachment.id,
            uploadId = session.uploadId,
            uploadedBytes = session.uploadedBytes,
            state = AttachmentStates.UPLOADING,
        )

        if (thumbnailFile != null && session.thumbnailRequired) {
            api.uploadThumbnail(session.uploadId, thumbnailFile.readBytes())
        }

        RandomAccessFile(encryptedFile, "r").use { source ->
            var uploaded = session.uploadedBytes
            for (partNumber in 1..session.totalChunks) {
                kotlinx.coroutines.currentCoroutineContext().ensureActive()
                if (partNumber in session.completedPartNumbers) continue
                val offset = (partNumber - 1L) * session.chunkSizeBytes
                val remaining = encryptedSize - offset
                val partSize = minOf(session.chunkSizeBytes.toLong(), remaining).toInt()
                val bytes = ByteArray(partSize)
                source.seek(offset)
                source.readFully(bytes)
                api.uploadPart(session.uploadId, partNumber, bytes)
                uploaded += bytes.size
                dao.updateAttachmentProgress(
                    attachmentId = attachment.id,
                    uploadId = session.uploadId,
                    uploadedBytes = uploaded,
                    state = AttachmentStates.UPLOADING,
                )
            }
        }
        api.completeUpload(
            CompleteUploadRequestDto(
                uploadId = session.uploadId,
                ciphertextSha256 = checksum,
            ),
        )
        dao.updateAttachmentProgress(
            attachmentId = attachment.id,
            uploadId = session.uploadId,
            uploadedBytes = encryptedSize,
            state = AttachmentStates.UPLOADED,
        )
        dao.attachment(attachment.id) ?: attachment.copy(
            uploadId = session.uploadId,
            uploadedBytes = encryptedSize,
            state = AttachmentStates.UPLOADED,
        )
    }

    private data class UploadSession(
        val uploadId: String,
        val chunkSizeBytes: Int,
        val totalChunks: Int,
        val uploadedBytes: Long,
        val completedPartNumbers: Set<Int>,
        val thumbnailRequired: Boolean,
    )
}
