package net.thetaspace.communications.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

val ThetaTeal = Color(0xFF0B6B62)
val ThetaTealDark = Color(0xFF075049)
val ThetaGold = Color(0xFFD7A51D)
val ThetaBlue = Color(0xFF2475D0)
val ThetaInk = Color(0xFF1B2027)
val ThetaMuted = Color(0xFF68717D)
val ThetaCanvas = Color(0xFFF4F6F8)
val ThetaBubbleIncoming = Color(0xFFFFFFFF)
val ThetaBubbleOutgoing = Color(0xFFDDF3E7)

private val LightColors = lightColorScheme(
    primary = ThetaTeal,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD5EFE9),
    onPrimaryContainer = ThetaTealDark,
    secondary = ThetaGold,
    onSecondary = Color(0xFF241A00),
    background = ThetaCanvas,
    onBackground = ThetaInk,
    surface = Color.White,
    onSurface = ThetaInk,
    surfaceVariant = Color(0xFFE8ECEF),
    onSurfaceVariant = ThetaMuted,
    outline = Color(0xFFC7CDD2),
    error = Color(0xFFB3261E),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF68D0C1),
    onPrimary = Color(0xFF003731),
    secondary = Color(0xFFF2C94C),
    background = Color(0xFF121416),
    onBackground = Color(0xFFE7E9EC),
    surface = Color(0xFF1B1E21),
    onSurface = Color(0xFFE7E9EC),
    surfaceVariant = Color(0xFF2B3035),
    onSurfaceVariant = Color(0xFFBBC1C7),
    outline = Color(0xFF555D65),
    error = Color(0xFFFFB4AB),
)

@Composable
fun ThetaCommTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    isAppearanceLightNavigationBars = !darkTheme
                }
            }
        }
    }
    MaterialTheme(
        colorScheme = colors,
        content = content,
    )
}
