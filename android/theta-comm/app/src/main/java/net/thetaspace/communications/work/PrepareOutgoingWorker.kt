package net.thetaspace.communications.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import net.thetaspace.communications.ThetaCommApplication
import net.thetaspace.communications.push.ThetaCommNotifications

class PrepareOutgoingWorker(
    appContext: Context,
    parameters: WorkerParameters,
) : CoroutineWorker(appContext, parameters) {
    override suspend fun doWork(): Result {
        val clientMessageId = inputData.getString(CLIENT_MESSAGE_ID)
            ?: return Result.failure()
        val app = applicationContext as ThetaCommApplication
        if (app.container.repository.messageHasAttachments(clientMessageId)) {
            setForeground(
                ThetaCommNotifications.transferForegroundInfo(
                    applicationContext,
                    clientMessageId,
                    preparing = true,
                ),
            )
        }
        return if (app.container.repository.prepareOutgoingMessage(clientMessageId)) {
            Result.success()
        } else {
            Result.failure()
        }
    }

    companion object {
        const val CLIENT_MESSAGE_ID = "client_message_id"
    }
}
