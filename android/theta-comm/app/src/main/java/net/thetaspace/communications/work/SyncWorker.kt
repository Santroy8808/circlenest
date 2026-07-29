package net.thetaspace.communications.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import net.thetaspace.communications.ThetaCommApplication

class SyncWorker(
    appContext: Context,
    parameters: WorkerParameters,
) : CoroutineWorker(appContext, parameters) {
    override suspend fun doWork(): Result {
        val app = applicationContext as ThetaCommApplication
        return runCatching { app.container.repository.sync() }
            .fold(
                onSuccess = { if (it) Result.success() else Result.failure() },
                onFailure = { Result.retry() },
            )
    }
}
