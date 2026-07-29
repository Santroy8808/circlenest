package net.thetaspace.communications.data

import net.thetaspace.communications.data.local.MessageStates
import net.thetaspace.communications.data.remote.ReceiptDto

data class ParticipantMessageStatus(
    val userId: String,
    val state: String,
    val devices: List<DeviceMessageStatus>,
)

data class DeviceMessageStatus(
    val deviceId: String,
    val state: String,
)

object MessageStatusReducer {
    fun perParticipant(
        participantUserIds: Collection<String>,
        senderUserId: String,
        receipts: Collection<ReceiptDto>,
    ): List<ParticipantMessageStatus> =
        participantUserIds
            .asSequence()
            .filterNot { it == senderUserId }
            .distinct()
            .map { userId ->
                val deviceStates = receipts
                    .filter { it.recipientUserId == userId }
                    .map {
                        DeviceMessageStatus(
                            deviceId = it.recipientDeviceId,
                            state = when {
                                it.seenAt != null -> MessageStates.SEEN
                                it.deliveredAt != null -> MessageStates.DELIVERED
                                else -> MessageStates.SENT
                            },
                        )
                    }
                ParticipantMessageStatus(
                    userId = userId,
                    state = when {
                        deviceStates.any { it.state == MessageStates.SEEN } -> MessageStates.SEEN
                        deviceStates.any { it.state == MessageStates.DELIVERED } -> MessageStates.DELIVERED
                        else -> MessageStates.SENT
                    },
                    devices = deviceStates,
                )
            }
            .toList()

    fun aggregate(participants: Collection<ParticipantMessageStatus>): String {
        if (participants.isEmpty()) return MessageStates.SENT
        if (participants.all { it.state == MessageStates.SEEN }) return MessageStates.SEEN
        if (participants.all {
                it.state == MessageStates.DELIVERED || it.state == MessageStates.SEEN
            }
        ) {
            return MessageStates.DELIVERED
        }
        return MessageStates.SENT
    }
}
