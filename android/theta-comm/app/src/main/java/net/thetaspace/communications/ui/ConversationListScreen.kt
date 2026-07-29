package net.thetaspace.communications.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.filled.AddComment
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.GroupAdd
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SearchBar
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import net.thetaspace.communications.data.ConversationListItem
import net.thetaspace.communications.data.remote.ContactDto
import net.thetaspace.communications.ui.components.InitialAvatar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationListScreen(
    conversations: List<ConversationListItem>,
    onOpenConversation: (String) -> Unit,
    onSearchContacts: suspend (String) -> List<ContactDto>,
    onStartDirect: suspend (String) -> String,
    onStartGroup: suspend (String, List<String>) -> String,
    onOpenArchived: () -> Unit,
    onLogout: () -> Unit,
) {
    var showNewConversation by rememberSaveable { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Theta-Comm", fontWeight = FontWeight.SemiBold)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Security,
                                contentDescription = null,
                                modifier = Modifier.size(13.dp),
                                tint = MaterialTheme.colorScheme.primary,
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                "End-to-end encrypted",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onOpenArchived) {
                        Icon(Icons.Default.Archive, contentDescription = "Archived chats")
                    }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.MoreVert, contentDescription = "Account menu")
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showNewConversation = true }) {
                Icon(Icons.Default.AddComment, contentDescription = "New conversation")
            }
        },
    ) { padding ->
        if (conversations.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Default.AddComment,
                        contentDescription = null,
                        modifier = Modifier.size(42.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text("No conversations yet", style = MaterialTheme.typography.titleMedium)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                items(conversations, key = ConversationListItem::id) { conversation ->
                    ConversationRow(
                        conversation = conversation,
                        onClick = { onOpenConversation(conversation.id) },
                    )
                    HorizontalDivider(
                        modifier = Modifier.padding(start = 76.dp),
                        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f),
                    )
                }
            }
        }
    }

    if (showNewConversation) {
        NewConversationSheet(
            onDismiss = { showNewConversation = false },
            onSearch = onSearchContacts,
            onStartDirect = { userId ->
                val id = onStartDirect(userId)
                showNewConversation = false
                onOpenConversation(id)
            },
            onStartGroup = { title, userIds ->
                val id = onStartGroup(title, userIds)
                showNewConversation = false
                onOpenConversation(id)
            },
        )
    }
}

@Composable
private fun ConversationRow(
    conversation: ConversationListItem,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        InitialAvatar(conversation.title, size = 48.dp)
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = conversation.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = conversation.lastMessageAt?.let(::formatConversationTime).orEmpty(),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (conversation.unreadCount > 0) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = conversation.preview,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (conversation.unreadCount > 0) {
                    Spacer(Modifier.width(8.dp))
                    Badge {
                        Text(conversation.unreadCount.coerceAtMost(99).toString())
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewConversationSheet(
    onDismiss: () -> Unit,
    onSearch: suspend (String) -> List<ContactDto>,
    onStartDirect: suspend (String) -> Unit,
    onStartGroup: suspend (String, List<String>) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var results by remember { mutableStateOf<List<ContactDto>>(emptyList()) }
    var loadingUserId by remember { mutableStateOf<String?>(null) }
    var groupMode by rememberSaveable { mutableStateOf(false) }
    var groupTitle by rememberSaveable { mutableStateOf("") }
    var selectedUserIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var createGroupRequested by remember { mutableStateOf(false) }

    LaunchedEffect(query) {
        delay(250)
        results = if (query.trim().length >= 2) onSearch(query) else emptyList()
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 24.dp),
        ) {
            Text(
                if (groupMode) "New chat group" else "New conversation",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            if (!groupMode) {
                ListItem(
                    headlineContent = { Text("New chat group") },
                    supportingContent = { Text("Encrypted chat, separate from Theta-Space Groups") },
                    leadingContent = {
                        InitialAvatar("Group", size = 44.dp)
                    },
                    trailingContent = {
                        Icon(Icons.Default.GroupAdd, contentDescription = null)
                    },
                    modifier = Modifier.clickable {
                        groupMode = true
                        query = ""
                        results = emptyList()
                    },
                )
            } else {
                ListItem(
                    headlineContent = {
                        androidx.compose.material3.OutlinedTextField(
                            value = groupTitle,
                            onValueChange = { groupTitle = it.take(80) },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Chat group name") },
                            singleLine = true,
                        )
                    },
                    leadingContent = {
                        IconButton(
                            onClick = {
                                groupMode = false
                                selectedUserIds = emptySet()
                                groupTitle = ""
                            },
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back",
                            )
                        }
                    },
                )
                Text(
                    "${selectedUserIds.size} selected - choose at least 2",
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            SearchBar(
                inputField = {
                    SearchBarDefaults.InputField(
                        query = query,
                        onQueryChange = { query = it },
                        onSearch = {},
                        expanded = false,
                        onExpandedChange = {},
                        placeholder = { Text("Search people") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(onClick = { query = "" }) {
                                    Icon(Icons.Default.Close, contentDescription = "Clear search")
                                }
                            }
                        },
                    )
                },
                expanded = false,
                onExpandedChange = {},
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
            ) {}
            results.forEach { person ->
                val selected = person.id in selectedUserIds
                ListItem(
                    headlineContent = { Text(person.displayName) },
                    supportingContent = { Text("@${person.username}") },
                    leadingContent = { InitialAvatar(person.displayName, size = 44.dp) },
                    trailingContent = if (groupMode) {
                        {
                            Checkbox(
                                checked = selected,
                                onCheckedChange = null,
                            )
                        }
                    } else {
                        null
                    },
                    modifier = Modifier.clickable(
                        enabled = loadingUserId == null && !createGroupRequested,
                        onClick = {
                            if (groupMode) {
                                selectedUserIds = if (selected) {
                                    selectedUserIds - person.id
                                } else {
                                    selectedUserIds + person.id
                                }
                            } else {
                                loadingUserId = person.id
                            }
                        },
                    ),
                )
                if (loadingUserId == person.id) {
                    LaunchedEffect(person.id) {
                        onStartDirect(person.id)
                        loadingUserId = null
                    }
                }
            }
            if (groupMode) {
                Button(
                    onClick = { createGroupRequested = true },
                    enabled = groupTitle.isNotBlank() &&
                        selectedUserIds.size >= 2 &&
                        !createGroupRequested,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                ) {
                    Text(if (createGroupRequested) "Creating..." else "Create chat group")
                }
                if (createGroupRequested) {
                    LaunchedEffect(groupTitle, selectedUserIds) {
                        onStartGroup(groupTitle, selectedUserIds.toList())
                        createGroupRequested = false
                    }
                }
            }
        }
    }
}

private fun formatConversationTime(epochMillis: Long): String {
    val time = Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault())
    val now = Instant.now().atZone(ZoneId.systemDefault())
    return if (time.toLocalDate() == now.toLocalDate()) {
        time.format(DateTimeFormatter.ofPattern("h:mm a"))
    } else {
        time.format(DateTimeFormatter.ofPattern("MMM d"))
    }
}
