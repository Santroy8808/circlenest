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
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.AudioFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import net.thetaspace.communications.data.local.MessageStates
import net.thetaspace.communications.media.VoiceRecorder
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
    onDraftChange: suspend (String) -> Unit,
    onTyping: suspend (Boolean) -> Unit,
    onConversationDisplayed: suspend () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var composerText by rememberSaveable(header?.id) { mutableStateOf(initialDraft) }
    var replyTarget by remember { mutableStateOf<MessageListItem?>(null) }
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

    LaunchedEffect(header?.id) {
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
                            InitialAvatar(header?.title.orEmpty(), size = 38.dp)
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
                    IconButton(onClick = {}) {
                        Icon(Icons.Default.MoreVert, contentDescription = "Conversation menu")
                    }
                },
            )
        },
        bottomBar = {
            MessageComposer(
                text = composerText,
                replyTarget = replyTarget,
                onTextChange = { composerText = it },
                onCancelReply = { replyTarget = null },
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
                        val replyId = replyTarget?.serverMessageId
                        composerText = ""
                        replyTarget = null
                        onSend(outgoing, replyId)
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
                MessageBubble(
                    message = message,
                    isMine = message.senderUserId == currentUserId,
                    onReply = { replyTarget = message },
                    onRetry = { onRetry(message.clientMessageId) },
                    onOpenAttachment = onOpenAttachment,
                )
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
                    Icon(Icons.Default.InsertDriveFile, contentDescription = null)
                },
                modifier = Modifier.clickable {
                    showAttachmentSheet = false
                    attachmentPicker.launch(arrayOf("*/*"))
                },
            )
        }
    }
}

@Composable
private fun MessageComposer(
    text: String,
    replyTarget: MessageListItem?,
    onTextChange: (String) -> Unit,
    onCancelReply: () -> Unit,
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
            if (replyTarget != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Reply",
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.labelMedium,
                        )
                        Text(
                            replyTarget.body.orEmpty(),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    IconButton(onClick = onCancelReply) {
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(
    message: MessageListItem,
    isMine: Boolean,
    onReply: () -> Unit,
    onRetry: suspend () -> Unit,
    onOpenAttachment: suspend (String, Boolean) -> String,
) {
    var retryRequested by remember { mutableStateOf(false) }
    LaunchedEffect(retryRequested) {
        if (retryRequested) {
            onRetry()
            retryRequested = false
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
                    onLongClick = onReply,
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
                Row(
                    modifier = Modifier.align(Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = formatMessageTime(message.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
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
                    .background(MaterialTheme.colorScheme.surfaceVariant),
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
                    .padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    if (attachment.mimeType.startsWith("audio/")) {
                        Icons.Default.AudioFile
                    } else {
                        Icons.Default.InsertDriveFile
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
