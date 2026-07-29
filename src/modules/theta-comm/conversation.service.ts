import {
  EncryptedChatMessageKind,
  EncryptedChatParticipantRole,
  EncryptedChatThreadType,
  EncryptedChatUploadStatus,
  Prisma,
  ThetaCommSyncEventKind
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import {
  hasBlockedRelationshipWithin,
  resolveChatAccessContext
} from "@/modules/chat-messages/chat-access-policy";
import { resolveChatRetentionClassForWrite } from "@/modules/chat-messages/chat-retention";
import {
  createThetaCommConversationSchema,
  thetaCommGroupCommandSchema,
  updateThetaCommConversationPreferenceSchema,
  THETA_COMM_MAX_PARTICIPANTS
} from "@/modules/theta-comm/types";
import {
  canAdministerConversation,
  clampClientDate,
  createSyncEvents,
  directConversationKey,
  enqueuePushWakeups,
  ThetaCommError,
  validateCompleteRecipientSet
} from "@/modules/theta-comm/theta-comm.shared";

const conversationInclude = Prisma.validator<Prisma.EncryptedChatThreadInclude>()({
  participants: {
    include: {
      user: {
        include: { profile: true }
      }
    },
    orderBy: { createdAt: "asc" }
  }
});

function serializeConversation(
  conversation: Prisma.EncryptedChatThreadGetPayload<{ include: typeof conversationInclude }>,
  currentUserId: string
) {
  const current = conversation.participants.find((participant) => participant.userId === currentUserId);
  return {
    id: conversation.id,
    type: conversation.type,
    titleCiphertext: conversation.titleCiphertext,
    hasEncryptedAvatar: Boolean(conversation.avatarStorageKey),
    membershipVersion: conversation.membershipVersion,
    lastSequence: conversation.nextSequence.toString(),
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
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
}

export async function createThetaCommConversation(userId: string, input: unknown) {
  const parsed = createThetaCommConversationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThetaCommError(
      400,
      "INVALID_CONVERSATION",
      parsed.error.issues[0]?.message ?? "Invalid Theta-Comm conversation."
    );
  }
  const data = parsed.data;
  const context = await resolveChatAccessContext(userId);
  if (!context.userId) throw new ThetaCommError(401, "LOGIN_REQUIRED", "Login required.");

  if (data.type === EncryptedChatThreadType.DIRECT) {
    if (data.targetUserId === userId) {
      throw new ThetaCommError(400, "INVALID_PARTICIPANT", "Choose another member.");
    }
    const target = await prisma.user.findFirst({
      where: { AND: [{ id: data.targetUserId }, context.visibleUserWhere] },
      select: { id: true }
    });
    if (!target) throw new ThetaCommError(404, "MEMBER_NOT_FOUND", "That member is unavailable.");
    const participantUserIds = [userId, target.id];
    if (await hasBlockedRelationshipWithin(participantUserIds)) {
      throw new ThetaCommError(403, "BLOCKED", "This conversation is unavailable.");
    }
    const directKey = directConversationKey(participantUserIds);
    const existing = await prisma.encryptedChatThread.findUnique({
      where: { directKey },
      include: conversationInclude
    });
    if (existing) return { conversation: serializeConversation(existing, userId), created: false };

    try {
      const created = await prisma.$transaction(async (tx) => {
        const retentionClass = await resolveChatRetentionClassForWrite(tx, participantUserIds);
        const conversation = await tx.encryptedChatThread.create({
          data: {
            type: EncryptedChatThreadType.DIRECT,
            directKey,
            createdByUserId: userId,
            retentionClass,
            participants: {
              create: participantUserIds.map((participantUserId) => ({
                userId: participantUserId,
                role: EncryptedChatParticipantRole.MEMBER
              }))
            }
          },
          include: conversationInclude
        });
        await createSyncEvents(tx, {
          userIds: participantUserIds,
          kind: ThetaCommSyncEventKind.CONVERSATION,
          conversationId: conversation.id
        });
        await enqueuePushWakeups(tx, {
          userIds: participantUserIds.filter((participantUserId) => participantUserId !== userId),
          conversationId: conversation.id,
          reason: "membership"
        });
        return conversation;
      });
      return { conversation: serializeConversation(created, userId), created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await prisma.encryptedChatThread.findUnique({
          where: { directKey },
          include: conversationInclude
        });
        if (raced) return { conversation: serializeConversation(raced, userId), created: false };
      }
      throw error;
    }
  }

  const participantUserIds = [...new Set([userId, ...data.participantUserIds])];
  if (participantUserIds.length < 3 || participantUserIds.length > THETA_COMM_MAX_PARTICIPANTS) {
    throw new ThetaCommError(
      400,
      "INVALID_PARTICIPANTS",
      `Chat groups require at least 3 and at most ${THETA_COMM_MAX_PARTICIPANTS} members.`
    );
  }
  const users = await prisma.user.findMany({
    where: {
      id: { in: participantUserIds },
      deactivatedAt: null
    },
    select: { id: true }
  });
  if (
    users.length !== participantUserIds.length ||
    users.some((member) => member.id !== userId && context.blockedUserIds.includes(member.id)) ||
    (await hasBlockedRelationshipWithin(participantUserIds))
  ) {
    throw new ThetaCommError(404, "MEMBER_NOT_FOUND", "One or more group members are unavailable.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const senderDevice = await tx.userDevice.findFirst({
      where: { id: data.senderDeviceId, userId, revokedAt: null, commIdentityKey: { not: null } }
    });
    if (!senderDevice) throw new ThetaCommError(400, "DEVICE_NOT_REGISTERED", "Sender device is not registered.");
    await validateCompleteRecipientSet(tx, participantUserIds, data.metadataEnvelopes);
    const retentionClass = await resolveChatRetentionClassForWrite(tx, participantUserIds);
    const conversation = await tx.encryptedChatThread.create({
      data: {
        type: EncryptedChatThreadType.GROUP,
        titleCiphertext: data.titleCiphertext,
        createdByUserId: userId,
        retentionClass,
        participants: {
          create: participantUserIds.map((participantUserId) => ({
            userId: participantUserId,
            role:
              participantUserId === userId
                ? EncryptedChatParticipantRole.OWNER
                : EncryptedChatParticipantRole.MEMBER
          }))
        }
      },
      include: conversationInclude
    });
    const systemMessage = await tx.encryptedChatMessage.create({
      data: {
        clientMessageId: data.clientMessageId,
        threadId: conversation.id,
        senderUserId: userId,
        senderDeviceId: senderDevice.id,
        kind: EncryptedChatMessageKind.SYSTEM,
        membershipVersion: conversation.membershipVersion,
        clientCreatedAt: clampClientDate(data.clientCreatedAt),
        envelopes: {
          create: data.metadataEnvelopes.map((envelope) => ({
            recipientUserId: envelope.recipientUserId,
            recipientDeviceId: envelope.recipientDeviceId,
            envelopeType: envelope.envelopeType,
            ciphertext: envelope.ciphertext
          }))
        }
      }
    });
    await tx.encryptedChatThread.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: systemMessage.createdAt,
        nextSequence: systemMessage.sequence
      }
    });
    await createSyncEvents(tx, {
      userIds: participantUserIds,
      kind: ThetaCommSyncEventKind.CONVERSATION,
      conversationId: conversation.id,
      messageId: systemMessage.id
    });
    await enqueuePushWakeups(tx, {
      userIds: participantUserIds.filter((participantUserId) => participantUserId !== userId),
      excludeDeviceIds: [senderDevice.id],
      conversationId: conversation.id,
      reason: "membership"
    });
    return tx.encryptedChatThread.findUniqueOrThrow({
      where: { id: conversation.id },
      include: conversationInclude
    });
  });

  return { conversation: serializeConversation(created, userId), created: true };
}

export async function updateThetaCommConversationPreference(
  userId: string,
  conversationId: string,
  input: unknown
) {
  const parsed = updateThetaCommConversationPreferenceSchema.safeParse(input);
  if (!parsed.success) throw new ThetaCommError(400, "INVALID_PREFERENCE", "Invalid conversation preference.");
  const data = parsed.data;
  const participant = await prisma.encryptedChatParticipant.findFirst({
    where: { threadId: conversationId, userId, leftAt: null, removedAt: null }
  });
  if (!participant) throw new ThetaCommError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");

  const updated = await prisma.encryptedChatParticipant.update({
    where: { threadId_userId: { threadId: conversationId, userId } },
    data: {
      archivedAt: data.archived === undefined ? undefined : data.archived ? new Date() : null,
      pinnedAt: data.pinned === undefined ? undefined : data.pinned ? new Date() : null,
      mutedUntil:
        data.mutedUntil === undefined ? undefined : data.mutedUntil === null ? null : new Date(data.mutedUntil),
      notificationLevel: data.notificationLevel
    }
  });
  return {
    ok: true as const,
    preferences: {
      archived: Boolean(updated.archivedAt),
      pinned: Boolean(updated.pinnedAt),
      mutedUntil: updated.mutedUntil?.toISOString() ?? null,
      notificationLevel: updated.notificationLevel
    }
  };
}

export async function updateThetaCommGroup(
  userId: string,
  conversationId: string,
  input: unknown
) {
  const parsed = thetaCommGroupCommandSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThetaCommError(400, "INVALID_GROUP_COMMAND", parsed.error.issues[0]?.message ?? "Invalid group change.");
  }
  const command = parsed.data;

  return prisma.$transaction(async (tx) => {
    const conversation = await tx.encryptedChatThread.findFirst({
      where: {
        id: conversationId,
        type: EncryptedChatThreadType.GROUP,
        participants: { some: { userId, leftAt: null, removedAt: null } }
      },
      include: { participants: true }
    });
    if (!conversation) throw new ThetaCommError(404, "CONVERSATION_NOT_FOUND", "Chat group not found.");
    const actor = conversation.participants.find((participant) => participant.userId === userId);
    if (!actor) throw new ThetaCommError(403, "NOT_ALLOWED", "You are not an active chat group member.");
    let membershipChanged = false;
    const affectedUserIds = new Set(conversation.participants.filter((member) => !member.leftAt && !member.removedAt).map((member) => member.userId));

    if (command.action === "ADD_MEMBERS") {
      if (!canAdministerConversation(actor.role)) {
        throw new ThetaCommError(403, "NOT_ALLOWED", "Only chat group administrators can add members.");
      }
      const newUserIds = [...new Set(command.userIds)].filter((candidate) => !affectedUserIds.has(candidate));
      if (affectedUserIds.size + newUserIds.length > THETA_COMM_MAX_PARTICIPANTS) {
        throw new ThetaCommError(400, "GROUP_LIMIT", `Chat groups support at most ${THETA_COMM_MAX_PARTICIPANTS} members.`);
      }
      const users = await tx.user.findMany({
        where: { id: { in: newUserIds }, deactivatedAt: null },
        select: { id: true }
      });
      if (users.length !== newUserIds.length || (await hasBlockedRelationshipWithin([...affectedUserIds, ...newUserIds]))) {
        throw new ThetaCommError(404, "MEMBER_NOT_FOUND", "One or more members are unavailable.");
      }
      for (const newUserId of newUserIds) {
        await tx.encryptedChatParticipant.upsert({
          where: { threadId_userId: { threadId: conversation.id, userId: newUserId } },
          update: {
            role: EncryptedChatParticipantRole.MEMBER,
            leftAt: null,
            removedAt: null,
            removedByUserId: null,
            archivedAt: null
          },
          create: {
            threadId: conversation.id,
            userId: newUserId,
            role: EncryptedChatParticipantRole.MEMBER
          }
        });
        affectedUserIds.add(newUserId);
      }
      membershipChanged = newUserIds.length > 0;
    } else if (command.action === "REMOVE_MEMBER") {
      if (!canAdministerConversation(actor.role)) {
        throw new ThetaCommError(403, "NOT_ALLOWED", "Only chat group administrators can remove members.");
      }
      const target = conversation.participants.find(
        (participant) => participant.userId === command.userId && !participant.leftAt && !participant.removedAt
      );
      if (!target) throw new ThetaCommError(404, "MEMBER_NOT_FOUND", "That member is not active in this chat group.");
      if (
        target.role === EncryptedChatParticipantRole.OWNER ||
        (actor.role !== EncryptedChatParticipantRole.OWNER &&
          target.role === EncryptedChatParticipantRole.ADMIN)
      ) {
        throw new ThetaCommError(403, "NOT_ALLOWED", "Only the owner can manage chat group administrators.");
      }
      await tx.encryptedChatParticipant.update({
        where: { id: target.id },
        data: { removedAt: new Date(), removedByUserId: userId, pinnedAt: null }
      });
      membershipChanged = true;
      affectedUserIds.add(target.userId);
    } else if (command.action === "SET_ROLE") {
      if (actor.role !== EncryptedChatParticipantRole.OWNER) {
        throw new ThetaCommError(403, "NOT_ALLOWED", "Only the chat group owner can assign administrators.");
      }
      const target = conversation.participants.find(
        (participant) => participant.userId === command.userId && !participant.leftAt && !participant.removedAt
      );
      if (!target || target.role === EncryptedChatParticipantRole.OWNER) {
        throw new ThetaCommError(404, "MEMBER_NOT_FOUND", "That member cannot be changed.");
      }
      await tx.encryptedChatParticipant.update({
        where: { id: target.id },
        data: { role: command.role }
      });
      membershipChanged = target.role !== command.role;
    } else if (command.action === "LEAVE") {
      if (actor.role === EncryptedChatParticipantRole.OWNER && affectedUserIds.size > 1) {
        throw new ThetaCommError(409, "OWNER_TRANSFER_REQUIRED", "Assign another owner before leaving this chat group.");
      }
      await tx.encryptedChatParticipant.update({
        where: { id: actor.id },
        data: { leftAt: new Date(), pinnedAt: null }
      });
      membershipChanged = true;
    } else if (command.action === "RENAME") {
      if (!canAdministerConversation(actor.role)) {
        throw new ThetaCommError(403, "NOT_ALLOWED", "Only chat group administrators can rename this chat.");
      }
      await tx.encryptedChatThread.update({
        where: { id: conversation.id },
        data: { titleCiphertext: command.titleCiphertext }
      });
    } else if (command.action === "SET_AVATAR") {
      if (!canAdministerConversation(actor.role)) {
        throw new ThetaCommError(403, "NOT_ALLOWED", "Only chat group administrators can change the image.");
      }
      if (command.uploadId) {
        const upload = await tx.encryptedChatUpload.findFirst({
          where: {
            id: command.uploadId,
            ownerUserId: userId,
            status: EncryptedChatUploadStatus.UPLOADED,
            OR: [{ threadId: null }, { threadId: conversation.id }]
          }
        });
        if (!upload) throw new ThetaCommError(400, "UPLOAD_NOT_READY", "Encrypted group image upload is not ready.");
        await tx.encryptedChatThread.update({
          where: { id: conversation.id },
          data: { avatarStorageKey: upload.storageKey }
        });
        await tx.encryptedChatUpload.update({
          where: { id: upload.id },
          data: { status: EncryptedChatUploadStatus.ATTACHED, threadId: conversation.id }
        });
      } else {
        await tx.encryptedChatThread.update({
          where: { id: conversation.id },
          data: { avatarStorageKey: null }
        });
      }
    }

    const updated = membershipChanged
      ? await tx.encryptedChatThread.update({
          where: { id: conversation.id },
          data: { membershipVersion: { increment: 1 } }
        })
      : await tx.encryptedChatThread.findUniqueOrThrow({ where: { id: conversation.id } });
    await createSyncEvents(tx, {
      userIds: [...affectedUserIds],
      kind: membershipChanged ? ThetaCommSyncEventKind.MEMBERSHIP : ThetaCommSyncEventKind.CONVERSATION,
      conversationId: conversation.id,
      payload: { action: command.action, membershipVersion: updated.membershipVersion }
    });
    await enqueuePushWakeups(tx, {
      userIds: [...affectedUserIds],
      conversationId: conversation.id,
      reason: "membership"
    });
    return {
      ok: true as const,
      membershipVersion: updated.membershipVersion,
      systemMessageRequired: membershipChanged || command.action === "RENAME"
    };
  });
}
