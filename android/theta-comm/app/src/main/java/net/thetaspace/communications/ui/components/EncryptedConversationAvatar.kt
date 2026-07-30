package net.thetaspace.communications.ui.components

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun EncryptedConversationAvatar(
    title: String,
    attachmentId: String?,
    size: Dp,
    onOpenAttachment: suspend (String, Boolean) -> String,
) {
    val bitmap by produceState<android.graphics.Bitmap?>(
        initialValue = null,
        key1 = attachmentId,
    ) {
        value = if (attachmentId == null) {
            null
        } else {
            try {
                val path = onOpenAttachment(attachmentId, true)
                withContext(Dispatchers.IO) {
                    BitmapFactory.decodeFile(File(path).absolutePath)
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                null
            }
        }
    }
    if (bitmap == null) {
        InitialAvatar(label = title, size = size)
    } else {
        Image(
            bitmap = bitmap!!.asImageBitmap(),
            contentDescription = "$title chat image",
            modifier = Modifier
                .size(size)
                .clip(CircleShape),
            contentScale = ContentScale.Crop,
        )
    }
}
