package net.thetaspace.communications.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ThetaCommWork(context: Context) {
    private val manager = WorkManager.getInstance(context)
    private val connected = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun enqueueSend(clientMessageId: String, replace: Boolean = false) {
        val prepare = OneTimeWorkRequestBuilder<PrepareOutgoingWorker>()
            .setInputData(workDataOf(PrepareOutgoingWorker.CLIENT_MESSAGE_ID to clientMessageId))
            .build()
        val send = OneTimeWorkRequestBuilder<SendMessageWorker>()
            .setConstraints(connected)
            .setInputData(workDataOf(SendMessageWorker.CLIENT_MESSAGE_ID to clientMessageId))
            .build()
        manager.beginUniqueWork(
            "theta-comm-send-$clientMessageId",
            if (replace) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP,
            prepare,
        ).then(send).enqueue()
    }

    fun cancelSend(clientMessageId: String) {
        manager.cancelUniqueWork("theta-comm-send-$clientMessageId")
    }

    fun enqueueImmediateSync() {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(connected)
            .build()
        manager.enqueueUniqueWork(
            IMMEDIATE_SYNC,
            ExistingWorkPolicy.KEEP,
            request,
        )
    }

    fun enqueueDownload(attachmentId: String) {
        val request = OneTimeWorkRequestBuilder<DownloadAttachmentWorker>()
            .setConstraints(connected)
            .setInputData(
                workDataOf(DownloadAttachmentWorker.ATTACHMENT_ID to attachmentId),
            )
            .build()
        manager.enqueueUniqueWork(
            "theta-comm-download-$attachmentId",
            ExistingWorkPolicy.KEEP,
            request,
        )
    }

    fun schedulePeriodicSync() {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(connected)
            .build()
        manager.enqueueUniquePeriodicWork(
            PERIODIC_SYNC,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    suspend fun cancelAll() = withContext(Dispatchers.IO) {
        manager.cancelAllWork().result.get()
    }

    private companion object {
        const val IMMEDIATE_SYNC = "theta-comm-sync-now"
        const val PERIODIC_SYNC = "theta-comm-sync-periodic"
    }
}
