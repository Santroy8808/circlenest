package net.thetaspace.communications.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private val avatarColors = listOf(
    Color(0xFF0B6B62),
    Color(0xFF3568A8),
    Color(0xFF8C4D76),
    Color(0xFF8A5A16),
    Color(0xFF526A3C),
)

@Composable
fun InitialAvatar(
    label: String,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
) {
    val initials = label
        .trim()
        .split(Regex("\\s+"))
        .filter(String::isNotBlank)
        .take(2)
        .joinToString("") { it.take(1).uppercase() }
        .ifEmpty { "T" }
    val color = avatarColors[(label.hashCode() and Int.MAX_VALUE) % avatarColors.size]
    Box(
        modifier = modifier
            .size(size)
            .background(color, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.titleMedium,
        )
    }
}
