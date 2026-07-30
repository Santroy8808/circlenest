package net.thetaspace.communications

import android.content.Context
import java.util.concurrent.TimeUnit
import net.thetaspace.communications.data.EncryptedAttachmentDownloader
import net.thetaspace.communications.data.EncryptedAttachmentUploader
import net.thetaspace.communications.data.ThetaCommRepository
import net.thetaspace.communications.data.local.ThetaCommDatabase
import net.thetaspace.communications.data.remote.ThetaCommApi
import net.thetaspace.communications.realtime.ThetaCommRealtime
import net.thetaspace.communications.security.LocalKeyCipher
import net.thetaspace.communications.security.AttachmentCrypto
import net.thetaspace.communications.security.PersistentSignalStores
import net.thetaspace.communications.security.SessionStore
import net.thetaspace.communications.security.SignalCryptoEngine
import net.thetaspace.communications.work.ThetaCommWork
import okhttp3.OkHttpClient

class AppContainer(
    val context: Context,
) {
    val database = ThetaCommDatabase.create(context)
    val localCipher = LocalKeyCipher()
    val sessionStore = SessionStore(context, localCipher)
    val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
    val api = ThetaCommApi(httpClient, sessionStore)
    val signalStores = PersistentSignalStores(database.thetaCommDao(), localCipher)
    val signalCrypto = SignalCryptoEngine(signalStores)
    val attachmentCrypto = AttachmentCrypto(context)
    val attachmentUploader = EncryptedAttachmentUploader(
        api = api,
        dao = database.thetaCommDao(),
    )
    val attachmentDownloader = EncryptedAttachmentDownloader(
        context = context,
        api = api,
        httpClient = httpClient,
        dao = database.thetaCommDao(),
    )
    val work = ThetaCommWork(context)
    val repository = ThetaCommRepository(
        database = database,
        api = api,
        sessionStore = sessionStore,
        localCipher = localCipher,
        signalCrypto = signalCrypto,
        attachmentCrypto = attachmentCrypto,
        attachmentUploader = attachmentUploader,
        attachmentDownloader = attachmentDownloader,
        work = work,
    )
    val realtime = ThetaCommRealtime(context, httpClient, sessionStore, work)
}
