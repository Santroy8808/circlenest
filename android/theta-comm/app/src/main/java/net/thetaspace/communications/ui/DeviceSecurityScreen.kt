package net.thetaspace.communications.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Android
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.PhoneIphone
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.launch
import net.thetaspace.communications.data.remote.DeviceDto

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceSecurityScreen(
    currentDeviceId: String?,
    onBack: () -> Unit,
    loadDevices: suspend () -> List<DeviceDto>,
    onRevokeDevice: suspend (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    var devices by remember { mutableStateOf<List<DeviceDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var revokeTarget by remember { mutableStateOf<DeviceDto?>(null) }

    suspend fun refresh() {
        runCatching { loadDevices() }
            .onSuccess { devices = it }
            .onFailure {
                snackbar.showSnackbar(it.message ?: "Linked devices could not be loaded.")
            }
        loading = false
    }

    LaunchedEffect(Unit) { refresh() }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text("Linked devices") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            item {
                ListItem(
                    headlineContent = { Text("New device history") },
                    supportingContent = {
                        Text("New messages only")
                    },
                    leadingContent = {
                        Icon(Icons.Default.Security, contentDescription = null)
                    },
                )
                HorizontalDivider()
                Text(
                    if (loading) "Loading..." else "Devices",
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            items(devices, key = DeviceDto::id) { device ->
                val isCurrent = device.id == currentDeviceId
                ListItem(
                    headlineContent = {
                        Text(
                            buildString {
                                append(
                                    device.platform.replaceFirstChar {
                                        it.titlecase()
                                    },
                                )
                                if (isCurrent) append(" (this device)")
                            },
                            fontWeight = FontWeight.Medium,
                        )
                    },
                    supportingContent = {
                        Column {
                            Text(
                                if (device.revokedAt == null) {
                                    "Last active ${formatDeviceTime(device.lastSeenAt)}"
                                } else {
                                    "Removed ${formatDeviceTime(device.revokedAt)}"
                                },
                            )
                            device.identityKeyFingerprint?.let { fingerprint ->
                                Text(
                                    fingerprint.chunked(4).take(8).joinToString(" "),
                                    fontFamily = FontFamily.Monospace,
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            }
                        }
                    },
                    leadingContent = {
                        Icon(
                            when (device.platform.lowercase()) {
                                "android" -> Icons.Default.Android
                                "ios" -> Icons.Default.PhoneIphone
                                else -> Icons.Default.Computer
                            },
                            contentDescription = null,
                        )
                    },
                    trailingContent = if (!isCurrent && device.revokedAt == null) {
                        {
                            TextButton(onClick = { revokeTarget = device }) {
                                Text("Remove")
                            }
                        }
                    } else {
                        null
                    },
                )
                HorizontalDivider()
            }
        }
    }

    revokeTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { revokeTarget = null },
            title = { Text("Remove linked device?") },
            text = {
                Text("That device will no longer receive or decrypt new Theta-Comm messages.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            runCatching { onRevokeDevice(target.id) }
                                .onSuccess {
                                    revokeTarget = null
                                    refresh()
                                }
                                .onFailure {
                                    snackbar.showSnackbar(
                                        it.message ?: "The device could not be removed.",
                                    )
                                }
                        }
                    },
                ) {
                    Text("Remove")
                }
            },
            dismissButton = {
                TextButton(onClick = { revokeTarget = null }) { Text("Cancel") }
            },
        )
    }
}

private fun formatDeviceTime(value: String): String =
    runCatching {
        Instant.parse(value)
            .atZone(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofPattern("MMM d, h:mm a"))
    }.getOrDefault(value)
