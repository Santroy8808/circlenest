package net.thetaspace.communications.ui

import android.Manifest
import android.content.Intent
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.AudioFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.thetaspace.communications.data.AttachmentListItem
import net.thetaspace.communications.data.ConversationHeader
import net.thetaspace.communications.data.MessageListItem
import net.thetaspace.communications.data.local.AttachmentStates
import net.thetaspace.communications.data.local.MessageKinds
import net.thetaspace.communications.data.local.MessageStates
import net.thetaspace.communications.media.VoiceRecorder
import net.thetaspace.communications.ui.components.EncryptedConversationAvatar
import net.thetaspace.communications.ui.components.InitialAvatar
import net.thetaspace.communications.ui.theme.ThetaBlue
import net.thetaspace.communications.ui.theme.ThetaBubbleIncoming
import net.thetaspace.communications.ui.theme.ThetaBubbleOutgoing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    currentUserId: String,
    header: ConversationHeader?,
    messages: List<MessageListItem>,
    typingUserIds: Set<String>,
    initialDraft: String,
    onBack: () -> Unit,
    onSend: suspend (String, String?) -> Unit,
    onQueueAttachments: suspend (List<String>, String) -> Unit,
    onQueueVoice: suspend (String) -> Unit,
    onOpenAttachment: suspend (String, Boolean) -> String,
    onRetry: suspend (String) -> Unit,
    onCancelOutgoing: suspend (String) -> Unit,
    onReact: suspend (String, String) -> Unit,
    onEdit: suspend (String, String) -> Unit,
    onDelete: suspend (String) -> Unit,
    onArchive: suspend (Boolean) -> Unit,
    onPin: suspend (Boolean) -> Unit,
    onMuteUntil: suspend (Long) -> Unit,
    onUnmute: suspend () -> Unit,
    onOpenGroupInfo: () -> Unit,
    onBlockUser: suspend (String) -> Unit,
    onReportMessage: suspend (String, String, String) -> String,
    onDraftChange: suspend (String) -> Unit,
    onTyping: suspend (Boolean) -> Unit,
    onConversationDisplayed: suspend () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var composerText by rememberSaveable(header?.id) { mutableStateOf(initialDraft) }
    var replyTarget by remember { mutableStateOf<MessageListItem?>(null) }
    var editTarget by remember { mutableStateOf<MessageListItem?>(null) }
    var selectedActionMessage by remember { mutableStateOf<MessageListItem?>(null) }
    var messageInfo by remember { mutableStateOf<MessageListItem?>(null) }
    var showConversationMenu by remember { mutableStateOf(false) }
    var showBlockConfirmation by remember { mutableStateOf(false) }
    var reportTarget by remember { mutableStateOf<MessageListItem?>(null) }
    var searchMode by rememberSaveable { mutableStateOf(false) }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var showAttachmentSheet by rememberSaveable { mutableStateOf(false) }
    var attachmentError by remember { mutableStateOf<String?>(null) }
    var microphoneAllowed by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    var isRecording by remember { mutableStateOf(false) }
    val voiceRecorder = remember(context) { VoiceRecorder(context) }
    val snackbarHostState = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val attachmentPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { selectedUris ->
        val uris = selectedUris.take(10)
        uris.forEach { uri ->
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            }
        }
        if (uris.isNotEmpty()) {
            scope.launch {
                runCatching {
                    onQueueAttachments(uris.map(Uri::toString), composerText)
                }.onSuccess {
                    composerText = ""
                }.onFailure {
                    attachmentError = it.message ?: "The attachment could not be queued."
                }
            }
        }
    }
    val microphonePermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        microphoneAllowed = granted
        if (!granted) attachmentError = "Microphone permission is required for voice notes."
    }
    DisposableEffect(voiceRecorder) {
        onDispose { voiceRecorder.cancel() }
    }
    val visibleMessages = remember(messages, searchQuery) {
        if (searchQuery.isBlank()) {
            messages
        } else {
            messages.filter { it.body.orEmpty().contains(searchQuery, ignoreCase = true) }
        }
    }

    LaunchedEffect(header?.id, messages.lastOrNull()?.serverMessageId) {
        onConversationDisplayed()
    }
    LaunchedEffect(initialDraft) {
        if (composerText.isBlank() && initialDraft.isNotBlank()) {
            composerText = initialDraft
        }
    }
    LaunchedEffect(attachmentError) {
        attachmentError?.let {
            snackbarHostState.showSnackbar(it)
            attachmentError = null
        }
    }
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty() && searchQuery.isBlank()) {
            listState.animateScrollToItem(messages.lastIndex)
        }
    }
    LaunchedEffect(composerText) {
        delay(250)
        onDraftChange(composerText)
        onTyping(composerText.isNotBlank())
        if (composerText.isNotBlank()) {
            delay(3_000)
            onTyping(false)
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                title = {
                    if (searchMode) {
                        TextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = { Text("Search conversation") },
                            singleLine = true,
                            colors = TextFieldDefaults.colors(
                                focusedContainerColor = Color.Transparent,
                                unfocusedContainerColor = Color.Transparent,
                                focusedIndicatorColor = Color.Transparent,
                                unfocusedIndicatorColor = Color.Transparent,
                            ),
                        )
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            EncryptedConversationAvatar(
                                title = header?.title.orEmpty(),
                                attachmentId = header?.avatarAttachmentId,
                                size = 38.dp,
                                onOpenAttachment = onOpenAttachment,
                            )
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(
                                    text = header?.title ?: "Conversation",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (typingUserIds.isNotEmpty()) {
                                    Text(
                                        "typing...",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                } else {
                                    Text(
                                        "end-to-end encrypted",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            searchMode = !searchMode
                            if (!searchMode) searchQuery = ""
                        },
                    ) {
                        Icon(
                            if (searchMode) Icons.Default.Close else Icons.Default.Search,
                            contentDescription = if (searchMode) "Close search" else "Search",
                        )
                    }
                    Box {
                        IconButton(onClick = { showConversationMenu = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Conversation menu")
                        }
                        DropdownMenu(
                            expanded = showConversationMenu,
                            onDismissRequest = { showConversationMenu = false },
                        ) {
                            if (header?.type == "GROUP") {
                                DropdownMenuItem(
                                    text = { Text("Chat group info") },
                                    leadingIcon = {
                                        Icon(Icons.Default.Group, contentDescription = null)
                                    },
                                    onClick = {
                                        showConversationMenu = false
                                        onOpenGroupInfo()
                                    },
                                )
                            }
                            if (header?.type == "DIRECT") {
                                DropdownMenuItem(
                                    text = { Text("Block contact") },
                                    leadingIcon = {
                                        Icon(Icons.Default.Block, contentDescription = null)
                                    },
                                    onClick = {
                                        showConversationMenu = false
                                        showBlockConfirmation = true
                                    },
                                )
                            }
                            DropdownMenuItem(
                                text = {
                                    Text(if (header?.isPinned == true) "Unpin" else "Pin")
                                },
                                leadingIcon = {
                                    Icon(Icons.Default.PushPin, contentDescription = null)
                                },
                                onClick = {
                                    showConversationMenu = false
                                    scope.launch {
                                        runCatching { onPin(header?.isPinned != true) }
                                            .onFailure {
                                                attachmentError =
                                                    it.message ?: "Could not update this chat."
                                            }
                                    }
                                },
                            )
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        if (
                                            header?.mutedUntil?.let {
                                                it > System.currentTimeMillis()
                                            } == true
                                        ) {
                                            "Unmute"
                                        } else {
                                            "Mute for 8 hours"
                                        },
                                    )
                                },
                                leadingIcon = {
                                    Icon(Icons.Default.NotificationsOff, contentDescription = null)
                                },
                                onClick = {
                                    showConversationMenu = false
                                    scope.launch {
                                        runCatching {
                                            if (
                                                header?.mutedUntil?.let {
                                                    it > System.currentTimeMillis()
                                                } == true
                                            ) {
                                                onUnmute()
                                            } else {
                                                onMuteUntil(
                                                    System.currentTimeMillis() + 8 * 60 * 60 * 1_000L,
                                                )
                                            }
                                        }.onFailure {
                                            attachmentError =
                                                it.message ?: "Could not update notifications."
                                        }
                                    }
                                },
                            )
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        if (header?.isArchived == true) "Unarchive" else "Archive",
                                    )
                                },
                                leadingIcon = {
                                    Icon(Icons.Default.Archive, contentDescription = null)
                                },
                                onClick = {
                                    showConversationMenu = false
                                    scope.launch {
                                        runCatching {
                                            onArchive(header?.isArchived != true)
                                        }.onFailure {
                                            attachmentError =
                                                it.message ?: "Could not update this chat."
                                        }
                                    }
                                },
                            )
                        }
                    }
                },
            )
        },
        bottomBar = {
            MessageComposer(
                text = composerText,
                replyTarget = replyTarget,
                editTarget = editTarget,
                onTextChange = { composerText = it },
                onCancelContext = {
                    replyTarget = null
                    editTarget = null
                },
                onAttachment = { showAttachmentSheet = true },
                isRecording = isRecording,
                microphoneAllowed = microphoneAllowed,
                onMicrophonePermission = {
                    microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
                },
                onVoiceStart = {
                    runCatching { voiceRecorder.start() }
                        .onSuccess { isRecording = true }
                        .onFailure {
                            attachmentError = it.message ?: "Voice recording could not start."
                        }
                },
                onVoiceStop = {
                    val file = voiceRecorder.stop()
                    isRecording = false
                    if (file != null) {
                        scope.launch {
                            runCatching {
                                onQueueVoice(Uri.fromFile(file).toString())
                            }.onFailure {
                                attachmentError =
                                    it.message ?: "The voice note could not be queued."
                            }
                        }
                    }
                },
                onVoiceCancel = {
                    voiceRecorder.cancel()
                    isRecording = false
                },
                onSend = {
                    val outgoing = composerText
                    if (outgoing.isNotBlank()) {
                        val editing = editTarget
                        val replyId = replyTarget?.serverMessageId
                        composerText = ""
                        replyTarget = null
                        editTarget = null
                        if (editing != null) {
                            onEdit(editing.clientMessageId, outgoing)
                        } else {
                            onSend(outgoing, replyId)
                        }
                    }
                },
            )
        },
        modifier = Modifier.imePadding(),
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
                .padding(horizontal = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            items(visibleMessages, key = MessageListItem::clientMessageId) { message ->
                if (message.kind == MessageKinds.SYSTEM) {
                    SystemMessageRow(
                        message = message,
                        onRetry = { onRetry(message.clientMessageId) },
                    )
                } else {
                    MessageBubble(
                        message = message,
                        isMine = message.senderUserId == currentUserId,
                        onLongPress = { selectedActionMessage = message },
                        onRetry = { onRetry(message.clientMessageId) },
                        onCancelOutgoing = {
                            onCancelOutgoing(message.clientMessageId)
                        },
                        onOpenAttachment = onOpenAttachment,
                    )
                }
            }
        }
    }

    if (showAttachmentSheet) {
        ModalBottomSheet(onDismissRequest = { showAttachmentSheet = false }) {
            ListItem(
                headlineContent = { Text("Photos and GIFs") },
                leadingContent = {
                    Icon(Icons.Default.PhotoLibrary, contentDescription = null)
                },
                modifier = Modifier.clickable {
                    showAttachmentSheet = false
                    attachmentPicker.launch(arrayOf("image/*"))
                },
            )
            ListItem(
                headlineContent = { Text("Videos") },
                leadingContent = {
                    Icon(Icons.Default.VideoLibrary, contentDescription = null)
                },
                modifier = Modifier.clickable {
                    showAttachmentSheet = false
                    attachmentPicker.launch(arrayOf("video/*"))
                },
            )
            ListItem(
                headlineContent = { Text("Files") },
                leadingContent = {
                    Icon(
                        Icons.AutoMirrored.Filled.InsertDriveFile,
                        contentDescription = null,
                    )
                },
                modifier = Modifier.clickable {
                    showAttachmentSheet = false
                    attachmentPicker.launch(arrayOf("*/*"))
                },
            )
        }
    }

    selectedActionMessage?.let { selected ->
        val isMine = selected.senderUserId == currentUserId
        val age = System.currentTimeMillis() - selected.createdAt
        ModalBottomSheet(
            onDismissRequest = { selectedActionMessage = null },
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                listOf("👍", "❤️", "😂", "😮", "😢", "🙏").forEach { emoji ->
                    Text(
                        emoji,
                        modifier = Modifier
                            .clip(CircleShape)
                            .clickable {
                                scope.launch {
                                    onReact(selected.clientMessageId, emoji)
                                }
                                selectedActionMessage = null
                            }
                            .padding(9.dp),
                        style = MaterialTheme.typography.headlineSmall,
                    )
                }
            }
            ListItem(
                headlineContent = { Text("Reply") },
                leadingContent = {
                    Icon(Icons.AutoMirrored.Filled.Reply, contentDescription = null)
                },
                modifier = Modifier.clickable {
                    replyTarget = selected
                    editTarget = null
                    selectedActionMessage = null
                },
            )
            if (isMine && age <= 15 * 60 * 1_000L && !selected.isDeleted) {
                ListItem(
                    headlineContent = { Text("Edit") },
                    leadingContent = { Icon(Icons.Default.Edit, contentDescription = null) },
                    modifier = Modifier.clickable {
                        editTarget = selected
                        replyTarget = null
                        composerText = selected.body.orEmpty()
                        selectedActionMessage = null
                    },
                )
            }
            if (isMine && age <= 48 * 60 * 60 * 1_000L && !selected.isDeleted) {
                ListItem(
                    headlineContent = { Text("Delete for everyone") },
                    leadingContent = {
                        Icon(Icons.Default.DeleteOutline, contentDescription = null)
                    },
                    modifier = Modifier.clickable {
                        scope.launch { onDelete(selected.clientMessageId) }
                        selectedActionMessage = null
                    },
                )
            }
            if (isMine && header?.type == "GROUP") {
                ListItem(
                    headlineContent = { Text("Delivery and read info") },
                    leadingContent = { Icon(Icons.Default.Info, contentDescription = null) },
                    modifier = Modifier.clickable {
                        messageInfo = selected
                        selectedActionMessage = null
                    },
                )
            }
            if (!isMine && selected.serverMessageId != null) {
                ListItem(
                    headlineContent = { Text("Report message") },
                    leadingContent = { Icon(Icons.Default.Flag, contentDescription = null) },
                    modifier = Modifier.clickable {
                        reportTarget = selected
                        selectedActionMessage = null
                    },
                )
            }
        }
    }

    messageInfo?.let { info ->
        ModalBottomSheet(onDismissRequest = { messageInfo = null }) {
            Text(
                "Message info",
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                style = MaterialTheme.typography.titleLarge,
            )
            header?.participants
                ?.filter { it.userId != currentUserId && it.leftAt == null && it.removedAt == null }
                ?.forEach { participant ->
                    val deviceReceipts = info.receipts.filter { it.userId == participant.userId }
                    val seen = deviceReceipts.count { it.seenAt != null }
                    val delivered = deviceReceipts.count {
                        it.deliveredAt != null && it.seenAt == null
                    }
                    val status = when {
                        seen > 0 -> "Seen"
                        delivered > 0 -> "Delivered"
                        else -> "Sent"
                    }
                    ListItem(
                        headlineContent = { Text(participant.displayName) },
                        supportingContent = {
                            val detail = if (deviceReceipts.size > 1) {
                                "Across ${deviceReceipts.size} devices: $seen seen, $delivered delivered"
                            } else {
                                status
                            }
                            Text(detail)
                        },
                        leadingContent = {
                            InitialAvatar(participant.displayName, size = 40.dp)
                        },
                        trailingContent = {
                            Text(
                                status,
                                color = if (status == "Seen") {
                                    ThetaBlue
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                                style = MaterialTheme.typography.labelMedium,
                            )
                        },
                    )
                }
        }
    }

    if (showBlockConfirmation) {
        val target = header?.participants?.firstOrNull { it.userId != currentUserId }
        AlertDialog(
            onDismissRequest = { showBlockConfirmation = false },
            title = { Text("Block ${target?.displayName ?: "contact"}?") },
            text = {
                Text("This contact will no longer be able to start or continue a chat with you.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        val targetUserId = target?.userId ?: return@Button
                        scope.launch {
                            runCatching { onBlockUser(targetUserId) }
                                .onFailure {
                                    attachmentError = it.message ?: "The contact could not be blocked."
                                }
                        }
                        showBlockConfirmation = false
                    },
                ) {
                    Text("Block")
                }
            },
            dismissButton = {
                TextButton(onClick = { showBlockConfirmation = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    reportTarget?.let { target ->
        var reason by rememberSaveable(target.clientMessageId) {
            mutableStateOf("Spam")
        }
        var description by rememberSaveable(target.clientMessageId) {
            mutableStateOf("")
        }
        AlertDialog(
            onDismissRequest = { reportTarget = null },
            title = { Text("Report message") },
            text = {
                Column {
                    listOf("Spam", "Harassment", "Threats", "Illegal content", "Other")
                        .forEach { option ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { reason = option },
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                RadioButton(
                                    selected = reason == option,
                                    onClick = { reason = option },
                                )
                                Text(option)
                            }
                        }
                    OutlinedTextField(
                        value = description,
                        onValueChange = { description = it.take(3_000) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Additional details") },
                        minLines = 3,
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            runCatching {
                                onReportMessage(
                                    target.clientMessageId,
                                    reason,
                                    description,
                                )
                            }.onSuccess { ticketId ->
                                attachmentError = "Report submitted: $ticketId"
                            }.onFailure {
                                attachmentError = it.message ?: "The report could not be submitted."
                            }
                        }
                        reportTarget = null
                    },
                ) {
                    Text("Submit report")
                }
            },
            dismissButton = {
                TextButton(onClick = { reportTarget = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun MessageComposer(
    text: String,
    replyTarget: MessageListItem?,
    editTarget: MessageListItem?,
    onTextChange: (String) -> Unit,
    onCancelContext: () -> Unit,
    onAttachment: () -> Unit,
    isRecording: Boolean,
    microphoneAllowed: Boolean,
    onMicrophonePermission: () -> Unit,
    onVoiceStart: () -> Unit,
    onVoiceStop: () -> Unit,
    onVoiceCancel: () -> Unit,
    onSend: suspend () -> Unit,
) {
    var sendRequested by remember { mutableStateOf(false) }
    LaunchedEffect(sendRequested) {
        if (sendRequested) {
            onSend()
            sendRequested = false
        }
    }
    Surface(
        tonalElevation = 2.dp,
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            if (isRecording) {
                Text(
                    "Recording voice note - release to send",
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 7.dp),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            val contextTarget = editTarget ?: replyTarget
            if (contextTarget != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            if (editTarget != null) "Edit message" else "Reply",
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.labelMedium,
                        )
                        Text(
                            contextTarget.body.orEmpty(),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    IconButton(onClick = onCancelContext) {
                        Icon(Icons.Default.Close, contentDescription = "Cancel reply")
                    }
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                IconButton(onClick = onAttachment) {
                    Icon(Icons.Default.AttachFile, contentDescription = "Attach")
                }
                TextField(
                    value = text,
                    onValueChange = onTextChange,
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Message") },
                    maxLines = 5,
                    shape = RoundedCornerShape(8.dp),
                    colors = TextFieldDefaults.colors(
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                    ),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(
                        onSend = { if (text.isNotBlank()) sendRequested = true },
                    ),
                )
                Spacer(Modifier.width(4.dp))
                if (text.isBlank()) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .background(
                                if (isRecording) {
                                    MaterialTheme.colorScheme.error
                                } else {
                                    MaterialTheme.colorScheme.primary
                                },
                                CircleShape,
                            )
                            .pointerInput(microphoneAllowed) {
                                detectTapGestures(
                                    onPress = {
                                        if (!microphoneAllowed) {
                                            onMicrophonePermission()
                                        } else {
                                            onVoiceStart()
                                            if (tryAwaitRelease()) {
                                                onVoiceStop()
                                            } else {
                                                onVoiceCancel()
                                            }
                                        }
                                    },
                                )
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Default.Mic,
                            contentDescription = "Hold to record a voice note",
                            tint = MaterialTheme.colorScheme.onPrimary,
                        )
                    }
                } else {
                    IconButton(
                        onClick = { sendRequested = true },
                        modifier = Modifier
                            .size(48.dp)
                            .background(MaterialTheme.colorScheme.primary, CircleShape),
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.Send,
                            contentDescription = "Send",
                            tint = MaterialTheme.colorScheme.onPrimary,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SystemMessageRow(
    message: MessageListItem,
    onRetry: suspend () -> Unit,
) {
    val scope = rememberCoroutineScope()
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier.clickable(
                enabled = message.state == MessageStates.FAILED,
            ) {
                scope.launch { onRetry() }
            },
        ) {
            Text(
                text = buildString {
                    append(message.body.orEmpty())
                    if (message.state == MessageStates.FAILED) {
                        append(" Tap to retry.")
                    }
                },
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(
    message: MessageListItem,
    isMine: Boolean,
    onLongPress: () -> Unit,
    onRetry: suspend () -> Unit,
    onCancelOutgoing: suspend () -> Unit,
    onOpenAttachment: suspend (String, Boolean) -> String,
) {
    var retryRequested by remember { mutableStateOf(false) }
    var cancelRequested by remember { mutableStateOf(false) }
    LaunchedEffect(retryRequested) {
        if (retryRequested) {
            onRetry()
            retryRequested = false
        }
    }
    LaunchedEffect(cancelRequested) {
        if (cancelRequested) {
            onCancelOutgoing()
            cancelRequested = false
        }
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isMine) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            color = if (isMine) ThetaBubbleOutgoing else ThetaBubbleIncoming,
            shape = RoundedCornerShape(8.dp),
            shadowElevation = 0.5.dp,
            modifier = Modifier
                .fillMaxWidth(0.82f)
                .combinedClickable(
                    onClick = {
                        if (message.state == MessageStates.FAILED) retryRequested = true
                    },
                    onLongClick = onLongPress,
                ),
        ) {
            Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp)) {
                message.attachments.forEach { attachment ->
                    AttachmentPreview(attachment, onOpenAttachment)
                }
                val body = if (message.isDeleted) {
                    "This message was deleted"
                } else {
                    message.body.orEmpty()
                }
                if (body.isNotBlank()) {
                    Text(
                        text = body,
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (message.isDeleted) {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                    )
                }
                if (message.reactions.isNotEmpty()) {
                    Row(
                        modifier = Modifier.padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        message.reactions.forEach { reaction ->
                            Surface(
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                shape = RoundedCornerShape(12.dp),
                            ) {
                                Text(
                                    "${reaction.emoji} ${reaction.userIds.size}",
                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                    style = MaterialTheme.typography.labelMedium,
                                )
                            }
                        }
                    }
                }
                if (
                    message.attachments.isNotEmpty() &&
                    message.state in setOf(
                        MessageStates.QUEUED,
                        MessageStates.ENCRYPTING,
                        MessageStates.UPLOADING,
                        MessageStates.SENDING,
                    )
                ) {
                    TextButton(
                        onClick = { cancelRequested = true },
                        modifier = Modifier.align(Alignment.End),
                    ) {
                        Text("Cancel")
                    }
                }
                Row(
                    modifier = Modifier.align(Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = formatMessageTime(message.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (message.isEdited && !message.isDeleted) {
                        Text(
                            " edited",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (isMine) {
                        Spacer(Modifier.width(3.dp))
                        MessageStateIcon(message.state)
                    }
                }
            }
        }
    }
}

@Composable
private fun AttachmentPreview(
    attachment: AttachmentListItem,
    onOpenAttachment: suspend (String, Boolean) -> String,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var openError by remember { mutableStateOf<String?>(null) }
    val isVisual = attachment.mimeType.startsWith("image/") ||
        attachment.mimeType.startsWith("video/")
    val preview by produceState<Bitmap?>(
        initialValue = null,
        key1 = attachment.sourceUri,
        key2 = attachment.state,
    ) {
        if (!isVisual) return@produceState
        val previewSource = attachment.sourceUri ?: runCatching {
            val path = onOpenAttachment(attachment.id, true)
            Uri.fromFile(File(path)).toString()
        }.getOrNull()
        value = previewSource?.let { source ->
            withContext(Dispatchers.IO) {
                loadMediaPreview(context, source, attachment.mimeType)
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 5.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        if (isVisual && preview != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(4f / 3f)
                    .clip(RoundedCornerShape(6.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable {
                        scope.launch {
                            runCatching {
                                openAttachmentExternally(
                                    context,
                                    attachment,
                                    onOpenAttachment,
                                )
                            }.onFailure {
                                openError = "This media could not be opened."
                            }
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    bitmap = preview!!.asImageBitmap(),
                    contentDescription = attachment.filename,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
                if (attachment.mimeType.startsWith("video/")) {
                    Surface(
                        shape = CircleShape,
                        color = Color.Black.copy(alpha = 0.62f),
                    ) {
                        Icon(
                            Icons.Default.PlayArrow,
                            contentDescription = "Video",
                            tint = Color.White,
                            modifier = Modifier
                                .padding(10.dp)
                                .size(26.dp),
                        )
                    }
                }
            }
        } else {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        MaterialTheme.colorScheme.surfaceVariant,
                        RoundedCornerShape(6.dp),
                    )
                    .clickable {
                        scope.launch {
                            runCatching {
                                openAttachmentExternally(
                                    context,
                                    attachment,
                                    onOpenAttachment,
                                )
                            }.onFailure {
                                openError = "This file could not be opened."
                            }
                        }
                    }
                    .padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    if (attachment.mimeType.startsWith("audio/")) {
                        Icons.Default.AudioFile
                    } else {
                        Icons.AutoMirrored.Filled.InsertDriveFile
                    },
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        attachment.filename,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        formatBytes(attachment.byteSize),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        openError?.let {
            Text(
                it,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error,
            )
        }

        when (attachment.state) {
            AttachmentStates.QUEUED,
            AttachmentStates.ENCRYPTING,
            AttachmentStates.ENCRYPTED,
            AttachmentStates.UPLOADING,
            -> {
                val total = attachment.encryptedSizeBytes ?: 0L
                val progress = if (total > 0L) {
                    (attachment.uploadedBytes.toFloat() / total).coerceIn(0f, 1f)
                } else {
                    0f
                }
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    when (attachment.state) {
                        AttachmentStates.QUEUED -> "Queued"
                        AttachmentStates.ENCRYPTING -> "Encrypting"
                        AttachmentStates.ENCRYPTED -> "Encrypted"
                        else -> "${(progress * 100).toInt()}% uploaded"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            AttachmentStates.FAILED -> Text(
                "Upload failed. Tap the message to retry.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

private suspend fun openAttachmentExternally(
    context: Context,
    attachment: AttachmentListItem,
    onOpenAttachment: suspend (String, Boolean) -> String,
) {
    val originalUri = attachment.sourceUri?.let(Uri::parse)
    val uri = if (originalUri != null) {
        originalUri
    } else {
        val path = onOpenAttachment(attachment.id, false)
        FileProvider.getUriForFile(
            context,
            "${context.packageName}.files",
            File(path),
        )
    }
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, attachment.mimeType)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(intent)
}

private fun loadMediaPreview(context: Context, uriValue: String, mimeType: String): Bitmap? =
    runCatching {
        val uri = Uri.parse(uriValue)
        if (mimeType.startsWith("video/")) {
            val retriever = MediaMetadataRetriever()
            try {
                if (uri.scheme == "file") {
                    retriever.setDataSource(uri.path)
                } else {
                    retriever.setDataSource(context, uri)
                }
                retriever.getFrameAtTime(1_000_000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            } finally {
                retriever.release()
            }
        } else if (mimeType.startsWith("image/")) {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            openUriInput(context, uri)?.use {
                BitmapFactory.decodeStream(it, null, bounds)
            }
            var sample = 1
            while (bounds.outWidth / sample > 900 || bounds.outHeight / sample > 900) {
                sample *= 2
            }
            openUriInput(context, uri)?.use {
                BitmapFactory.decodeStream(
                    it,
                    null,
                    BitmapFactory.Options().apply { inSampleSize = sample },
                )
            }
        } else {
            null
        }
    }.getOrNull()

private fun openUriInput(context: Context, uri: Uri) =
    if (uri.scheme == "file") {
        uri.path?.let(::File)?.inputStream()
    } else {
        context.contentResolver.openInputStream(uri)
    }

private fun formatBytes(bytes: Long): String = when {
    bytes < 1_024 -> "$bytes B"
    bytes < 1_048_576 -> "${bytes / 1_024} KB"
    else -> String.format("%.1f MB", bytes / 1_048_576.0)
}

@Composable
private fun MessageStateIcon(state: String) {
    val (icon, tint, description) = when (state) {
        MessageStates.QUEUED, MessageStates.ENCRYPTING, MessageStates.UPLOADING ->
            Triple(Icons.Default.Schedule, MaterialTheme.colorScheme.onSurfaceVariant, "Queued")
        MessageStates.SENDING ->
            Triple(Icons.Default.Schedule, MaterialTheme.colorScheme.primary, "Sending")
        MessageStates.SENT ->
            Triple(Icons.Default.Done, MaterialTheme.colorScheme.onSurfaceVariant, "Sent")
        MessageStates.DELIVERED ->
            Triple(Icons.Default.DoneAll, MaterialTheme.colorScheme.onSurfaceVariant, "Delivered")
        MessageStates.SEEN ->
            Triple(Icons.Default.DoneAll, ThetaBlue, "Seen")
        else ->
            Triple(Icons.Default.ErrorOutline, MaterialTheme.colorScheme.error, "Failed. Tap to retry")
    }
    Icon(
        imageVector = icon,
        contentDescription = description,
        tint = tint,
        modifier = Modifier.size(16.dp),
    )
}

private fun formatMessageTime(epochMillis: Long): String =
    Instant.ofEpochMilli(epochMillis)
        .atZone(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("h:mm a"))
