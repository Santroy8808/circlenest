package net.thetaspace.communications.media

import android.content.Context
import android.media.MediaRecorder
import java.io.File

class VoiceRecorder(
    private val context: Context,
) {
    private var recorder: MediaRecorder? = null
    private var output: File? = null

    @Suppress("DEPRECATION")
    fun start(): File {
        check(recorder == null) { "A voice note is already recording." }
        val file = File(
            context.cacheDir,
            "theta_comm_voice/${System.currentTimeMillis()}.m4a",
        ).apply {
            parentFile?.mkdirs()
        }
        val next = MediaRecorder().apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioEncodingBitRate(64_000)
            setAudioSamplingRate(44_100)
            setOutputFile(file.absolutePath)
            prepare()
            start()
        }
        output = file
        recorder = next
        return file
    }

    fun stop(): File? {
        val active = recorder ?: return null
        val file = output
        return try {
            active.stop()
            file?.takeIf { it.length() > 0L }
        } catch (_: RuntimeException) {
            file?.delete()
            null
        } finally {
            active.reset()
            active.release()
            recorder = null
            output = null
        }
    }

    fun cancel() {
        stop()?.delete()
    }
}
