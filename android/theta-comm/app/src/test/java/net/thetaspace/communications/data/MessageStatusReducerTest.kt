package net.thetaspace.communications.data

import net.thetaspace.communications.data.local.MessageStates
import net.thetaspace.communications.data.remote.ReceiptDto
import org.junit.Assert.assertEquals
import org.junit.Test

class MessageStatusReducerTest {
    @Test
    fun serverAcceptanceWithoutDeviceAckRemainsSent() {
        val statuses = MessageStatusReducer.perParticipant(
            participantUserIds = listOf("sender", "recipient"),
            senderUserId = "sender",
            receipts = listOf(receipt("recipient", "phone")),
        )

        assertEquals(MessageStates.SENT, MessageStatusReducer.aggregate(statuses))
    }

    @Test
    fun oneRecipientDeviceAckMarksThatParticipantDelivered() {
        val statuses = MessageStatusReducer.perParticipant(
            participantUserIds = listOf("sender", "recipient"),
            senderUserId = "sender",
            receipts = listOf(
                receipt("recipient", "phone", delivered = true),
                receipt("recipient", "desktop"),
            ),
        )

        assertEquals(MessageStates.DELIVERED, statuses.single().state)
        assertEquals(MessageStates.DELIVERED, MessageStatusReducer.aggregate(statuses))
    }

    @Test
    fun groupAggregateWaitsForEveryParticipant() {
        val statuses = MessageStatusReducer.perParticipant(
            participantUserIds = listOf("sender", "one", "two"),
            senderUserId = "sender",
            receipts = listOf(
                receipt("one", "phone", delivered = true, seen = true),
                receipt("two", "phone"),
            ),
        )

        assertEquals(MessageStates.SENT, MessageStatusReducer.aggregate(statuses))
    }

    @Test
    fun groupSeenRequiresEveryParticipantToSeeMessage() {
        val statuses = MessageStatusReducer.perParticipant(
            participantUserIds = listOf("sender", "one", "two"),
            senderUserId = "sender",
            receipts = listOf(
                receipt("one", "phone", delivered = true, seen = true),
                receipt("two", "phone", delivered = true, seen = true),
            ),
        )

        assertEquals(MessageStates.SEEN, MessageStatusReducer.aggregate(statuses))
    }

    private fun receipt(
        userId: String,
        deviceId: String,
        delivered: Boolean = false,
        seen: Boolean = false,
    ) = ReceiptDto(
        recipientUserId = userId,
        recipientDeviceId = deviceId,
        deliveredAt = if (delivered || seen) "2026-07-29T12:00:00Z" else null,
        seenAt = if (seen) "2026-07-29T12:01:00Z" else null,
    )
}
