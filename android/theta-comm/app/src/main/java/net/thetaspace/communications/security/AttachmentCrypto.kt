package net.thetaspace.communications.security

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.security.DigestOutputStream
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.CipherOutputStream
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import net.thetaspace.communications.data.local.AttachmentEntity
import net.thetaspace.communications.media.VideoCompressor

data class PreparedEncryptedAttachment(
    val encryptedFile: File,
    val encryptedThumbnail: File?,
    val encryptedSizeBytes: Long,
    val ciphertextSha256: String,
    val thumbnailCiphertextSha256: String?,
    val key: ByteArray,
    val nonce: ByteArray,
    val thumbnailKey: ByteArray?,
    val thumbnailNonce: ByteArray?,
)

data class AttachmentSource(
    val uri: Uri,
    val filename: String,
    val mimeType: String,
    val byteSize: Long,
)

class AttachmentCrypto(
    private val context: Context,
) {
    private val secureRandom = SecureRandom()
    private val videoCompressor = VideoCompressor(context)
    private val outputDirectory = File(context.filesDir, "theta_comm_ciphertext")
        .apply { mkdirs() }

    suspend fun inspect(uri: Uri): AttachmentSource = withContext(Dispatchers.IO) {
        val localFile = uri.takeIf { it.scheme == "file" }?.path?.let(::File)
        var filename = "attachment"
        var byteSize = -1L
        if (localFile != null) {
            filename = localFile.name
            byteSize = localFile.length()
        } else {
            context.contentResolver.query(
                uri,
                arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
                null,
                null,
                null,
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (nameIndex >= 0) filename = cursor.getString(nameIndex) ?: filename
                    if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                        byteSize = cursor.getLong(sizeIndex)
                    }
                }
            }
        }
        val extension = filename.substringAfterLast('.', "").lowercase()
        val mimeType = context.contentResolver.getType(uri)
            ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
            ?: "application/octet-stream"
        if (byteSize < 0) {
            byteSize = context.contentResolver.openAssetFileDescriptor(uri, "r")?.use {
                it.length
            } ?: -1L
        }
        require(byteSize in 1..MAX_ATTACHMENT_BYTES) {
            "Attachments must be no larger than 250 MB."
        }
        AttachmentSource(uri, filename, mimeType, byteSize)
    }

    suspend fun prepare(attachment: AttachmentEntity): PreparedEncryptedAttachment =
        withContext(Dispatchers.IO) {
            val sourceUri = attachment.sourceUri?.let(Uri::parse)
                ?: error("Attachment source is unavailable.")
            val key = randomBytes(KEY_BYTES)
            val nonce = randomBytes(NONCE_BYTES)
            val output = File(outputDirectory, "${attachment.id}.bin")
            val normalizedImage =
                normalizedImageSource(sourceUri, attachment.mimeType, attachment.id)
            val normalizedVideo = if (
                attachment.mimeType == "video/mp4" &&
                attachment.byteSize >= VIDEO_COMPRESSION_THRESHOLD
            ) {
                runCatching {
                    videoCompressor.compress(sourceUri, attachment.id)
                }.getOrNull()?.let { compressed ->
                    compressed.takeIf {
                        it.length() in 1L until attachment.byteSize
                    } ?: run {
                        compressed.delete()
                        null
                    }
                }
            } else {
                null
            }
            val normalized = normalizedImage ?: normalizedVideo
            val encrypted = try {
                val input = normalized?.inputStream()
                    ?: sourceUri.takeIf { it.scheme == "file" }
                        ?.path
                        ?.let(::FileInputStream)
                    ?: context.contentResolver.openInputStream(sourceUri)
                    ?: error("Attachment cannot be opened.")
                input.use {
                    encryptStream(it, output, key, nonce)
                }
            } finally {
                normalized?.delete()
            }

            val thumbnailBytes = createThumbnail(sourceUri, attachment.mimeType)
            val thumbnail = thumbnailBytes?.let { bytes ->
                val thumbnailKey = randomBytes(KEY_BYTES)
                val thumbnailNonce = randomBytes(NONCE_BYTES)
                val thumbnailFile = File(outputDirectory, "${attachment.id}.thumb.bin")
                val encryptedThumbnail = ByteArrayInputStream(bytes).use {
                    encryptStream(it, thumbnailFile, thumbnailKey, thumbnailNonce)
                }
                ThumbnailResult(
                    file = thumbnailFile,
                    sha256 = encryptedThumbnail.sha256,
                    key = thumbnailKey,
                    nonce = thumbnailNonce,
                )
            }

            PreparedEncryptedAttachment(
                encryptedFile = output,
                encryptedThumbnail = thumbnail?.file,
                encryptedSizeBytes = encrypted.size,
                ciphertextSha256 = encrypted.sha256,
                thumbnailCiphertextSha256 = thumbnail?.sha256,
                key = key,
                nonce = nonce,
                thumbnailKey = thumbnail?.key,
                thumbnailNonce = thumbnail?.nonce,
            )
        }

    suspend fun decryptToCache(
        encryptedFile: File,
        key: ByteArray,
        nonce: ByteArray,
        outputName: String,
    ): File = withContext(Dispatchers.IO) {
        val safeName = outputName.replace(Regex("[^A-Za-z0-9._-]"), "_").take(120)
        val output = File(context.cacheDir, "theta_comm_open/$safeName").apply {
            parentFile?.mkdirs()
        }
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(
                Cipher.DECRYPT_MODE,
                SecretKeySpec(key, "AES"),
                GCMParameterSpec(TAG_BITS, nonce),
            )
        }
        FileInputStream(encryptedFile).use { input ->
            cipher.wrapInput(input).use { decrypted ->
                FileOutputStream(output).use { destination ->
                    decrypted.copyTo(destination, BUFFER_BYTES)
                }
            }
        }
        output
    }

    fun deleteOwnedPlaintextSource(sourceUri: String?) {
        val uri = sourceUri?.let(Uri::parse) ?: return
        if (uri.scheme != "file") return
        val source = uri.path?.let(::File) ?: return
        val voiceDirectory = File(context.cacheDir, "theta_comm_voice")
        val sourcePath = runCatching { source.canonicalPath }.getOrNull() ?: return
        val voicePath = runCatching { voiceDirectory.canonicalPath }.getOrNull() ?: return
        if (sourcePath.startsWith("$voicePath${File.separator}")) {
            source.delete()
        }
    }

    fun clearLocalFiles() {
        outputDirectory.deleteRecursively()
        outputDirectory.mkdirs()
        listOf(
            "theta_comm_open",
            "theta_comm_video",
            "theta_comm_voice",
        ).forEach { directory ->
            context.cacheDir.resolve(directory).deleteRecursively()
        }
        context.cacheDir.listFiles()
            ?.filter { it.isFile && it.name.endsWith(".normalized.jpg") }
            ?.forEach(File::delete)
    }

    private suspend fun encryptStream(
        input: InputStream,
        output: File,
        key: ByteArray,
        nonce: ByteArray,
    ): EncryptedResult {
        val digest = MessageDigest.getInstance("SHA-256")
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(
                Cipher.ENCRYPT_MODE,
                SecretKeySpec(key, "AES"),
                GCMParameterSpec(TAG_BITS, nonce),
            )
        }
        FileOutputStream(output).use { file ->
            DigestOutputStream(file, digest).use { digestStream ->
                CipherOutputStream(digestStream, cipher).use { encrypted ->
                    val buffer = ByteArray(BUFFER_BYTES)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        kotlinx.coroutines.currentCoroutineContext().ensureActive()
                        encrypted.write(buffer, 0, read)
                    }
                }
            }
        }
        return EncryptedResult(
            size = output.length(),
            sha256 = digest.digest().toHex(),
        )
    }

    private fun normalizedImageSource(uri: Uri, mimeType: String, id: String): File? {
        if (mimeType != "image/jpeg") return null
        val bitmap = decodeSampledBitmap(uri, MAX_IMAGE_DIMENSION) ?: return null
        val output = File(context.cacheDir, "$id.normalized.jpg")
        FileOutputStream(output).use {
            bitmap.compress(Bitmap.CompressFormat.JPEG, 84, it)
        }
        bitmap.recycle()
        return output
    }

    private fun createThumbnail(uri: Uri, mimeType: String): ByteArray? {
        val bitmap = when {
            mimeType.startsWith("image/") -> decodeSampledBitmap(uri, THUMBNAIL_DIMENSION)
            mimeType.startsWith("video/") -> runCatching {
                val retriever = MediaMetadataRetriever()
                try {
                    retriever.setDataSource(context, uri)
                    retriever.getFrameAtTime(
                        1_000_000,
                        MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                    )
                } finally {
                    retriever.release()
                }
            }.getOrNull()
            else -> null
        } ?: return null
        val output = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 76, output)
        bitmap.recycle()
        return output.toByteArray()
    }

    private fun decodeSampledBitmap(uri: Uri, maximumDimension: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, bounds)
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (
            bounds.outWidth / (sample * 2) >= maximumDimension ||
            bounds.outHeight / (sample * 2) >= maximumDimension
        ) {
            sample *= 2
        }
        val options = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoded = context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, options)
        } ?: return null
        val scaled = scaleWithin(decoded, maximumDimension)
        if (scaled !== decoded) decoded.recycle()
        return scaled
    }

    private fun scaleWithin(bitmap: Bitmap, maximumDimension: Int): Bitmap {
        val largest = maxOf(bitmap.width, bitmap.height)
        if (largest <= maximumDimension) return bitmap
        val scale = maximumDimension.toFloat() / largest
        return Bitmap.createScaledBitmap(
            bitmap,
            (bitmap.width * scale).toInt().coerceAtLeast(1),
            (bitmap.height * scale).toInt().coerceAtLeast(1),
            true,
        )
    }

    private fun Cipher.wrapInput(input: InputStream): InputStream =
        javax.crypto.CipherInputStream(input, this)

    private fun randomBytes(size: Int) = ByteArray(size).also(secureRandom::nextBytes)

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

    private data class EncryptedResult(
        val size: Long,
        val sha256: String,
    )

    private data class ThumbnailResult(
        val file: File,
        val sha256: String,
        val key: ByteArray,
        val nonce: ByteArray,
    )

    private companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val KEY_BYTES = 32
        const val NONCE_BYTES = 12
        const val TAG_BITS = 128
        const val BUFFER_BYTES = 64 * 1024
        const val MAX_IMAGE_DIMENSION = 2_048
        const val THUMBNAIL_DIMENSION = 480
        const val VIDEO_COMPRESSION_THRESHOLD = 8L * 1024 * 1024
        const val MAX_ATTACHMENT_BYTES = 250L * 1024 * 1024 - 32
    }
}
