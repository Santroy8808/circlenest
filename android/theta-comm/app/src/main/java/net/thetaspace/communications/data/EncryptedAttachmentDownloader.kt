package net.thetaspace.communications.data

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import net.thetaspace.communications.data.local.AttachmentEntity
import net.thetaspace.communications.data.local.AttachmentStates
import net.thetaspace.communications.data.local.ThetaCommDao
import net.thetaspace.communications.data.remote.ThetaCommApi
import okhttp3.OkHttpClient
import okhttp3.Request

class EncryptedAttachmentDownloader(
    context: Context,
    private val api: ThetaCommApi,
    private val httpClient: OkHttpClient,
    private val dao: ThetaCommDao,
) {
    private val ciphertextDirectory = File(
        context.filesDir,
        "theta_comm_ciphertext",
    ).apply(File::mkdirs)

    suspend fun download(attachmentId: String): AttachmentEntity =
        withContext(Dispatchers.IO) {
            val existing = dao.attachment(attachmentId)
                ?: error("Attachment is unavailable.")
            val existingFile = existing.encryptedFilePath?.let(::File)
            if (
                existing.state == AttachmentStates.READY &&
                existingFile?.exists() == true
            ) {
                return@withContext existing
            }
            val serverAttachmentId = existing.serverAttachmentId
                ?: error("The server attachment is unavailable.")
            val remote = api.attachmentDownload(serverAttachmentId)
            val expectedSize = remote.encryptedSizeBytes.toLong()
            val encryptedFile = File(ciphertextDirectory, "$attachmentId.bin")
            val thumbnailFile = remote.thumbnailUrl?.let {
                File(ciphertextDirectory, "$attachmentId.thumb.bin")
            }

            try {
                dao.updateAttachmentDownloadProgress(
                    attachmentId,
                    encryptedFile.length(),
                    AttachmentStates.DOWNLOADING,
                )
                downloadToFile(
                    remote.downloadUrl,
                    encryptedFile,
                    expectedSize,
                ) { downloaded ->
                    dao.updateAttachmentDownloadProgress(
                        attachmentId,
                        downloaded,
                        AttachmentStates.DOWNLOADING,
                    )
                }
                if (encryptedFile.length() != expectedSize) {
                    error("Encrypted attachment download is incomplete.")
                }
                if (remote.thumbnailUrl != null && thumbnailFile != null) {
                    downloadToFile(
                        remote.thumbnailUrl,
                        thumbnailFile,
                        expectedSize = null,
                    )
                }
                dao.markAttachmentDownloaded(
                    attachmentId = attachmentId,
                    encryptedFilePath = encryptedFile.absolutePath,
                    encryptedThumbnailPath = thumbnailFile?.absolutePath,
                    encryptedSizeBytes = expectedSize,
                    downloadedBytes = expectedSize,
                    state = AttachmentStates.READY,
                )
                dao.attachment(attachmentId) ?: existing.copy(
                    encryptedFilePath = encryptedFile.absolutePath,
                    encryptedThumbnailPath = thumbnailFile?.absolutePath,
                    encryptedSizeBytes = expectedSize,
                    uploadedBytes = expectedSize,
                    state = AttachmentStates.READY,
                )
            } catch (error: Exception) {
                dao.updateAttachmentDownloadProgress(
                    attachmentId,
                    encryptedFile.length(),
                    AttachmentStates.FAILED,
                )
                throw error
            }
        }

    private suspend fun downloadToFile(
        url: String,
        output: File,
        expectedSize: Long?,
        onProgress: suspend (Long) -> Unit = {},
    ) {
        if (expectedSize != null && output.length() == expectedSize) return
        val existingBytes = output.length()
        val request = Request.Builder()
            .url(url)
            .apply {
                if (existingBytes > 0L) {
                    header("Range", "bytes=$existingBytes-")
                }
            }
            .get()
            .build()

        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                error("Encrypted attachment download failed (${response.code}).")
            }
            val append = existingBytes > 0L && response.code == 206
            val body = response.body ?: error("Encrypted attachment response is empty.")
            FileOutputStream(output, append).use { destination ->
                body.byteStream().use { input ->
                    val buffer = ByteArray(64 * 1024)
                    var downloaded = if (append) existingBytes else 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        kotlinx.coroutines.currentCoroutineContext().ensureActive()
                        destination.write(buffer, 0, read)
                        downloaded += read
                        onProgress(downloaded)
                    }
                }
            }
        }
    }
}
