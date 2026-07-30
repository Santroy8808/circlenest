package net.thetaspace.communications.security

import android.util.Base64
import java.time.Instant
import net.thetaspace.communications.BuildConfig
import net.thetaspace.communications.data.remote.PreKeyBundleDto
import net.thetaspace.communications.data.remote.PreKeyDto
import net.thetaspace.communications.data.remote.KyberPreKeyDto
import net.thetaspace.communications.data.remote.RecipientEnvelopeDto
import net.thetaspace.communications.data.remote.RegisterDeviceRequestDto
import net.thetaspace.communications.data.remote.ReplenishPreKeysRequestDto
import net.thetaspace.communications.data.remote.SignedPreKeyDto
import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.SessionBuilder
import org.signal.libsignal.protocol.SessionCipher
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.ecc.ECKeyPair
import org.signal.libsignal.protocol.ecc.ECPublicKey
import org.signal.libsignal.protocol.message.CiphertextMessage
import org.signal.libsignal.protocol.message.PreKeySignalMessage
import org.signal.libsignal.protocol.message.SignalMessage
import org.signal.libsignal.protocol.kem.KEMKeyPair
import org.signal.libsignal.protocol.kem.KEMKeyType
import org.signal.libsignal.protocol.kem.KEMPublicKey
import org.signal.libsignal.protocol.state.KyberPreKeyRecord
import org.signal.libsignal.protocol.state.PreKeyBundle
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.SignedPreKeyRecord

class SignalCryptoEngine(
    private val stores: PersistentSignalStores,
) {
    fun registrationRequest(
        stableDeviceId: String,
        preKeyCount: Int = 100,
    ): RegisterDeviceRequestDto {
        val identity = stores.identityStore.identityKeyPair
        val registrationId = stores.identityStore.localRegistrationId
        val signedPreKey = currentSignedPreKey(identity)
        val oneTimePreKeys = ensureOneTimePreKeys(preKeyCount)
        val oneTimeKyberPreKeys = ensureKyberPreKeys(identity, preKeyCount)

        return RegisterDeviceRequestDto(
            deviceId = stableDeviceId,
            appVersion = BuildConfig.VERSION_NAME,
            registrationId = registrationId,
            identityKey = identity.publicKey.serialize().base64(),
            signedPreKey = SignedPreKeyDto(
                keyId = signedPreKey.id,
                publicKey = signedPreKey.keyPair.publicKey.serialize().base64(),
                signature = signedPreKey.signature.base64(),
            ),
            oneTimePreKeys = oneTimePreKeys.map {
                PreKeyDto(
                    keyId = it.id,
                    publicKey = it.keyPair.publicKey.serialize().base64(),
                )
            },
            oneTimeKyberPreKeys = oneTimeKyberPreKeys.map {
                KyberPreKeyDto(
                    keyId = it.id,
                    publicKey = it.keyPair.publicKey.serialize().base64(),
                    signature = it.signature.base64(),
                )
            },
        )
    }

    fun replenishmentRequest(
        stableDeviceId: String,
        serverAvailable: Int,
        serverKyberAvailable: Int,
        targetCount: Int = 100,
        threshold: Int = 50,
    ): ReplenishPreKeysRequestDto? {
        if (minOf(serverAvailable, serverKyberAvailable) >= threshold) return null
        val generateCount = maxOf(
            targetCount - serverAvailable,
            targetCount - serverKyberAvailable,
            1,
        )
        val preKeys = stores.allocatePreKeyIds(
            kyber = false,
            count = generateCount,
        ).map { id ->
            PreKeyRecord(id, ECKeyPair.generate()).also {
                stores.preKeyStore.storePreKey(id, it)
            }
        }
        val identity = stores.identityStore.identityKeyPair
        val kyberPreKeys = stores.allocatePreKeyIds(
            kyber = true,
            count = generateCount,
        ).map { id ->
            val keyPair = KEMKeyPair.generate(KEMKeyType.KYBER_1024)
            val signature = identity.privateKey.calculateSignature(keyPair.publicKey.serialize())
            KyberPreKeyRecord(
                id,
                Instant.now().toEpochMilli(),
                keyPair,
                signature,
            ).also {
                stores.kyberPreKeyStore.storeKyberPreKey(id, it)
            }
        }
        return ReplenishPreKeysRequestDto(
            deviceId = stableDeviceId,
            oneTimePreKeys = preKeys.map {
                PreKeyDto(it.id, it.keyPair.publicKey.serialize().base64())
            },
            oneTimeKyberPreKeys = kyberPreKeys.map {
                KyberPreKeyDto(
                    keyId = it.id,
                    publicKey = it.keyPair.publicKey.serialize().base64(),
                    signature = it.signature.base64(),
                )
            },
        )
    }

    fun encrypt(
        plaintext: ByteArray,
        bundle: PreKeyBundleDto,
        localUserId: String,
        localDeviceId: String,
    ): RecipientEnvelopeDto {
        val local = protocolAddress(localUserId, localDeviceId)
        val remote = protocolAddress(bundle.userId, bundle.deviceId)
        if (!stores.sessionStore.containsSession(remote)) {
            SessionBuilder(
                stores.sessionStore,
                stores.preKeyStore,
                stores.signedPreKeyStore,
                stores.identityStore,
                local,
                remote,
            ).process(bundle.toSignalBundle())
        }
        return encryptForAddress(
            plaintext = plaintext,
            recipientUserId = bundle.userId,
            recipientDeviceId = bundle.deviceId,
            recipientKeyVersion = bundle.keyVersion,
            local = local,
            remote = remote,
        )
    }

    fun hasTrustedSession(
        recipientUserId: String,
        recipientDeviceId: String,
        serializedIdentityKey: String,
    ): Boolean {
        val remote = protocolAddress(recipientUserId, recipientDeviceId)
        if (!stores.sessionStore.containsSession(remote)) return false
        val expected = IdentityKey(Base64.decode(serializedIdentityKey, Base64.NO_WRAP))
        return stores.identityStore.getIdentity(remote) == expected
    }

    fun encryptEstablishedSession(
        plaintext: ByteArray,
        recipientUserId: String,
        recipientDeviceId: String,
        recipientKeyVersion: Int,
        localUserId: String,
        localDeviceId: String,
    ): RecipientEnvelopeDto {
        val local = protocolAddress(localUserId, localDeviceId)
        val remote = protocolAddress(recipientUserId, recipientDeviceId)
        check(stores.sessionStore.containsSession(remote)) {
            "A Signal session has not been established for this device."
        }
        return encryptForAddress(
            plaintext = plaintext,
            recipientUserId = recipientUserId,
            recipientDeviceId = recipientDeviceId,
            recipientKeyVersion = recipientKeyVersion,
            local = local,
            remote = remote,
        )
    }

    private fun encryptForAddress(
        plaintext: ByteArray,
        recipientUserId: String,
        recipientDeviceId: String,
        recipientKeyVersion: Int,
        local: SignalProtocolAddress,
        remote: SignalProtocolAddress,
    ): RecipientEnvelopeDto {
        val encrypted = SessionCipher(
            stores.sessionStore,
            stores.preKeyStore,
            stores.signedPreKeyStore,
            stores.kyberPreKeyStore,
            stores.identityStore,
            local,
            remote,
        ).encrypt(plaintext)

        return RecipientEnvelopeDto(
            recipientUserId = recipientUserId,
            recipientDeviceId = recipientDeviceId,
            recipientKeyVersion = recipientKeyVersion,
            envelopeType = if (encrypted.type == CiphertextMessage.PREKEY_TYPE) {
                "PREKEY"
            } else {
                "SESSION"
            },
            ciphertext = encrypted.serialize().base64(),
        )
    }

    fun decrypt(
        ciphertext: String,
        envelopeType: String,
        senderUserId: String,
        senderDeviceId: String,
        localUserId: String,
        localDeviceId: String,
    ): ByteArray {
        val local = protocolAddress(localUserId, localDeviceId)
        val remote = protocolAddress(senderUserId, senderDeviceId)
        val cipher = SessionCipher(
            stores.sessionStore,
            stores.preKeyStore,
            stores.signedPreKeyStore,
            stores.kyberPreKeyStore,
            stores.identityStore,
            local,
            remote,
        )
        val bytes = Base64.decode(ciphertext, Base64.NO_WRAP)
        return if (envelopeType == "PREKEY") {
            cipher.decrypt(PreKeySignalMessage(bytes))
        } else {
            cipher.decrypt(SignalMessage(bytes))
        }
    }

    private fun currentSignedPreKey(
        identity: org.signal.libsignal.protocol.IdentityKeyPair,
    ): SignedPreKeyRecord {
        stores.signedPreKeyStore.loadSignedPreKeys().maxByOrNull { it.timestamp }?.let {
            return it
        }
        val id = 1
        val keyPair = ECKeyPair.generate()
        val signature = identity.privateKey.calculateSignature(keyPair.publicKey.serialize())
        return SignedPreKeyRecord(
            id,
            Instant.now().toEpochMilli(),
            keyPair,
            signature,
        ).also {
            stores.signedPreKeyStore.storeSignedPreKey(id, it)
        }
    }

    private fun ensureOneTimePreKeys(count: Int): List<PreKeyRecord> {
        val records = stores.availablePreKeyIds(kyber = false)
            .take(count)
            .map(stores.preKeyStore::loadPreKey)
            .toMutableList()
        val missing = count - records.size
        if (missing > 0) {
            stores.allocatePreKeyIds(kyber = false, count = missing).forEach { id ->
                records += PreKeyRecord(id, ECKeyPair.generate()).also {
                    stores.preKeyStore.storePreKey(id, it)
                }
            }
        }
        return records
    }

    private fun ensureKyberPreKeys(
        identity: org.signal.libsignal.protocol.IdentityKeyPair,
        count: Int,
    ): List<KyberPreKeyRecord> {
        val records = stores.availablePreKeyIds(kyber = true)
            .take(count)
            .map(stores.kyberPreKeyStore::loadKyberPreKey)
            .toMutableList()
        val missing = count - records.size
        if (missing > 0) {
            stores.allocatePreKeyIds(kyber = true, count = missing).forEach { id ->
                val keyPair = KEMKeyPair.generate(KEMKeyType.KYBER_1024)
                val signature = identity.privateKey
                    .calculateSignature(keyPair.publicKey.serialize())
                records += KyberPreKeyRecord(
                    id,
                    Instant.now().toEpochMilli(),
                    keyPair,
                    signature,
                ).also {
                    stores.kyberPreKeyStore.storeKyberPreKey(id, it)
                }
            }
        }
        return records
    }

    private fun PreKeyBundleDto.toSignalBundle(): PreKeyBundle {
        val oneTimeKey = oneTimePreKey
        return PreKeyBundle(
            registrationId,
            SIGNAL_DEVICE_ID,
            oneTimeKey?.keyId ?: PreKeyBundle.NULL_PRE_KEY_ID,
            oneTimeKey?.publicKey?.decodePublicKey(),
            signedPreKey.keyId,
            signedPreKey.publicKey.decodePublicKey(),
            Base64.decode(signedPreKey.signature, Base64.NO_WRAP),
            IdentityKey(Base64.decode(identityKey, Base64.NO_WRAP)),
            kyberPreKey.keyId,
            KEMPublicKey(Base64.decode(kyberPreKey.publicKey, Base64.NO_WRAP)),
            Base64.decode(kyberPreKey.signature, Base64.NO_WRAP),
        )
    }

    private fun protocolAddress(userId: String, deviceId: String) =
        SignalProtocolAddress("$userId:$deviceId", SIGNAL_DEVICE_ID)

    private fun String.decodePublicKey() =
        ECPublicKey(Base64.decode(this, Base64.NO_WRAP))

    private fun ByteArray.base64(): String =
        Base64.encodeToString(this, Base64.NO_WRAP)

    private companion object {
        const val SIGNAL_DEVICE_ID = 1
    }
}
