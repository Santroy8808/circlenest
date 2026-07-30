package net.thetaspace.communications.ui

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import net.thetaspace.communications.data.ConversationHeader
import net.thetaspace.communications.data.local.ParticipantEntity
import net.thetaspace.communications.data.remote.ContactDto
import net.thetaspace.communications.ui.components.EncryptedConversationAvatar
import net.thetaspace.communications.ui.components.InitialAvatar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupInfoScreen(
    currentUserId: String,
    header: ConversationHeader?,
    onBack: () -> Unit,
    onSearchContacts: suspend (String) -> List<ContactDto>,
    onRename: suspend (String) -> Unit,
    onAddMembers: suspend (List<String>) -> Unit,
    onRemoveMember: suspend (String) -> Unit,
    onSetRole: suspend (String, String) -> Unit,
    onSetAvatar: suspend (String) -> Unit,
    onRemoveAvatar: suspend () -> Unit,
    onOpenAttachment: suspend (String, Boolean) -> String,
    onLeave: suspend () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    var showRename by rememberSaveable { mutableStateOf(false) }
    var showAddMembers by rememberSaveable { mutableStateOf(false) }
    var showLeaveConfirmation by rememberSaveable { mutableStateOf(false) }
    var selectedMember by remember { mutableStateOf<ParticipantEntity?>(null) }
    var busy by remember { mutableStateOf(false) }
    val currentParticipant = header?.participants?.firstOrNull {
        it.userId == currentUserId && it.leftAt == null && it.removedAt == null
    }
    val canAdminister = currentParticipant?.role in setOf("OWNER", "ADMIN")
    val isOwner = currentParticipant?.role == "OWNER"

    fun perform(action: suspend () -> Unit, after: () -> Unit = {}) {
        if (busy) return
        busy = true
        scope.launch {
            runCatching { action() }
                .onSuccess { after() }
                .onFailure {
                    snackbar.showSnackbar(it.message ?: "The chat group could not be updated.")
                }
            busy = false
        }
    }
    val avatarPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            }
            perform(action = { onSetAvatar(uri.toString()) })
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text("Chat group info") },
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
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    EncryptedConversationAvatar(
                        title = header?.title.orEmpty(),
                        attachmentId = header?.avatarAttachmentId,
                        size = 76.dp,
                        onOpenAttachment = onOpenAttachment,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        header?.title ?: "Chat group",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "${header?.participants?.count { it.leftAt == null && it.removedAt == null } ?: 0} members",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (canAdminister) {
                        Row(
                            modifier = Modifier.padding(top = 14.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            OutlinedButton(onClick = { showRename = true }) {
                                Icon(Icons.Default.Edit, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text("Rename")
                            }
                            OutlinedButton(onClick = { showAddMembers = true }) {
                                Icon(Icons.Default.Add, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text("Add")
                            }
                            OutlinedButton(
                                onClick = { avatarPicker.launch(arrayOf("image/*")) },
                                enabled = !busy,
                            ) {
                                Icon(Icons.Default.PhotoCamera, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text("Photo")
                            }
                        }
                        if (header?.avatarAttachmentId != null) {
                            TextButton(
                                onClick = {
                                    perform(action = { onRemoveAvatar() })
                                },
                                enabled = !busy,
                            ) {
                                Text("Remove group image")
                            }
                        }
                    }
                }
                HorizontalDivider()
                Text(
                    "Members",
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            items(
                header?.participants
                    ?.filter { it.leftAt == null && it.removedAt == null }
                    .orEmpty(),
                key = ParticipantEntity::userId,
            ) { participant ->
                val manageable = participant.userId != currentUserId &&
                    (
                        isOwner ||
                            (
                                currentParticipant?.role == "ADMIN" &&
                                    participant.role == "MEMBER"
                                )
                        )
                ListItem(
                    headlineContent = { Text(participant.displayName) },
                    supportingContent = {
                        Text(
                            when (participant.role) {
                                "OWNER" -> "Owner"
                                "ADMIN" -> "Administrator"
                                else -> "@${participant.username}"
                            },
                        )
                    },
                    leadingContent = {
                        InitialAvatar(participant.displayName, size = 44.dp)
                    },
                    trailingContent = if (manageable) {
                        {
                            IconButton(onClick = { selectedMember = participant }) {
                                Icon(Icons.Default.MoreVert, contentDescription = "Manage member")
                            }
                        }
                    } else {
                        null
                    },
                )
            }
            item {
                HorizontalDivider()
                TextButton(
                    onClick = { showLeaveConfirmation = true },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.ExitToApp,
                        contentDescription = null,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Leave chat group", color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }

    if (showRename) {
        var title by rememberSaveable { mutableStateOf(header?.title.orEmpty()) }
        AlertDialog(
            onDismissRequest = { showRename = false },
            title = { Text("Rename chat group") },
            text = {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it.take(80) },
                    label = { Text("Chat group name") },
                    singleLine = true,
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        perform(
                            action = { onRename(title) },
                            after = { showRename = false },
                        )
                    },
                    enabled = title.isNotBlank() && !busy,
                ) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showRename = false }) { Text("Cancel") }
            },
        )
    }

    if (showAddMembers) {
        AddMembersSheet(
            existingUserIds = header?.participants?.map { it.userId }.orEmpty().toSet(),
            onDismiss = { showAddMembers = false },
            onSearchContacts = onSearchContacts,
            onAdd = { userIds ->
                perform(
                    action = { onAddMembers(userIds) },
                    after = { showAddMembers = false },
                )
            },
            busy = busy,
        )
    }

    selectedMember?.let { member ->
        ModalBottomSheet(onDismissRequest = { selectedMember = null }) {
            if (isOwner) {
                ListItem(
                    headlineContent = { Text("Transfer ownership") },
                    supportingContent = {
                        Text("You will remain an administrator.")
                    },
                    modifier = Modifier.clickable {
                        perform(
                            action = { onSetRole(member.userId, "OWNER") },
                            after = { selectedMember = null },
                        )
                    },
                )
                ListItem(
                    headlineContent = {
                        Text(if (member.role == "ADMIN") "Remove administrator" else "Make administrator")
                    },
                    modifier = Modifier.clickable {
                        perform(
                            action = {
                                onSetRole(
                                    member.userId,
                                    if (member.role == "ADMIN") "MEMBER" else "ADMIN",
                                )
                            },
                            after = { selectedMember = null },
                        )
                    },
                )
            }
            ListItem(
                headlineContent = { Text("Remove ${member.displayName}") },
                leadingContent = {
                    Icon(Icons.Default.PersonRemove, contentDescription = null)
                },
                modifier = Modifier.clickable {
                    perform(
                        action = { onRemoveMember(member.userId) },
                        after = { selectedMember = null },
                    )
                },
            )
        }
    }

    if (showLeaveConfirmation) {
        AlertDialog(
            onDismissRequest = { showLeaveConfirmation = false },
            title = { Text("Leave chat group?") },
            text = {
                Text(
                    if (isOwner) {
                        "An owner must assign ownership before leaving a group with other members."
                    } else {
                        "You will stop receiving new messages from this chat group."
                    },
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        perform(
                            action = onLeave,
                            after = {
                                showLeaveConfirmation = false
                            },
                        )
                    },
                    enabled = !busy,
                ) {
                    Text("Leave")
                }
            },
            dismissButton = {
                TextButton(onClick = { showLeaveConfirmation = false }) {
                    Text("Cancel")
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddMembersSheet(
    existingUserIds: Set<String>,
    onDismiss: () -> Unit,
    onSearchContacts: suspend (String) -> List<ContactDto>,
    onAdd: (List<String>) -> Unit,
    busy: Boolean,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var results by remember { mutableStateOf<List<ContactDto>>(emptyList()) }
    var selected by remember { mutableStateOf<Set<String>>(emptySet()) }
    var searchError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(query) {
        delay(250)
        searchError = null
        results = if (query.trim().length < 2) {
            emptyList()
        } else {
            try {
                onSearchContacts(query).filterNot { it.id in existingUserIds }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                searchError = "People search is temporarily unavailable."
                emptyList()
            }
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            Text("Add members", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 10.dp),
                label = { Text("Search people") },
                singleLine = true,
            )
            searchError?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            results.forEach { person ->
                ListItem(
                    headlineContent = { Text(person.displayName) },
                    supportingContent = { Text("@${person.username}") },
                    leadingContent = {
                        InitialAvatar(person.displayName, size = 40.dp)
                    },
                    trailingContent = {
                        Text(if (person.id in selected) "Selected" else "")
                    },
                    modifier = Modifier.clickable {
                        selected = if (person.id in selected) {
                            selected - person.id
                        } else {
                            selected + person.id
                        }
                    },
                )
            }
            Button(
                onClick = { onAdd(selected.toList()) },
                enabled = selected.isNotEmpty() && !busy,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp),
            ) {
                Text("Add ${selected.size.coerceAtLeast(1)}")
            }
        }
    }
}
