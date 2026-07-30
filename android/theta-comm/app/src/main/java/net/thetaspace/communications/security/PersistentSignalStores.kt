package net.thetaspace.communications.security

import java.nio.ByteBuffer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import net.thetaspace.communications.data.local.SignalRecordEntity
import net.thetaspace.communications.data.local.ThetaCommDao
import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.IdentityKeyPair
import org.signal.libsignal.protocol.InvalidKeyIdException
import org.signal.libsignal.protocol.NoSessionException
import org.signal.libsignal.protocol.ReusedBaseKeyException
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.ecc.ECPublicKey
import org.signal.libsignal.protocol.state.IdentityKeyStore
import org.signal.libsignal.protocol.state.KyberPreKeyRecord
import org.signal.libsignal.protocol.state.KyberPreKeyStore
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.PreKeyStore
import org.signal.libsignal.protocol.state.SessionRecord
import org.signal.libsignal.protocol.state.SessionStore
import org.signal.libsignal.protocol.state.SignedPreKeyRecord
import org.signal.libsignal.protocol.state.SignedPreKeyStore
import org.signal.libsignal.protocol.util.KeyHelper

class PersistentSignalStores(
    private val dao: ThetaCommDao,
    private val localCipher: LocalKeyCipher,
) {
    private val lock = Any()

    val identityStore: IdentityKeyStore = IdentityStore()
    val preKeyStore: PreKeyStore = OneTimePreKeyStore()
    val signedPreKeyStore: SignedPreKeyStore = PersistentSignedPreKeyStore()
    val sessionStore: SessionStore = PersistentSessionStore()
    val kyberPreKeyStore: KyberPreKeyStore = PersistentKyberPreKeyStore()

    fun allocatePreKeyIds(kyber: Boolean, count: Int): List<Int> =
        synchronized(lock) {
            require(count > 0)
            val recordType = if (kyber) TYPE_KYBER_PRE_KEY else TYPE_PRE_KEY
            val counterKey = if (kyber) NEXT_KYBER_PRE_KEY else NEXT_PRE_KEY
            val storedNext = read(TYPE_METADATA, counterKey)
                ?.let { ByteBuffer.wrap(it).int }
                ?: 1
            val highestExisting = records(recordType)
                .maxOfOrNull { it.first.toIntOrNull() ?: 0 }
                ?: 0
            val start = maxOf(storedNext, highestExisting + 1)
            val next = Math.addExact(start, count)
            write(
                TYPE_METADATA,
                counterKey,
                ByteBuffer.allocate(Int.SIZE_BYTES).putInt(next).array(),
            )
            (start until next).toList()
        }

    fun availablePreKeyIds(kyber: Boolean): List<Int> =
        records(if (kyber) TYPE_KYBER_PRE_KEY else TYPE_PRE_KEY)
            .mapNotNull { it.first.toIntOrNull() }
            .sorted()

    private fun read(type: String, key: String): ByteArray? = synchronized(lock) {
        runBlocking(Dispatchers.IO) {
            dao.signalRecord(type, key)?.sealedValue?.let(localCipher::open)
        }
    }

    private fun records(type: String): List<Pair<String, ByteArray>> = synchronized(lock) {
        runBlocking(Dispatchers.IO) {
            dao.signalRecords(type).map {
                it.recordKey to localCipher.open(it.sealedValue)
            }
        }
    }

    private fun write(type: String, key: String, value: ByteArray) = synchronized(lock) {
        runBlocking(Dispatchers.IO) {
            dao.upsertSignalRecord(
                SignalRecordEntity(
                    recordType = type,
                    recordKey = key,
                    sealedValue = localCipher.seal(value),
                    updatedAt = System.currentTimeMillis(),
                ),
            )
        }
    }

    private fun delete(type: String, key: String) = synchronized(lock) {
        runBlocking(Dispatchers.IO) {
            dao.deleteSignalRecord(type, key)
        }
    }

    private inner class IdentityStore : IdentityKeyStore {
        override fun getIdentityKeyPair(): IdentityKeyPair {
            read(TYPE_IDENTITY, LOCAL_IDENTITY)?.let { return IdentityKeyPair(it) }
            return IdentityKeyPair.generate().also {
                write(TYPE_IDENTITY, LOCAL_IDENTITY, it.serialize())
            }
        }

        override fun getLocalRegistrationId(): Int {
            read(TYPE_IDENTITY, LOCAL_REGISTRATION)?.let {
                return ByteBuffer.wrap(it).int
            }
            return KeyHelper.generateRegistrationId(false).also {
                write(
                    TYPE_IDENTITY,
                    LOCAL_REGISTRATION,
                    ByteBuffer.allocate(Int.SIZE_BYTES).putInt(it).array(),
                )
            }
        }

        override fun saveIdentity(
            address: SignalProtocolAddress,
            identityKey: IdentityKey,
        ): IdentityKeyStore.IdentityChange {
            val key = address.storageKey()
            val existing = read(TYPE_REMOTE_IDENTITY, key)?.let(::IdentityKey)
            write(TYPE_REMOTE_IDENTITY, key, identityKey.serialize())
            return if (existing != null && existing != identityKey) {
                IdentityKeyStore.IdentityChange.REPLACED_EXISTING
            } else {
                IdentityKeyStore.IdentityChange.NEW_OR_UNCHANGED
            }
        }

        override fun isTrustedIdentity(
            address: SignalProtocolAddress,
            identityKey: IdentityKey,
            direction: IdentityKeyStore.Direction,
        ): Boolean {
            val existing = read(TYPE_REMOTE_IDENTITY, address.storageKey()) ?: return true
            return IdentityKey(existing) == identityKey
        }

        override fun getIdentity(address: SignalProtocolAddress): IdentityKey? =
            read(TYPE_REMOTE_IDENTITY, address.storageKey())?.let(::IdentityKey)
    }

    private inner class OneTimePreKeyStore : PreKeyStore {
        override fun loadPreKey(preKeyId: Int): PreKeyRecord =
            read(TYPE_PRE_KEY, preKeyId.toString())
                ?.let(::PreKeyRecord)
                ?: throw InvalidKeyIdException("Missing pre-key $preKeyId.")

        override fun storePreKey(preKeyId: Int, record: PreKeyRecord) {
            write(TYPE_PRE_KEY, preKeyId.toString(), record.serialize())
        }

        override fun containsPreKey(preKeyId: Int): Boolean =
            read(TYPE_PRE_KEY, preKeyId.toString()) != null

        override fun removePreKey(preKeyId: Int) {
            delete(TYPE_PRE_KEY, preKeyId.toString())
        }
    }

    private inner class PersistentSignedPreKeyStore : SignedPreKeyStore {
        override fun loadSignedPreKey(signedPreKeyId: Int): SignedPreKeyRecord =
            read(TYPE_SIGNED_PRE_KEY, signedPreKeyId.toString())
                ?.let(::SignedPreKeyRecord)
                ?: throw InvalidKeyIdException("Missing signed pre-key $signedPreKeyId.")

        override fun loadSignedPreKeys(): List<SignedPreKeyRecord> =
            records(TYPE_SIGNED_PRE_KEY).map { SignedPreKeyRecord(it.second) }

        override fun storeSignedPreKey(
            signedPreKeyId: Int,
            record: SignedPreKeyRecord,
        ) {
            write(TYPE_SIGNED_PRE_KEY, signedPreKeyId.toString(), record.serialize())
        }

        override fun containsSignedPreKey(signedPreKeyId: Int): Boolean =
            read(TYPE_SIGNED_PRE_KEY, signedPreKeyId.toString()) != null

        override fun removeSignedPreKey(signedPreKeyId: Int) {
            delete(TYPE_SIGNED_PRE_KEY, signedPreKeyId.toString())
        }
    }

    private inner class PersistentSessionStore : SessionStore {
        override fun loadSession(address: SignalProtocolAddress): SessionRecord =
            read(TYPE_SESSION, address.storageKey())?.let(::SessionRecord) ?: SessionRecord()

        override fun loadExistingSessions(
            addresses: List<SignalProtocolAddress>,
        ): List<SessionRecord> = addresses.map { address ->
            read(TYPE_SESSION, address.storageKey())
                ?.let(::SessionRecord)
                ?: throw NoSessionException(address, "Session does not exist.")
        }

        override fun getSubDeviceSessions(name: String): List<Int> =
            records(TYPE_SESSION)
                .mapNotNull { (key, _) ->
                    val parts = key.split(KEY_SEPARATOR)
                    if (parts.firstOrNull() == name) parts.lastOrNull()?.toIntOrNull() else null
                }

        override fun storeSession(address: SignalProtocolAddress, record: SessionRecord) {
            write(TYPE_SESSION, address.storageKey(), record.serialize())
        }

        override fun containsSession(address: SignalProtocolAddress): Boolean =
            read(TYPE_SESSION, address.storageKey()) != null

        override fun deleteSession(address: SignalProtocolAddress) {
            delete(TYPE_SESSION, address.storageKey())
        }

        override fun deleteAllSessions(name: String) {
            records(TYPE_SESSION)
                .map(Pair<String, ByteArray>::first)
                .filter { it.substringBefore(KEY_SEPARATOR) == name }
                .forEach { delete(TYPE_SESSION, it) }
        }
    }

    private inner class PersistentKyberPreKeyStore : KyberPreKeyStore {
        override fun loadKyberPreKey(kyberPreKeyId: Int): KyberPreKeyRecord =
            read(TYPE_KYBER_PRE_KEY, kyberPreKeyId.toString())
                ?.let(::KyberPreKeyRecord)
                ?: throw InvalidKeyIdException("Missing Kyber pre-key $kyberPreKeyId.")

        override fun loadKyberPreKeys(): List<KyberPreKeyRecord> =
            records(TYPE_KYBER_PRE_KEY).map { KyberPreKeyRecord(it.second) }

        override fun storeKyberPreKey(
            kyberPreKeyId: Int,
            record: KyberPreKeyRecord,
        ) {
            write(TYPE_KYBER_PRE_KEY, kyberPreKeyId.toString(), record.serialize())
        }

        override fun containsKyberPreKey(kyberPreKeyId: Int): Boolean =
            read(TYPE_KYBER_PRE_KEY, kyberPreKeyId.toString()) != null

        override fun markKyberPreKeyUsed(
            kyberPreKeyId: Int,
            signedPreKeyId: Int,
            baseKey: ECPublicKey,
        ) {
            if (!containsKyberPreKey(kyberPreKeyId)) {
                throw ReusedBaseKeyException("Kyber pre-key is unavailable.")
            }
            delete(TYPE_KYBER_PRE_KEY, kyberPreKeyId.toString())
        }
    }

    private fun SignalProtocolAddress.storageKey(): String =
        "$name$KEY_SEPARATOR$deviceId"

    private companion object {
        const val TYPE_IDENTITY = "identity"
        const val TYPE_REMOTE_IDENTITY = "remote_identity"
        const val TYPE_PRE_KEY = "pre_key"
        const val TYPE_SIGNED_PRE_KEY = "signed_pre_key"
        const val TYPE_SESSION = "session"
        const val TYPE_KYBER_PRE_KEY = "kyber_pre_key"
        const val TYPE_METADATA = "metadata"
        const val LOCAL_IDENTITY = "local_pair"
        const val LOCAL_REGISTRATION = "registration_id"
        const val NEXT_PRE_KEY = "next_pre_key"
        const val NEXT_KYBER_PRE_KEY = "next_kyber_pre_key"
        const val KEY_SEPARATOR = "\u001F"
    }
}
