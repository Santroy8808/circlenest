package net.thetaspace.communications.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument

private object Routes {
    const val conversations = "conversations"
    const val conversation = "conversation/{conversationId}"
    const val conversationId = "conversationId"

    fun conversation(id: String) = "conversation/$id"
}

@Composable
fun ThetaCommApp() {
    val navController = rememberNavController()

    MaterialTheme {
        NavHost(
            navController = navController,
            startDestination = Routes.conversations,
        ) {
            composable(Routes.conversations) {
                Text("Theta-Comm")
            }
            composable(
                route = Routes.conversation,
                arguments = listOf(
                    navArgument(Routes.conversationId) {
                        type = NavType.StringType
                    },
                ),
            ) { backStackEntry ->
                Text(
                    text = backStackEntry.arguments
                        ?.getString(Routes.conversationId)
                        .orEmpty(),
                )
            }
        }
    }
}
