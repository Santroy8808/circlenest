package net.thetaspace.communications.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import net.thetaspace.communications.ThetaCommApplication

class DownloadAttachmentWorker(
    appContext: Context,
    parameters: WorkerParameters,
) : CoroutineWorker(appContext, parameters) {
    override suspend fun doWork(): Result {
        val attachmentId = inputData.getString(ATTACHMENT_ID)
            ?: return Result.failure()
        val app = applicationContext as ThetaCommApplication
        return if (app.container.repository.downloadAttachment(attachmentId)) {
            Result.success()
        } else {
            Result.retry()
        }
    }

    companion object {
        const val ATTACHMENT_ID = "attachment_id"
    }
}
