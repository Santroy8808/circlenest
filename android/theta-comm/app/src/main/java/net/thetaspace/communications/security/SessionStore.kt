package net.thetaspace.communications.security

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.sessionDataStore by preferencesDataStore(name = "theta_comm_session_v2")

data class CommSession(
    val accessToken: String,
    val userId: String,
    val stableDeviceId: String,
    val commDeviceId: String?,
)

class SessionStore(
    private val context: Context,
    private val localCipher: LocalKeyCipher,
) {
    val session: Flow<CommSession?> = context.sessionDataStore.data.map(::decodeSession)

    suspend fun current(): CommSession? = session.first()

    suspend fun accessToken(): String? = current()?.accessToken

    suspend fun saveLogin(accessToken: String, userId: String, stableDeviceId: String) {
        context.sessionDataStore.edit { preferences ->
            preferences[ACCESS_TOKEN] = localCipher.sealString(accessToken)
            preferences[USER_ID] = localCipher.sealString(userId)
            preferences[STABLE_DEVICE_ID] = localCipher.sealString(stableDeviceId)
            preferences.remove(COMM_DEVICE_ID)
        }
    }

    suspend fun bindCommDevice(commDeviceId: String) {
        context.sessionDataStore.edit { preferences ->
            preferences[COMM_DEVICE_ID] = localCipher.sealString(commDeviceId)
        }
    }

    suspend fun clear() {
        context.sessionDataStore.edit { preferences ->
            val installationId = preferences[INSTALLATION_ID]
            preferences.clear()
            if (installationId != null) {
                preferences[INSTALLATION_ID] = installationId
            }
        }
    }

    suspend fun installationId(): String {
        val existing = context.sessionDataStore.data.first()[INSTALLATION_ID]
        if (existing != null) return localCipher.openString(existing)
        val created = UUID.randomUUID().toString()
        context.sessionDataStore.edit {
            it[INSTALLATION_ID] = localCipher.sealString(created)
        }
        return created
    }

    private fun decodeSession(preferences: Preferences): CommSession? {
        val accessToken = preferences[ACCESS_TOKEN] ?: return null
        val userId = preferences[USER_ID] ?: return null
        val stableDeviceId = preferences[STABLE_DEVICE_ID] ?: return null
        return runCatching {
            CommSession(
                accessToken = localCipher.openString(accessToken),
                userId = localCipher.openString(userId),
                stableDeviceId = localCipher.openString(stableDeviceId),
                commDeviceId = preferences[COMM_DEVICE_ID]?.let(localCipher::openString),
            )
        }.getOrNull()
    }

    private companion object {
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
        val USER_ID = stringPreferencesKey("user_id")
        val STABLE_DEVICE_ID = stringPreferencesKey("stable_device_id")
        val COMM_DEVICE_ID = stringPreferencesKey("comm_device_id")
        val INSTALLATION_ID = stringPreferencesKey("installation_id")
    }
}
