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
import net.thetaspace.communications.data.remote.RecordUploadPartRequestDto
import net.thetaspace.communications.data.remote.ThetaCommApi
import net.thetaspace.communications.data.remote.UploadPartRequestDto
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class EncryptedAttachmentUploader(
    private val api: ThetaCommApi,
    private val httpClient: OkHttpClient,
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
        dao.updateAttachmentProgress(
            attachmentId = attachment.id,
            uploadId = created.uploadId,
            uploadedBytes = 0,
            state = AttachmentStates.UPLOADING,
        )

        if (thumbnailFile != null && created.thumbnailUpload != null) {
            putBytes(
                url = created.thumbnailUpload.uploadUrl,
                bytes = thumbnailFile.readBytes(),
                headers = created.thumbnailUpload.headers,
            )
        }

        RandomAccessFile(encryptedFile, "r").use { source ->
            var uploaded = 0L
            for (partNumber in 1..created.totalChunks) {
                kotlinx.coroutines.currentCoroutineContext().ensureActive()
                val remaining = encryptedSize - uploaded
                val partSize = minOf(created.chunkSizeBytes.toLong(), remaining).toInt()
                val bytes = ByteArray(partSize)
                source.seek(uploaded)
                source.readFully(bytes)
                val part = api.requestUploadPart(
                    UploadPartRequestDto(
                        uploadId = created.uploadId,
                        partNumber = partNumber,
                    ),
                )
                val etag = putBytes(part.uploadUrl, bytes, part.headers)
                api.recordUploadPart(
                    RecordUploadPartRequestDto(
                        uploadId = created.uploadId,
                        partNumber = partNumber,
                        etag = etag,
                        sizeBytes = bytes.size.toLong(),
                    ),
                )
                uploaded += bytes.size
                dao.updateAttachmentProgress(
                    attachmentId = attachment.id,
                    uploadId = created.uploadId,
                    uploadedBytes = uploaded,
                    state = AttachmentStates.UPLOADING,
                )
            }
        }
        api.completeUpload(
            CompleteUploadRequestDto(
                uploadId = created.uploadId,
                ciphertextSha256 = checksum,
            ),
        )
        dao.updateAttachmentProgress(
            attachmentId = attachment.id,
            uploadId = created.uploadId,
            uploadedBytes = encryptedSize,
            state = AttachmentStates.UPLOADED,
        )
        dao.attachment(attachment.id) ?: attachment.copy(
            uploadId = created.uploadId,
            uploadedBytes = encryptedSize,
            state = AttachmentStates.UPLOADED,
        )
    }

    private fun putBytes(
        url: String,
        bytes: ByteArray,
        headers: Map<String, String>,
    ): String {
        val builder = Request.Builder()
            .url(url)
            .put(bytes.toRequestBody(BINARY))
        headers.forEach(builder::header)
        httpClient.newCall(builder.build()).execute().use { response ->
            if (!response.isSuccessful) {
                error("Encrypted upload failed (${response.code}).")
            }
            return response.header("ETag")?.trim()
                ?: error("Encrypted upload did not return an ETag.")
        }
    }

    private companion object {
        val BINARY = "application/octet-stream".toMediaType()
    }
}
