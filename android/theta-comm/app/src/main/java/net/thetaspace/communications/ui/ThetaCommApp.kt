package net.thetaspace.communications.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import net.thetaspace.communications.ThetaCommApplication
import net.thetaspace.communications.realtime.ThetaCommConnectionService
import net.thetaspace.communications.ui.theme.ThetaCommTheme

private object Routes {
    const val conversations = "conversations"
    const val archived = "archived"
    const val devices = "devices"
    const val conversation = "conversation/{conversationId}"
    const val groupInfo = "group-info/{conversationId}"
    const val conversationId = "conversationId"

    fun conversation(id: String) = "conversation/$id"
    fun groupInfo(id: String) = "group-info/$id"
}

@Composable
fun ThetaCommApp() {
    val context = LocalContext.current
    val app = context.applicationContext as ThetaCommApplication
    val session by app.container.sessionStore.session.collectAsStateWithLifecycle(initialValue = null)
    val scope = rememberCoroutineScope()
    val notificationPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {}

    LaunchedEffect(session?.commDeviceId) {
        if (session?.commDeviceId == null) {
            ThetaCommConnectionService.stop(context)
        } else {
            ThetaCommConnectionService.start(context)
        }
        if (
            session != null &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    ThetaCommTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background,
        ) {
            if (session == null) {
                var identifier by rememberSaveable { mutableStateOf("") }
                var password by rememberSaveable { mutableStateOf("") }
                var loading by rememberSaveable { mutableStateOf(false) }
                var error by rememberSaveable { mutableStateOf<String?>(null) }
                LoginScreen(
                    identifier = identifier,
                    password = password,
                    loading = loading,
                    error = error,
                    onIdentifierChange = {
                        identifier = it
                        error = null
                    },
                    onPasswordChange = {
                        password = it
                        error = null
                    },
                    onLogin = {
                        if (!loading) {
                            loading = true
                            scope.launch {
                                runCatching {
                                    app.container.repository.login(identifier, password)
                                }.onFailure {
                                    error = it.message ?: "Could not sign in."
                                }
                                loading = false
                            }
                        }
                    },
                )
            } else {
                AuthenticatedApp(app)
            }
        }
    }
}

@Composable
private fun AuthenticatedApp(app: ThetaCommApplication) {
    val context = LocalContext.current
    val navController = rememberNavController()
    val session by app.container.sessionStore.session.collectAsStateWithLifecycle(initialValue = null)
    val conversations by app.container.repository.conversations()
        .collectAsStateWithLifecycle(initialValue = emptyList())
    val scope = rememberCoroutineScope()

    NavHost(
        navController = navController,
        startDestination = Routes.conversations,
    ) {
        composable(Routes.conversations) {
            ConversationListScreen(
                conversations = conversations,
                onOpenConversation = {
                    navController.navigate(Routes.conversation(it))
                },
                onSearchContacts = app.container.repository::searchContacts,
                onStartDirect = app.container.repository::startDirectConversation,
                onStartGroup = app.container.repository::startGroupConversation,
                onOpenArchived = { navController.navigate(Routes.archived) },
                onOpenDevices = { navController.navigate(Routes.devices) },
                onOpenNotificationSettings = {
                    context.startActivity(
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                            putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                        },
                    )
                },
                onLogout = {
                    scope.launch { app.container.repository.logout() }
                },
            )
        }
        composable(Routes.archived) {
            val archived by app.container.repository.conversations(archived = true)
                .collectAsStateWithLifecycle(initialValue = emptyList())
            ConversationListScreen(
                conversations = archived,
                onOpenConversation = { navController.navigate(Routes.conversation(it)) },
                onSearchContacts = app.container.repository::searchContacts,
                onStartDirect = app.container.repository::startDirectConversation,
                onStartGroup = app.container.repository::startGroupConversation,
                onOpenArchived = { navController.popBackStack() },
                onOpenDevices = { navController.navigate(Routes.devices) },
                onOpenNotificationSettings = {
                    context.startActivity(
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                            putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                        },
                    )
                },
                onLogout = { navController.popBackStack() },
            )
        }
        composable(Routes.devices) {
            DeviceSecurityScreen(
                currentDeviceId = session?.commDeviceId,
                onBack = { navController.popBackStack() },
                loadDevices = app.container.repository::listDevices,
                onRevokeDevice = app.container.repository::revokeDevice,
            )
        }
        composable(
            route = Routes.conversation,
            arguments = listOf(
                navArgument(Routes.conversationId) {
                    type = NavType.StringType
                },
            ),
        ) { backStackEntry ->
            val conversationId = backStackEntry.arguments
                ?.getString(Routes.conversationId)
                .orEmpty()
            val header by app.container.repository.conversationHeader(conversationId)
                .collectAsStateWithLifecycle(initialValue = null)
            val messages by app.container.repository.messages(conversationId)
                .collectAsStateWithLifecycle(initialValue = emptyList())
            val draft by app.container.repository.draft(conversationId)
                .collectAsStateWithLifecycle(initialValue = "")
            val typing by app.container.repository.typingUsers(conversationId)
                .collectAsStateWithLifecycle(initialValue = emptySet())
            ChatScreen(
                currentUserId = session?.userId.orEmpty(),
                header = header,
                messages = messages,
                typingUserIds = typing,
                initialDraft = draft,
                onBack = { navController.popBackStack() },
                onSend = { text, replyTo ->
                    app.container.repository.queueTextMessage(
                        conversationId = conversationId,
                        text = text,
                        replyToMessageId = replyTo,
                    )
                },
                onQueueAttachments = { uriValues, caption ->
                    app.container.repository.queueAttachments(
                        conversationId = conversationId,
                        uriValues = uriValues,
                        caption = caption,
                    )
                },
                onQueueVoice = { uriValue ->
                    app.container.repository.queueAttachments(
                        conversationId = conversationId,
                        uriValues = listOf(uriValue),
                        voiceNote = true,
                    )
                },
                onOpenAttachment = app.container.repository::openAttachment,
                onRetry = app.container.repository::retryMessage,
                onCancelOutgoing = app.container.repository::cancelOutgoingMessage,
                onReact = app.container.repository::reactToMessage,
                onEdit = app.container.repository::editMessage,
                onDelete = app.container.repository::deleteMessage,
                onArchive = { archived ->
                    app.container.repository.setConversationArchived(
                        conversationId,
                        archived,
                    )
                    if (archived) navController.popBackStack()
                },
                onPin = { pinned ->
                    app.container.repository.setConversationPinned(conversationId, pinned)
                },
                onMuteUntil = { until ->
                    app.container.repository.muteConversation(conversationId, until)
                },
                onUnmute = {
                    app.container.repository.unmuteConversation(conversationId)
                },
                onOpenGroupInfo = {
                    navController.navigate(Routes.groupInfo(conversationId))
                },
                onBlockUser = { targetUserId ->
                    app.container.repository.blockUser(conversationId, targetUserId)
                    navController.popBackStack()
                },
                onReportMessage = app.container.repository::reportMessage,
                onDraftChange = {
                    app.container.repository.saveDraft(conversationId, it)
                },
                onTyping = {
                    app.container.repository.setTyping(conversationId, it)
                },
                onConversationDisplayed = {
                    app.container.repository.markConversationSeen(conversationId)
                },
            )
        }
        composable(
            route = Routes.groupInfo,
            arguments = listOf(
                navArgument(Routes.conversationId) {
                    type = NavType.StringType
                },
            ),
        ) { backStackEntry ->
            val conversationId = backStackEntry.arguments
                ?.getString(Routes.conversationId)
                .orEmpty()
            val header by app.container.repository.conversationHeader(conversationId)
                .collectAsStateWithLifecycle(initialValue = null)
            GroupInfoScreen(
                currentUserId = session?.userId.orEmpty(),
                header = header,
                onBack = { navController.popBackStack() },
                onSearchContacts = app.container.repository::searchContacts,
                onRename = { app.container.repository.renameGroup(conversationId, it) },
                onAddMembers = {
                    app.container.repository.addGroupMembers(conversationId, it)
                },
                onRemoveMember = {
                    app.container.repository.removeGroupMember(conversationId, it)
                },
                onSetRole = { userId, role ->
                    app.container.repository.setGroupRole(
                        conversationId,
                        userId,
                        role,
                    )
                },
                onSetAvatar = {
                    app.container.repository.queueGroupAvatar(conversationId, it)
                },
                onRemoveAvatar = {
                    app.container.repository.removeGroupAvatar(conversationId)
                },
                onOpenAttachment = app.container.repository::openAttachment,
                onLeave = {
                    app.container.repository.leaveGroup(conversationId)
                    navController.popBackStack(Routes.conversations, inclusive = false)
                },
            )
        }
    }
}
