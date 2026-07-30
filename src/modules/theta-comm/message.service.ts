import {
  EncryptedChatMessageKind,
  EncryptedChatParticipantRole,
  EncryptedChatThreadType,
  EncryptedChatUploadStatus,
  Prisma,
  ThetaCommSyncEventKind
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { consumeRateLimit } from "@/lib/platform/rate-limit";
import { hasBlockedRelationshipWithin } from "@/modules/chat-messages/chat-access-policy";
import { assertChatMessageWriteAllowed } from "@/modules/chat-messages/chat-retention";
import {
  acknowledgeThetaCommMessageSchema,
  sendThetaCommMessageSchema,
  thetaCommSyncQuerySchema,
  thetaCommTypingSchema,
  THETA_COMM_DELETE_WINDOW_MS,
  THETA_COMM_EDIT_WINDOW_MS,
  THETA_COMM_TYPING_TTL_MS
} from "@/modules/theta-comm/types";
import {
  canAdministerConversation,
  clampClientDate,
  createSyncEvents,
  ThetaCommError,
  validateCompleteRecipientSet
} from "@/modules/theta-comm/theta-comm.shared";

function serializeCreatedMessage(message: {
  id: string;
  clientMessageId: string;
  threadId: string;
  senderUserId: string;
  senderDeviceId: string;
  sequence: bigint;
  kind: EncryptedChatMessageKind;
  protocolVersion: number;
  membershipVersion: number;
  replyToMessageId: string | null;
  eventTargetMessageId: string | null;
  createdAt: Date;
}) {
  return {
    id: message.id,
    clientMessageId: message.clientMessageId,
    conversationId: message.threadId,
    senderUserId: message.senderUserId,
    senderDeviceId: message.senderDeviceId,
    sequence: message.sequence.toString(),
    kind: message.kind,
    protocolVersion: message.protocolVersion,
    membershipVersion: message.membershipVersion,
    replyToMessageId: message.replyToMessageId,
    eventTargetMessageId: message.eventTargetMessageId,
    createdAt: message.createdAt.toISOString()
  };
}

async function loadIdempotentMessage(senderDeviceId: string, clientMessageId: string) {
  return prisma.encryptedChatMessage.findUnique({
    where: {
      senderDeviceId_clientMessageId: { senderDeviceId, clientMessageId }
    }
  });
}

export async function sendThetaCommMessage(userId: string, input: unknown) {
  const parsed = sendThetaCommMessageSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThetaCommError(400, "INVALID_MESSAGE", parsed.error.issues[0]?.message ?? "Invalid encrypted message.");
  }
  const data = parsed.data;
  const replay = await loadIdempotentMessage(data.senderDeviceId, data.clientMessageId);
  if (replay) {
    if (replay.senderUserId !== userId || replay.threadId !== data.conversationId) {
      throw new ThetaCommError(409, "IDEMPOTENCY_CONFLICT", "That client message ID was already used.");
    }
    return { message: serializeCreatedMessage(replay), replayed: true };
  }
  const sendRate = await consumeRateLimit({
    namespace: "theta-comm-message-send",
    key: userId,
    limit: 120,
    windowMs: 60 * 1000
  });
  if (!sendRate.allowed) {
    throw new ThetaCommError(
      429,
      "MESSAGE_RATE_LIMIT",
      "Too many messages were sent at once. Try again shortly."
    );
  }

  try {
    const message = await prisma.$transaction(
      async (tx) => {
        const [senderDevice, conversation] = await Promise.all([
          tx.userDevice.findFirst({
            where: {
              id: data.senderDeviceId,
              userId,
              revokedAt: null,
              commIdentityKey: { not: null }
            }
          }),
          tx.encryptedChatThread.findFirst({
            where: {
              id: data.conversationId,
              participants: { some: { userId, leftAt: null, removedAt: null } }
            },
            include: { participants: true }
          })
        ]);
        if (!senderDevice) {
          throw new ThetaCommError(400, "DEVICE_NOT_REGISTERED", "Sender device is not registered.");
        }
        if (!conversation) {
          throw new ThetaCommError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
        }
        if (conversation.membershipVersion !== data.membershipVersion) {
          throw new ThetaCommError(
            409,
            "MEMBERSHIP_CHANGED",
            "Chat membership changed. Refresh encryption keys and retry."
          );
        }
        const activeParticipants = conversation.participants.filter(
          (participant) => !participant.leftAt && !participant.removedAt
        );
        const participantUserIds = activeParticipants.map((participant) => participant.userId);
        if (await hasBlockedRelationshipWithin(participantUserIds)) {
          throw new ThetaCommError(403, "BLOCKED", "This conversation is unavailable.");
        }
        await validateCompleteRecipientSet(tx, participantUserIds, data.envelopes, [senderDevice.id]);
        const allowed = await assertChatMessageWriteAllowed(tx, {
          threadKind: "ENCRYPTED",
          threadId: conversation.id,
          senderUserId: userId
        });
        if (!allowed) throw new ThetaCommError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");

        let targetMessage:
          | {
              id: string;
              senderUserId: string;
              createdAt: Date;
              deletedAt: Date | null;
            }
          | null = null;
        if (data.replyToMessageId) {
          const replyTarget = await tx.encryptedChatMessage.findFirst({
            where: { id: data.replyToMessageId, threadId: conversation.id, deletedAt: null },
            select: { id: true }
          });
          if (!replyTarget) throw new ThetaCommError(404, "MESSAGE_NOT_FOUND", "Reply target was not found.");
        }
        if (data.eventTargetMessageId) {
          targetMessage = await tx.encryptedChatMessage.findFirst({
            where: { id: data.eventTargetMessageId, threadId: conversation.id },
            select: { id: true, senderUserId: true, createdAt: true, deletedAt: true }
          });
          if (!targetMessage) throw new ThetaCommError(404, "MESSAGE_NOT_FOUND", "Target message was not found.");
        }

        if (
          (data.kind === EncryptedChatMessageKind.REACTION ||
            data.kind === EncryptedChatMessageKind.EDIT ||
            data.kind === EncryptedChatMessageKind.DELETE) &&
          !targetMessage
        ) {
          throw new ThetaCommError(400, "TARGET_REQUIRED", "This message event requires a target message.");
        }
        const actor = activeParticipants.find((participant) => participant.userId === userId);
        if (data.kind === EncryptedChatMessageKind.EDIT && targetMessage) {
          if (
            targetMessage.senderUserId !== userId ||
            targetMessage.deletedAt ||
            Date.now() - targetMessage.createdAt.getTime() > THETA_COMM_EDIT_WINDOW_MS
          ) {
            throw new ThetaCommError(403, "EDIT_WINDOW_CLOSED", "Messages may be edited for 15 minutes.");
          }
        }
        if (data.kind === EncryptedChatMessageKind.DELETE && targetMessage) {
          const isModerator =
            conversation.type === EncryptedChatThreadType.GROUP &&
            actor &&
            canAdministerConversation(actor.role);
          if (
            (!isModerator && targetMessage.senderUserId !== userId) ||
            Date.now() - targetMessage.createdAt.getTime() > THETA_COMM_DELETE_WINDOW_MS
          ) {
            throw new ThetaCommError(403, "DELETE_WINDOW_CLOSED", "Delete for everyone is available for 48 hours.");
          }
        }
        if (data.kind === EncryptedChatMessageKind.SYSTEM) {
          if (
            conversation.type !== EncryptedChatThreadType.GROUP ||
            !actor ||
            !canAdministerConversation(actor.role)
          ) {
            throw new ThetaCommError(403, "NOT_ALLOWED", "Only chat group administrators can send system events.");
          }
        }

        const uploadIds = [...new Set(data.attachmentUploadIds)];
        const uploads = uploadIds.length
          ? await tx.encryptedChatUpload.findMany({
              where: {
                id: { in: uploadIds },
                ownerUserId: userId,
                ownerDeviceId: senderDevice.id,
                status: EncryptedChatUploadStatus.UPLOADED,
                OR: [{ threadId: null }, { threadId: conversation.id }]
              }
            })
          : [];
        if (uploads.length !== uploadIds.length) {
          throw new ThetaCommError(400, "UPLOAD_NOT_READY", "One or more encrypted attachments are not ready.");
        }

        const created = await tx.encryptedChatMessage.create({
          data: {
            clientMessageId: data.clientMessageId,
            threadId: conversation.id,
            senderUserId: userId,
            senderDeviceId: senderDevice.id,
            kind: data.kind,
            protocolVersion: data.protocolVersion,
            membershipVersion: data.membershipVersion,
            replyToMessageId: data.replyToMessageId,
            eventTargetMessageId: data.eventTargetMessageId,
            clientCreatedAt: clampClientDate(data.clientCreatedAt),
            envelopes: {
              create: data.envelopes.map((envelope) => ({
                recipientUserId: envelope.recipientUserId,
                recipientDeviceId: envelope.recipientDeviceId,
                envelopeType: envelope.envelopeType,
                ciphertext: envelope.ciphertext
              }))
            },
            attachments: {
              create: uploads.map((upload) => ({
                uploadId: upload.id,
                storageKey: upload.storageKey,
                thumbnailStorageKey: upload.thumbnailStorageKey,
                encryptedSizeBytes: upload.expectedSizeBytes,
                chunkCount: upload.totalChunks
              }))
            }
          }
        });

        if (uploads.length > 0) {
          await tx.encryptedChatUpload.updateMany({
            where: { id: { in: uploads.map((upload) => upload.id) } },
            data: { status: EncryptedChatUploadStatus.ATTACHED, threadId: conversation.id }
          });
        }
        if (data.kind === EncryptedChatMessageKind.EDIT && targetMessage) {
          await tx.encryptedChatMessage.update({
            where: { id: targetMessage.id },
            data: { editedAt: created.createdAt }
          });
        } else if (data.kind === EncryptedChatMessageKind.DELETE && targetMessage) {
          await tx.encryptedChatMessage.update({
            where: { id: targetMessage.id },
            data: { deletedAt: created.createdAt }
          });
        }

        await tx.encryptedChatThread.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: created.createdAt,
            nextSequence: created.sequence
          }
        });
        await tx.userDevice.update({
          where: { id: senderDevice.id },
          data: { lastSeenAt: new Date() }
        });
        await createSyncEvents(tx, {
          userIds: participantUserIds,
          kind: ThetaCommSyncEventKind.MESSAGE,
          conversationId: conversation.id,
          messageId: created.id
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    return { message: serializeCreatedMessage(message), replayed: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await loadIdempotentMessage(data.senderDeviceId, data.clientMessageId);
      if (raced && raced.senderUserId === userId && raced.threadId === data.conversationId) {
        return { message: serializeCreatedMessage(raced), replayed: true };
      }
    }
    throw error;
  }
}

export async function acknowledgeThetaCommMessage(userId: string, input: unknown) {
  const parsed = acknowledgeThetaCommMessageSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThetaCommError(400, "INVALID_RECEIPT", parsed.error.issues[0]?.message ?? "Invalid receipt.");
  }
  const data = parsed.data;
  return prisma.$transaction(async (tx) => {
    const envelope = await tx.encryptedChatEnvelope.findFirst({
      where: {
        messageId: data.messageId,
        recipientUserId: userId,
        recipientDeviceId: data.recipientDeviceId,
        message: { threadId: data.conversationId }
      },
      include: { message: true }
    });
    if (!envelope) throw new ThetaCommError(404, "MESSAGE_NOT_FOUND", "Encrypted message was not found.");
    const now = new Date();
    const updated = await tx.encryptedChatEnvelope.update({
      where: { id: envelope.id },
      data:
        data.status === "SEEN"
          ? {
              deliveredAt: envelope.deliveredAt ?? now,
              readAt: envelope.readAt ?? now
            }
          : {
              deliveredAt: envelope.deliveredAt ?? now
            }
    });
    if (data.status === "SEEN") {
      await tx.$executeRaw`
        UPDATE "EncryptedChatParticipant"
        SET "lastReadSequence" = GREATEST("lastReadSequence", ${envelope.message.sequence}),
            "updatedAt" = NOW()
        WHERE "threadId" = ${data.conversationId}
          AND "userId" = ${userId}
          AND "leftAt" IS NULL
          AND "removedAt" IS NULL
      `;
    }
    await createSyncEvents(tx, {
      userIds: [envelope.message.senderUserId, userId],
      kind: ThetaCommSyncEventKind.RECEIPT,
      conversationId: data.conversationId,
      messageId: data.messageId,
      payload: { status: data.status, recipientDeviceId: data.recipientDeviceId }
    });
    return {
      ok: true as const,
      deliveredAt: updated.deliveredAt?.toISOString() ?? null,
      seenAt: updated.readAt?.toISOString() ?? null
    };
  });
}

export async function setThetaCommTyping(userId: string, input: unknown) {
  const parsed = thetaCommTypingSchema.safeParse(input);
  if (!parsed.success) throw new ThetaCommError(400, "INVALID_TYPING", "Invalid typing state.");
  const data = parsed.data;
  const [device, participant] = await Promise.all([
    prisma.userDevice.findFirst({
      where: { id: data.senderDeviceId, userId, revokedAt: null },
      select: { id: true }
    }),
    prisma.encryptedChatParticipant.findFirst({
      where: {
        threadId: data.conversationId,
        userId,
        leftAt: null,
        removedAt: null
      },
      select: { id: true }
    })
  ]);
  if (!device || !participant) throw new ThetaCommError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");

  if (!data.typing) {
    await prisma.thetaCommTypingState.deleteMany({
      where: { conversationId: data.conversationId, userId, deviceId: device.id }
    });
  } else {
    await prisma.thetaCommTypingState.upsert({
      where: {
        conversationId_userId_deviceId: {
          conversationId: data.conversationId,
          userId,
          deviceId: device.id
        }
      },
      update: { expiresAt: new Date(Date.now() + THETA_COMM_TYPING_TTL_MS) },
      create: {
        conversationId: data.conversationId,
        userId,
        deviceId: device.id,
        expiresAt: new Date(Date.now() + THETA_COMM_TYPING_TTL_MS)
      }
    });
  }
  return { ok: true as const, expiresInMs: data.typing ? THETA_COMM_TYPING_TTL_MS : 0 };
}

export async function syncThetaComm(
  userId: string,
  deviceId: string,
  query: Record<string, string | undefined>
) {
  const parsed = thetaCommSyncQuerySchema.safeParse(query);
  if (!parsed.success) throw new ThetaCommError(400, "INVALID_CURSOR", "Invalid sync cursor.");
  const cursorText = parsed.data.cursor ?? "0";
  if (!/^\d+$/.test(cursorText)) throw new ThetaCommError(400, "INVALID_CURSOR", "Invalid sync cursor.");
  const cursor = BigInt(cursorText);
  const device = await prisma.userDevice.findFirst({
    where: { id: deviceId, userId, revokedAt: null, commIdentityKey: { not: null } },
    select: { id: true, createdAt: true, commKeyUpdatedAt: true }
  });
  if (!device) throw new ThetaCommError(400, "DEVICE_NOT_REGISTERED", "This Theta-Comm device is not registered.");
  const historyStart = device.commKeyUpdatedAt ?? device.createdAt;

  const events = await prisma.thetaCommSyncEvent.findMany({
    where: {
      userId,
      id: { gt: cursor },
      ...(cursor === BigInt(0) ? { createdAt: { gte: historyStart } } : {})
    },
    orderBy: { id: "asc" },
    take: parsed.data.limit + 1
  });
  const hasMore = events.length > parsed.data.limit;
  const page = events.slice(0, parsed.data.limit);
  const nextCursor = page.at(-1)?.id ?? cursor;

  const conversations = await prisma.encryptedChatThread.findMany({
    where: {
      participants: { some: { userId, leftAt: null, removedAt: null } }
    },
    include: {
      participants: {
        include: {
          user: { include: { profile: true } }
        },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 200
  });
  const conversationIds = conversations.map((conversation) => conversation.id);

  const initial = cursor === BigInt(0);
  const eventMessageIds = page.map((event) => event.messageId).filter((id): id is string => Boolean(id));
  const initialInbound = initial
    ? await prisma.encryptedChatEnvelope.findMany({
        where: {
          recipientDeviceId: device.id,
          message: { createdAt: { gte: historyStart } }
        },
        orderBy: { message: { sequence: "desc" } },
        take: 100,
        select: { messageId: true }
      })
    : [];
  const initialOutbound = initial
    ? await prisma.encryptedChatMessage.findMany({
        where: {
          senderUserId: userId,
          protocolVersion: { gte: 2 },
          createdAt: { gte: historyStart }
        },
        orderBy: { sequence: "desc" },
        take: 100,
        select: { id: true }
      })
    : [];
  const messageIds = [
    ...new Set([
      ...eventMessageIds,
      ...initialInbound.map((envelope) => envelope.messageId),
      ...initialOutbound.map((message) => message.id)
    ])
  ];

  const messages = messageIds.length
    ? await prisma.encryptedChatMessage.findMany({
        where: {
          id: { in: messageIds },
          threadId: { in: conversationIds },
          createdAt: { gte: historyStart },
          OR: [
            { senderUserId: userId },
            { envelopes: { some: { recipientDeviceId: device.id } } }
          ]
        },
        include: {
          envelopes: {
            where: { recipientDeviceId: device.id }
          },
          attachments: { select: { id: true } }
        },
        orderBy: { sequence: "asc" }
      })
    : [];
  const outgoingIds = messages.filter((message) => message.senderUserId === userId).map((message) => message.id);
  const outgoingReceipts = outgoingIds.length
    ? await prisma.encryptedChatEnvelope.findMany({
        where: { messageId: { in: outgoingIds } },
        select: {
          messageId: true,
          recipientUserId: true,
          recipientDeviceId: true,
          deliveredAt: true,
          readAt: true
        }
      })
    : [];
  const receiptsByMessage = new Map<string, typeof outgoingReceipts>();
  for (const receipt of outgoingReceipts) {
    const current = receiptsByMessage.get(receipt.messageId) ?? [];
    current.push(receipt);
    receiptsByMessage.set(receipt.messageId, current);
  }

  const unreadRows = await prisma.encryptedChatEnvelope.findMany({
    where: {
      recipientDeviceId: device.id,
      readAt: null,
      message: {
        threadId: { in: conversationIds },
        senderUserId: { not: userId },
        createdAt: { gte: historyStart }
      }
    },
    select: { message: { select: { threadId: true } } }
  });
  const unreadByConversation = new Map<string, number>();
  for (const row of unreadRows) {
    unreadByConversation.set(
      row.message.threadId,
      (unreadByConversation.get(row.message.threadId) ?? 0) + 1
    );
  }

  const typingStates = await prisma.thetaCommTypingState.findMany({
    where: {
      conversationId: { in: conversationIds },
      userId: { not: userId },
      expiresAt: { gt: new Date() }
    },
    select: { conversationId: true, userId: true, expiresAt: true }
  });
  await prisma.userDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

  return {
    cursor: nextCursor.toString(),
    hasMore,
    conversations: conversations.map((conversation) => {
      const current = conversation.participants.find((participant) => participant.userId === userId);
      return {
        id: conversation.id,
        type: conversation.type,
        titleCiphertext: conversation.titleCiphertext,
        hasEncryptedAvatar: Boolean(conversation.avatarStorageKey),
        membershipVersion: conversation.membershipVersion,
        lastSequence: conversation.nextSequence.toString(),
        lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
        unreadCount: unreadByConversation.get(conversation.id) ?? 0,
        preferences: {
          archived: Boolean(current?.archivedAt),
          pinned: Boolean(current?.pinnedAt),
          mutedUntil: current?.mutedUntil?.toISOString() ?? null,
          notificationLevel: current?.notificationLevel ?? "ALL"
        },
        participants: conversation.participants.map((participant) => ({
          userId: participant.userId,
          username: participant.user.username,
          displayName: participant.user.profile?.displayName ?? participant.user.username,
          avatarUrl: participant.user.profile?.avatarUrl ?? null,
          role: participant.role,
          joinedAt: participant.createdAt.toISOString(),
          leftAt: participant.leftAt?.toISOString() ?? null,
          removedAt: participant.removedAt?.toISOString() ?? null
        }))
      };
    }),
    messages: messages.map((message) => {
      const envelope = message.envelopes[0];
      return {
        id: message.id,
        clientMessageId: message.clientMessageId,
        conversationId: message.threadId,
        senderUserId: message.senderUserId,
        senderDeviceId: message.senderDeviceId,
        sequence: message.sequence.toString(),
        kind: message.kind,
        protocolVersion: message.protocolVersion,
        membershipVersion: message.membershipVersion,
        replyToMessageId: message.replyToMessageId,
        eventTargetMessageId: message.eventTargetMessageId,
        ciphertext: envelope?.ciphertext ?? null,
        envelopeId: envelope?.id ?? null,
        envelopeType: envelope?.envelopeType ?? null,
        createdAt: message.createdAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
        deletedAt: message.deletedAt?.toISOString() ?? null,
        attachmentIds: message.attachments.map((attachment) => attachment.id),
        receipts: (receiptsByMessage.get(message.id) ?? []).map((receipt) => ({
          recipientUserId: receipt.recipientUserId,
          recipientDeviceId: receipt.recipientDeviceId,
          deliveredAt: receipt.deliveredAt?.toISOString() ?? null,
          seenAt: receipt.readAt?.toISOString() ?? null
        }))
      };
    }),
    typing: typingStates.map((state) => ({
      conversationId: state.conversationId,
      userId: state.userId,
      expiresAt: state.expiresAt.toISOString()
    })),
    events: page.map((event) => ({
      id: event.id.toString(),
      kind: event.kind,
      conversationId: event.conversationId,
      messageId: event.messageId,
      payload: event.payload
    })),
    revokedDeviceIds: page
      .filter((event) => event.kind === ThetaCommSyncEventKind.DEVICE_REVOKED)
      .map((event) => {
        const payload = event.payload as { deviceId?: unknown } | null;
        return typeof payload?.deviceId === "string" ? payload.deviceId : null;
      })
      .filter((id): id is string => Boolean(id))
  };
}
