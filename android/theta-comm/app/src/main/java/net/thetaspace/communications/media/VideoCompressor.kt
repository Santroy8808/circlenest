package net.thetaspace.communications.media

import android.content.Context
import android.net.Uri
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

class VideoCompressor(
    private val context: Context,
) {
    suspend fun compress(uri: Uri, attachmentId: String): File? =
        withContext(Dispatchers.Main) {
            val output = File(
                context.cacheDir,
                "theta_comm_video/$attachmentId.mp4",
            ).apply {
                parentFile?.mkdirs()
                delete()
            }
            suspendCancellableCoroutine { continuation ->
                val edited = EditedMediaItem.Builder(MediaItem.fromUri(uri))
                    .setEffects(
                        Effects(
                            emptyList(),
                            listOf<Effect>(Presentation.createForHeight(1_080)),
                        ),
                    )
                    .build()
                lateinit var transformer: Transformer
                transformer = Transformer.Builder(context)
                    .setVideoMimeType(MimeTypes.VIDEO_H264)
                    .setAudioMimeType(MimeTypes.AUDIO_AAC)
                    .addListener(
                        object : Transformer.Listener {
                            override fun onCompleted(
                                composition: Composition,
                                result: ExportResult,
                            ) {
                                if (continuation.isActive) continuation.resume(output)
                            }

                            override fun onError(
                                composition: Composition,
                                result: ExportResult,
                                exception: ExportException,
                            ) {
                                output.delete()
                                if (continuation.isActive) {
                                    continuation.resumeWithException(exception)
                                }
                            }
                        },
                    )
                    .build()
                continuation.invokeOnCancellation {
                    transformer.cancel()
                    output.delete()
                }
                transformer.start(edited, output.absolutePath)
            }
        }
}
