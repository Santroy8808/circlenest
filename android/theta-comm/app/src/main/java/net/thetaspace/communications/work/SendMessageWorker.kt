package net.thetaspace.communications.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import net.thetaspace.communications.ThetaCommApplication
import net.thetaspace.communications.data.SendOutcome

class SendMessageWorker(
    appContext: Context,
    parameters: WorkerParameters,
) : CoroutineWorker(appContext, parameters) {
    override suspend fun doWork(): Result {
        val clientMessageId = inputData.getString(CLIENT_MESSAGE_ID)
            ?: return Result.failure()
        val app = applicationContext as ThetaCommApplication
        return when (app.container.repository.processOutgoingMessage(clientMessageId)) {
            SendOutcome.COMPLETE -> Result.success()
            SendOutcome.RETRY -> Result.retry()
            SendOutcome.FAILED -> Result.failure()
        }
    }

    companion object {
        const val CLIENT_MESSAGE_ID = "client_message_id"
    }
}
