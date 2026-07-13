import { constants, createPublicKey, publicEncrypt } from "crypto";
import {
  ChatAttachmentKind,
  ChatReplyStyle,
  ChatThreadType,
  FeedReactionType,
  MediaAssetStatus,
  MediaVisibility,
  ProfileVisibility,
  Prisma,
  SocialRelationshipType,
  UploadIntentPurpose
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  type ChatAccessContext,
  hasBlockedRelationshipWithin,
  resolveChatAccessContext,
  scopeChatThreadWhere,
  visibleChatMessageWhere,
  visibleChatParticipantWhere
} from "@/modules/chat-messages/chat-access-policy";
import {
  chatMessagePageSchema,
  completeChatUploadSchema,
  createChatUploadIntentSchema,
  createDirectChatThreadSchema,
  createGroupChatThreadSchema,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
  MAX_CHAT_MESSAGE_CHARACTERS,
  MAX_CHAT_TOTAL_ATTACHMENT_BYTES,
  reactToChatMessageSchema,
  sendChatMessageSchema,
  type ChatAttachmentView,
  type ChatMessageView,
  type ChatPersonView,
  type ChatThreadDetailView,
  type ChatThreadView
} from "@/modules/chat-messages/types";
import {
  completeUploadIntent,
  consumeVerifiedUploadIntent,
  createUploadIntent
} from "@/modules/media/upload-intent.service";

const MODULE_KEY = "chat-messages";
const CHAT_DB_TIMEOUT_MS = 2500;
const DESKTOP_BRIDGE_DEVICE_ID = "theta-space-desktop-bridge";

function chatAttachmentInclude() {
  return {
    include: {
      mediaAsset: true
    },
    orderBy: {
      createdAt: "asc" as const
    },
    take: MAX_CHAT_ATTACHMENTS_PER_MESSAGE
  };
}

function chatMessageInclude() {
  return {
    sender: {
      include: {
        profile: true
      }
    },
    attachments: chatAttachmentInclude(),
    replyTo: {
      include: {
        sender: {
          include: {
            profile: true
          }
        },
        attachments: {
          select: { id: true },
          take: 1
        }
      }
    },
    reactions: {
      select: {
        type: true,
        userId: true
      }
    }
  } as const;
}

function withChatDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), CHAT_DB_TIMEOUT_MS);
    })
  ]);
}

function attachmentKindForFile(fileName: string, mimeType: string) {
  return mimeType.toLowerCase().startsWith("image/") || /\.(avif|gif|jpe?g|png|webp|bmp|svg)$/i.test(fileName)
    ? ChatAttachmentKind.IMAGE
    : ChatAttachmentKind.FILE;
}

function mediaAssetUrl(mediaAsset?: { id: string } | null) {
  return mediaAsset ? `/api/media/assets/${mediaAsset.id}` : null;
}

function chatThreadHref(threadId: string) {
  return `/messages?thread=${threadId}`;
}

async function deleteHandledChatNotifications(client: Prisma.TransactionClient, userId: string, threadId: string) {
  await client.notification.deleteMany({
    where: {
      userId,
      href: chatThreadHref(threadId),
      title: {
        startsWith: "New chat from "
      }
    }
  });
}

function toPersonView(user: {
  id: string;
  username: string;
  profile: { displayName: string | null; avatarUrl: string | null; tagline: string | null } | null;
}): ChatPersonView {
  return {
    id: user.id,
    username: user.username,
    displayName: user.profile?.displayName ?? user.username,
    avatarUrl: user.profile?.avatarUrl,
    tagline: user.profile?.tagline
  };
}

function uniquePeopleById(people: ChatPersonView[]) {
  const seen = new Set<string>();
  return people.filter((person) => {
    if (seen.has(person.id)) return false;
    seen.add(person.id);
    return true;
  });
}

type ChatContactFilter = "ALL" | "FRIENDS" | "FAMILY" | "ACQUAINTANCE" | "MEMBERS";

const relationshipContactFilters: Record<Exclude<ChatContactFilter, "ALL" | "MEMBERS">, SocialRelationshipType> = {
  FRIENDS: SocialRelationshipType.FRIEND,
  FAMILY: SocialRelationshipType.FAMILY,
  ACQUAINTANCE: SocialRelationshipType.ACQUAINTANCE
};

function normalizedContactFilter(filter?: string | null): ChatContactFilter {
  if (filter === "FRIENDS" || filter === "FAMILY" || filter === "ACQUAINTANCE" || filter === "MEMBERS") return filter;
  return "ALL";
}

async function contactRelationshipUserIds(userId: string, types: SocialRelationshipType[]) {
  if (types.length === 0) return [];

  const relationships = await prisma.socialRelationship.findMany({
    where: {
      fromUserId: userId,
      type: { in: types }
    },
    select: {
      toUserId: true
    },
    orderBy: { createdAt: "desc" },
    take: 80
  });

  return Array.from(new Set(relationships.map((relationship) => relationship.toUserId)));
}

function toAttachmentView(
  attachment: Prisma.ChatAttachmentGetPayload<{ include: { mediaAsset: true } }>
): ChatAttachmentView {
  return {
    id: attachment.id,
    kind: attachment.kind === ChatAttachmentKind.IMAGE ? attachment.kind : attachmentKindForFile(attachment.fileName, attachment.mimeType),
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes.toString(),
    publicUrl: mediaAssetUrl(attachment.mediaAsset),
    thumbnailUrl:
      attachment.kind === ChatAttachmentKind.IMAGE ? mediaAssetUrl(attachment.mediaAsset) : null,
    mediaAssetId: attachment.mediaAssetId
  };
}

type ChatMessageRecord = Prisma.ChatMessageGetPayload<{
  include: ReturnType<typeof chatMessageInclude>;
}>;

function chatReactionSummary(currentUserId: string, message: Pick<ChatMessageRecord, "reactions">) {
  return Object.values(FeedReactionType)
    .map((type) => {
      const reactions = message.reactions.filter((reaction) => reaction.type === type);
      return {
        type,
        count: reactions.length,
        reactedByCurrentUser: reactions.some((reaction) => reaction.userId === currentUserId)
      };
    })
    .filter((reaction) => reaction.count > 0);
}

function toMessageView(currentUserId: string, message: ChatMessageRecord): ChatMessageView {
  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    sender: toPersonView(message.sender),
    attachments: message.attachments.map(toAttachmentView),
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          body: message.replyTo.body,
          sender: toPersonView(message.replyTo.sender),
          hasAttachments: message.replyTo.attachments.length > 0
        }
      : null,
    replyStyle: message.replyStyle,
    reactions: chatReactionSummary(currentUserId, message)
  };
}

function messageDeliveryState(
  currentUserId: string,
  message: { senderUserId: string; createdAt: Date },
  participants: Array<{ userId: string; lastReadAt: Date | null }>
) {
  if (message.senderUserId !== currentUserId) return undefined;
  const recipients = participants.filter((participant) => participant.userId !== currentUserId);
  if (recipients.length === 0) return "SENT" as const;
  return recipients.every((participant) => participant.lastReadAt && participant.lastReadAt >= message.createdAt) ? "SEEN" : "SENT";
}

function titleForThread(
  currentUserId: string,
  thread: Prisma.ChatThreadGetPayload<{
    include: { participants: { include: { user: { include: { profile: true } } } } };
  }>
) {
  if (thread.type === ChatThreadType.GROUP) {
    return thread.title ?? "Group chat";
  }

  const other = thread.participants.find((participant) => participant.userId !== currentUserId)?.user;
  return other ? toPersonView(other).displayName : "Direct chat";
}

function threadUnreadForUser(
  currentUserId: string,
  participants: Array<{ userId: string; lastReadAt: Date | null }>,
  latestVisibleMessageAt: Date | null
) {
  if (!latestVisibleMessageAt) return false;
  const participant = participants.find((item) => item.userId === currentUserId);
  return Boolean(participant && (!participant.lastReadAt || participant.lastReadAt < latestVisibleMessageAt));
}

function toThreadView(
  currentUserId: string,
  thread: Prisma.ChatThreadGetPayload<{
    include: {
      participants: { include: { user: { include: { profile: true } } } };
      messages: {
        include: ReturnType<typeof chatMessageInclude>;
      };
    };
  }>
): ChatThreadView {
  const latestVisibleMessage = thread.messages[0] ?? null;

  return {
    id: thread.id,
    type: thread.type,
    title: titleForThread(currentUserId, thread),
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastMessageAt: latestVisibleMessage?.createdAt.toISOString() ?? null,
    unread: threadUnreadForUser(currentUserId, thread.participants, latestVisibleMessage?.createdAt ?? null),
    participants: thread.participants.map((participant) => toPersonView(participant.user)),
    lastMessage: latestVisibleMessage ? toMessageView(currentUserId, latestVisibleMessage) : null
  };
}

function toThreadDetailView(
  currentUserId: string,
  thread: Prisma.ChatThreadGetPayload<{
    include: {
      participants: { include: { user: { include: { profile: true } } } };
      messages: {
        include: ReturnType<typeof chatMessageInclude>;
      };
    };
  }>,
  options: {
    messagesAscending?: boolean;
    latestVisibleMessage?: ChatMessageRecord | null;
  } = {}
): ChatThreadDetailView {
  const messages = options.messagesAscending ? [...thread.messages] : [...thread.messages].reverse();
  const latestVisibleMessage = options.latestVisibleMessage === undefined ? thread.messages[0] ?? null : options.latestVisibleMessage;
  const threadForSummary = {
    ...thread,
    messages: latestVisibleMessage ? [latestVisibleMessage] : []
  };
  const oldestMessage = messages[0];
  const newestMessage = messages[messages.length - 1];

  return {
    ...toThreadView(currentUserId, threadForSummary),
    messages: messages.map((message) => ({
      ...toMessageView(currentUserId, message),
      deliveryState: messageDeliveryState(currentUserId, message, thread.participants)
    })),
    messagePage: {
      oldestMessageId: oldestMessage?.id,
      oldestCreatedAt: oldestMessage?.createdAt.toISOString(),
      newestMessageId: newestMessage?.id,
      newestCreatedAt: newestMessage?.createdAt.toISOString()
    }
  };
}

async function buildChatMessagePageQuery(context: ChatAccessContext, threadId: string, input?: unknown) {
  const parsed = chatMessagePageSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid message cursor." };
  }

  const afterRequested = Boolean(parsed.data.afterMessageId || parsed.data.afterCreatedAt);
  const beforeRequested = Boolean(parsed.data.beforeMessageId || parsed.data.beforeCreatedAt);
  const cursorMessageId = parsed.data.afterMessageId ?? parsed.data.beforeMessageId;
  const cursorMessage = cursorMessageId
    ? await prisma.chatMessage.findFirst({
        where: {
          id: cursorMessageId,
          threadId,
          thread: {
            is: scopeChatThreadWhere(context, "read", { id: threadId })
          }
        },
        select: {
          id: true,
          createdAt: true
        }
      })
    : null;

  if (cursorMessageId && !cursorMessage) {
    return { ok: false as const, error: "Message cursor not found." };
  }

  const boundaryAt = cursorMessage?.createdAt ?? parsed.data.afterCreatedAt ?? parsed.data.beforeCreatedAt;
  const boundaryId = cursorMessage?.id;
  let where: Prisma.ChatMessageWhereInput = {};

  if (afterRequested && boundaryAt) {
    where = boundaryId
      ? {
          OR: [
            { createdAt: { gt: boundaryAt } },
            { createdAt: boundaryAt, id: { gt: boundaryId } }
          ]
        }
      : { createdAt: { gt: boundaryAt } };
  } else if (beforeRequested && boundaryAt) {
    where = boundaryId
      ? {
          OR: [
            { createdAt: { lt: boundaryAt } },
            { createdAt: boundaryAt, id: { lt: boundaryId } }
          ]
        }
      : { createdAt: { lt: boundaryAt } };
  }

  const ascending = afterRequested;

  return {
    ok: true as const,
    where,
    orderBy: [
      { createdAt: ascending ? ("asc" as const) : ("desc" as const) },
      { id: ascending ? ("asc" as const) : ("desc" as const) }
    ],
    take: parsed.data.limit,
    ascending
  };
}

function encryptForMobileDevice(publicKey: string, body: string) {
  const key = createPublicKey({
    key: Buffer.from(publicKey, "base64"),
    format: "der",
    type: "spki"
  });

  return publicEncrypt(
    {
      key,
      padding: constants.RSA_PKCS1_PADDING
    },
    Buffer.from(body, "utf8")
  ).toString("base64");
}

async function findOrCreateEncryptedThreadForParticipants(participantUserIds: string[]) {
  const uniqueUserIds = Array.from(new Set(participantUserIds)).sort();
  if (uniqueUserIds.length < 2) return null;

  const candidates = await prisma.encryptedChatThread.findMany({
    where: {
      AND: uniqueUserIds.map((userId) => ({
        participants: { some: { userId } }
      }))
    },
    include: { participants: true },
    take: 10
  });

  const existing = candidates.find((thread) => {
    const ids = thread.participants.map((participant) => participant.userId).sort();
    return ids.length === uniqueUserIds.length && ids.every((id, index) => id === uniqueUserIds[index]);
  });

  if (existing) return existing;

  return prisma.encryptedChatThread.create({
    data: {
      participants: {
        create: uniqueUserIds.map((userId) => ({ userId }))
      }
    },
    include: { participants: true }
  });
}

function mobileBridgeBody(message: Prisma.ChatMessageGetPayload<{ include: { attachments: { include: { mediaAsset: true } } } }>) {
  const parts: string[] = [];
  const body = message.body?.trim();
  if (body) parts.push(body);

  for (const attachment of message.attachments) {
    const publicUrl = mediaAssetUrl(attachment.mediaAsset);
    if (publicUrl) {
      parts.push(`${attachment.kind === ChatAttachmentKind.IMAGE ? "[photo]" : "[file]"} ${attachment.fileName}: ${publicUrl}`);
    } else {
      parts.push(`${attachment.kind === ChatAttachmentKind.IMAGE ? "[photo]" : "[file]"} ${attachment.fileName}`);
    }
  }

  return parts.join("\n").trim();
}

async function mirrorDesktopMessageToThetaComm(
  senderUserId: string,
  threadId: string,
  message: Prisma.ChatMessageGetPayload<{
    include: {
      attachments: { include: { mediaAsset: true } };
    };
  }>
) {
  const context = await resolveChatAccessContext(senderUserId);
  if (!context.userId) return;

  const thread = await prisma.chatThread.findFirst({
    where: scopeChatThreadWhere(context, "interact", {
      id: threadId,
      type: ChatThreadType.DIRECT
    }),
    include: {
      participants: {
        where: { archivedAt: null },
        select: { userId: true }
      }
    }
  });

  if (!thread) return;

  const participantUserIds = thread.participants.map((participant) => participant.userId);
  if (participantUserIds.length !== 2) return;

  const body = mobileBridgeBody(message).slice(0, MAX_CHAT_MESSAGE_CHARACTERS);
  if (!body) return;

  const devices = await prisma.userDevice.findMany({
    where: {
      userId: { in: participantUserIds },
      revokedAt: null
    },
    select: {
      id: true,
      userId: true,
      publicKey: true
    }
  });

  if (devices.length === 0) return;

  const encryptedThread = await findOrCreateEncryptedThreadForParticipants(participantUserIds);
  if (!encryptedThread) return;

  const bridgeDevice = await prisma.userDevice.upsert({
    where: {
      userId_deviceId: {
        userId: senderUserId,
        deviceId: DESKTOP_BRIDGE_DEVICE_ID
      }
    },
    update: {
      revokedAt: new Date(),
      lastSeenAt: new Date()
    },
    create: {
      userId: senderUserId,
      deviceId: DESKTOP_BRIDGE_DEVICE_ID,
      publicKey: "desktop-bridge-not-advertised",
      platform: "desktop",
      appVersion: "server-bridge",
      revokedAt: new Date()
    }
  });

  const envelopeInputs = devices
    .map((device) => {
      try {
        return {
          recipientUserId: device.userId,
          recipientDeviceId: device.id,
          ciphertext: encryptForMobileDevice(device.publicKey, body)
        };
      } catch {
        return null;
      }
    })
    .filter((envelope): envelope is { recipientUserId: string; recipientDeviceId: string; ciphertext: string } => Boolean(envelope));

  if (envelopeInputs.length === 0) return;

  await prisma.$transaction(async (tx) => {
    const created = await tx.encryptedChatMessage.create({
      data: {
        threadId: encryptedThread.id,
        senderUserId,
        senderDeviceId: bridgeDevice.id,
        createdAt: message.createdAt,
        envelopes: {
          create: envelopeInputs
        }
      }
    });

    await tx.encryptedChatThread.update({
      where: { id: encryptedThread.id },
      data: { lastMessageAt: created.createdAt }
    });
  });
}

export async function mirrorThetaCommMessageToDesktopChat(input: {
  senderUserId: string;
  participantUserIds: string[];
  body?: string;
}) {
  const participantUserIds = Array.from(new Set([input.senderUserId, ...input.participantUserIds])).filter(Boolean).sort();
  const body = input.body?.trim().slice(0, MAX_CHAT_MESSAGE_CHARACTERS);

  if (participantUserIds.length !== 2 || !body) return;

  const context = await resolveChatAccessContext(input.senderUserId);
  if (!context.userId) return;

  const targetUserId = participantUserIds.find((userId) => userId !== input.senderUserId);
  if (!targetUserId) return;

  const target = await prisma.user.findFirst({
    where: {
      id: targetUserId,
      deactivatedAt: null
    },
    select: { id: true }
  });

  if (!target || context.blockedUserIds.includes(target.id)) return;

  const candidates = await prisma.chatThread.findMany({
    where: {
      type: ChatThreadType.DIRECT,
      participants: { some: { userId: input.senderUserId } },
      AND: [{ participants: { some: { userId: target.id } } }]
    },
    include: { participants: true },
    take: 10
  });
  const existing = candidates.find((thread) => thread.participants.length === 2);

  const now = new Date();
  const thread =
    existing ??
    (await prisma.chatThread.create({
      data: {
        type: ChatThreadType.DIRECT,
        createdByUserId: input.senderUserId,
        participants: {
          create: [
            { userId: input.senderUserId, lastReadAt: now },
            { userId: target.id }
          ]
        }
      },
      include: { participants: true }
    }));

  const message = await prisma.$transaction(async (tx) => {
    await tx.chatParticipant.updateMany({
      where: {
        threadId: thread.id,
        userId: { in: participantUserIds }
      },
      data: { archivedAt: null }
    });

    const created = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderUserId: input.senderUserId,
        body
      },
      include: chatMessageInclude()
    });

    await tx.chatThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: created.createdAt }
    });

    await tx.chatParticipant.updateMany({
      where: {
        threadId: thread.id,
        userId: input.senderUserId
      },
      data: { lastReadAt: created.createdAt }
    });

    await deleteHandledChatNotifications(tx, input.senderUserId, thread.id);

    return created;
  });

  const sender = toPersonView(message.sender);
  await prisma.notification.create({
    data: {
      userId: target.id,
      title: `New chat from ${sender.displayName}`,
      body: body.slice(0, 180),
      href: chatThreadHref(thread.id)
    }
  });

  await diagnostics.info(MODULE_KEY, "ThetaComm message mirrored to desktop chat.", {
    senderUserId: input.senderUserId,
    targetUserId: target.id,
    threadId: thread.id,
    messageId: message.id
  });
}

export async function listChatThreads(userId: string): Promise<ChatThreadView[]> {
  const context = await resolveChatAccessContext(userId);
  if (!context.userId) return [];

  const threads = await withChatDbTimeout(
    prisma.chatThread.findMany({
      where: scopeChatThreadWhere(context, "read", {}),
      include: {
        participants: {
          where: visibleChatParticipantWhere(context),
          include: {
            user: {
              include: {
                profile: true
              }
            }
          }
        },
        messages: {
          where: visibleChatMessageWhere(context),
          orderBy: { createdAt: "desc" },
          take: 1,
          include: chatMessageInclude()
        }
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 50
    }),
    "chat thread lookup"
  );

  const views = threads
    .map((thread) => toThreadView(userId, thread))
    .sort((left, right) => (right.lastMessageAt ?? right.createdAt).localeCompare(left.lastMessageAt ?? left.createdAt));
  const directThreadsByPeer = new Map<string, ChatThreadView>();
  const deduped: ChatThreadView[] = [];

  for (const view of views) {
    if (view.type !== ChatThreadType.DIRECT) {
      deduped.push(view);
      continue;
    }

    const peerId = view.participants.find((participant) => participant.id !== userId)?.id;

    if (!peerId) {
      deduped.push(view);
      continue;
    }

    const existing = directThreadsByPeer.get(peerId);

    if (existing) {
      existing.unread = existing.unread || view.unread;
      continue;
    }

    directThreadsByPeer.set(peerId, view);
    deduped.push(view);
  }

  return deduped;
}

export async function safeListChatThreads(userId: string): Promise<ChatThreadView[]> {
  try {
    return await listChatThreads(userId);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list chat threads.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function getChatThread(userId: string, threadId: string, page?: unknown) {
  const context = await resolveChatAccessContext(userId);

  if (!context.userId) {
    return { ok: false as const, error: "Chat not found." };
  }

  const pageQuery = await buildChatMessagePageQuery(context, threadId, page);

  if (!pageQuery.ok) {
    return pageQuery;
  }

  const [thread, latestVisibleMessage] = await Promise.all([
    prisma.chatThread.findFirst({
      where: scopeChatThreadWhere(context, "read", { id: threadId }),
      include: {
        participants: {
          where: visibleChatParticipantWhere(context),
          include: {
            user: {
              include: {
                profile: true
              }
            }
          },
        },
        messages: {
          where: visibleChatMessageWhere(context, pageQuery.where),
          orderBy: pageQuery.orderBy,
          take: pageQuery.take,
          include: chatMessageInclude()
        }
      }
    }),
    prisma.chatMessage.findFirst({
      where: visibleChatMessageWhere(context, {
        threadId,
        thread: {
          is: scopeChatThreadWhere(context, "read", { id: threadId })
        }
      }),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: chatMessageInclude()
    })
  ]);

  if (!thread) {
    return { ok: false as const, error: "Chat not found." };
  }

  return {
    ok: true as const,
    thread: toThreadDetailView(userId, thread, {
      messagesAscending: pageQuery.ascending,
      latestVisibleMessage
    })
  };
}

export async function findOrCreateDirectChatThread(currentUserId: string, input: unknown) {
  const parsed = createDirectChatThreadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid chat." };
  }

  if (parsed.data.targetUserId === currentUserId) {
    return { ok: false as const, error: "Pick someone else to chat with." };
  }

  const [context, target] = await Promise.all([
    resolveChatAccessContext(currentUserId),
    prisma.user.findFirst({
      where: {
        id: parsed.data.targetUserId,
        deactivatedAt: null
      },
      select: { id: true }
    })
  ]);

  if (!context.userId || !target) {
    return { ok: false as const, error: "That member was not found." };
  }

  if (context.blockedUserIds.includes(target.id)) {
    return { ok: false as const, error: "Chat is blocked between these members." };
  }

  const existingCandidates = await prisma.chatThread.findMany({
    where: {
      type: ChatThreadType.DIRECT,
      participants: {
        some: {
          userId: currentUserId
        }
      },
      AND: [
        {
          participants: {
            some: {
              userId: target.id
            }
          }
        }
      ]
    },
    include: {
      participants: true
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: 10
  });

  const existing = existingCandidates.find((thread) => thread.participants.length === 2);

  if (existing) {
    await prisma.chatParticipant.updateMany({
      where: {
        threadId: existing.id,
        userId: currentUserId
      },
      data: {
        archivedAt: null
      }
    });

    const detail = await getChatThread(currentUserId, existing.id);
    return detail.ok ? { ok: true as const, thread: detail.thread } : detail;
  }

  const thread = await prisma.chatThread.create({
    data: {
      type: ChatThreadType.DIRECT,
      createdByUserId: currentUserId,
      participants: {
        create: [
          {
            userId: currentUserId,
            lastReadAt: new Date()
          },
          {
            userId: target.id
          }
        ]
      }
    },
    include: {
      participants: {
        include: {
          user: {
            include: {
              profile: true
            }
          }
        }
      },
      messages: {
        include: chatMessageInclude()
      }
    }
  });

  await diagnostics.info(MODULE_KEY, "Direct chat thread created.", {
    currentUserId,
    targetUserId: target.id,
    threadId: thread.id
  });

  return { ok: true as const, thread: toThreadDetailView(currentUserId, thread) };
}

export async function createGroupChatThread(currentUserId: string, input: unknown) {
  const parsed = createGroupChatThreadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid group chat." };
  }

  const participantUserIds = Array.from(new Set([currentUserId, ...parsed.data.participantUserIds]));

  if (participantUserIds.length < 2) {
    return { ok: false as const, error: "Add at least one other member." };
  }

  const [context, users, hasBlockedPair] = await Promise.all([
    resolveChatAccessContext(currentUserId),
    prisma.user.findMany({
      where: {
        id: { in: participantUserIds },
        deactivatedAt: null
      },
      select: { id: true }
    }),
    hasBlockedRelationshipWithin(participantUserIds)
  ]);

  if (!context.userId || users.length !== participantUserIds.length) {
    return { ok: false as const, error: "One or more members could not be found." };
  }

  if (hasBlockedPair) {
    return { ok: false as const, error: "A group chat cannot include members who have blocked one another." };
  }

  const thread = await prisma.chatThread.create({
    data: {
      type: ChatThreadType.GROUP,
      title: parsed.data.title,
      createdByUserId: currentUserId,
      participants: {
        create: participantUserIds.map((userId) => ({
          userId,
          lastReadAt: userId === currentUserId ? new Date() : undefined
        }))
      }
    },
    include: {
      participants: {
        include: {
          user: {
            include: {
              profile: true
            }
          }
        }
      },
      messages: {
        include: chatMessageInclude()
      }
    }
  });

  await diagnostics.info(MODULE_KEY, "Group chat thread created.", {
    currentUserId,
    threadId: thread.id,
    participantCount: participantUserIds.length
  });

  return { ok: true as const, thread: toThreadDetailView(currentUserId, thread) };
}

export async function sendChatMessage(senderUserId: string, input: unknown) {
  const parsed = sendChatMessageSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid message." };
  }

  const context = await resolveChatAccessContext(senderUserId);

  if (!context.userId) {
    return { ok: false as const, error: "Chat not found." };
  }

  const replyTarget = parsed.data.replyToMessageId
    ? await prisma.chatMessage.findFirst({
        where: {
          id: parsed.data.replyToMessageId,
          threadId: parsed.data.threadId,
          deletedAt: null,
          thread: scopeChatThreadWhere(context, "interact", {})
        },
        select: { id: true }
      })
    : null;

  if (parsed.data.replyToMessageId && !replyTarget) {
    return { ok: false as const, error: "The message you are replying to is no longer available." };
  }

  const mediaAssetIds = [...new Set(parsed.data.attachments.map((attachment) => attachment.mediaAssetId))];
  if (mediaAssetIds.length !== parsed.data.attachments.length) {
    return { ok: false as const, error: "Choose each attachment only once." };
  }
  const mediaAssets = mediaAssetIds.length
    ? await prisma.mediaAsset.findMany({
        where: {
          id: { in: mediaAssetIds },
          ownerUserId: senderUserId,
          status: MediaAssetStatus.READY,
          visibility: MediaVisibility.PRIVATE,
          sizeBytes: { lte: BigInt(MAX_CHAT_ATTACHMENT_BYTES) }
        },
        select: {
          id: true,
          storageKey: true,
          publicUrl: true,
          mimeType: true,
          sizeBytes: true,
          originalName: true
        }
      })
    : [];
  const mediaAssetMap = new Map(mediaAssets.map((asset) => [asset.id, asset]));

  if (mediaAssets.length !== mediaAssetIds.length) {
    return { ok: false as const, error: "One or more attachments could not be used." };
  }

  if (mediaAssets.reduce((total, asset) => total + Number(asset.sizeBytes), 0) > MAX_CHAT_TOTAL_ATTACHMENT_BYTES) {
    return { ok: false as const, error: "Chat attachments may total up to 40 MB per message." };
  }

  const message = await prisma.$transaction(async (tx) => {
    const authorizedThread = await tx.chatThread.findFirst({
      where: scopeChatThreadWhere(context, "interact", { id: parsed.data.threadId }),
      select: { id: true }
    });

    if (!authorizedThread) return null;

    const created = await tx.chatMessage.create({
      data: {
        threadId: parsed.data.threadId,
        senderUserId,
        replyToMessageId: replyTarget?.id,
        replyStyle: replyTarget ? parsed.data.replyStyle ?? ChatReplyStyle.REPLY : null,
        body: parsed.data.body?.trim() || null,
        attachments: {
          create: parsed.data.attachments.map((attachment) => {
            const mediaAsset = mediaAssetMap.get(attachment.mediaAssetId);
            if (!mediaAsset) throw new Error("Validated chat attachment was not found.");
            return {
              mediaAssetId: mediaAsset.id,
              kind: attachmentKindForFile(mediaAsset.originalName ?? "attachment", mediaAsset.mimeType),
              fileName: mediaAsset.originalName ?? "attachment",
              mimeType: mediaAsset.mimeType,
              sizeBytes: mediaAsset.sizeBytes,
              storageKey: mediaAsset.storageKey,
              publicUrl: null
            };
          })
        }
      },
      include: chatMessageInclude()
    });

    await tx.chatThread.update({
      where: { id: parsed.data.threadId },
      data: {
        lastMessageAt: created.createdAt
      }
    });

    await tx.chatParticipant.updateMany({
      where: {
        threadId: parsed.data.threadId,
        userId: senderUserId
      },
      data: {
        lastReadAt: created.createdAt
      }
    });

    await deleteHandledChatNotifications(tx, senderUserId, parsed.data.threadId);

    return created;
  });

  if (!message) {
    return { ok: false as const, error: "Chat not found or messaging is blocked." };
  }

  const participants = await prisma.chatParticipant.findMany({
    where: {
      threadId: parsed.data.threadId,
      userId: { not: senderUserId },
      archivedAt: null
    },
    select: { userId: true }
  });
  const sender = toPersonView(message.sender);

  try {
    await mirrorDesktopMessageToThetaComm(senderUserId, parsed.data.threadId, message);
  } catch (error) {
    await diagnostics.warn(MODULE_KEY, "Could not mirror desktop chat message to ThetaComm.", {
      senderUserId,
      threadId: parsed.data.threadId,
      messageId: message.id,
      error: error instanceof Error ? error.message : "unknown"
    });
  }

  if (participants.length > 0) {
    await prisma.notification.createMany({
      data: participants.map((participant) => ({
        userId: participant.userId,
        title: `New chat from ${sender.displayName}`,
        body: parsed.data.body?.trim().slice(0, 180) || "Sent an attachment.",
        href: chatThreadHref(parsed.data.threadId)
      }))
    });
  }

  await diagnostics.info(MODULE_KEY, "Chat message sent.", {
    senderUserId,
    threadId: parsed.data.threadId,
    attachmentCount: parsed.data.attachments.length
  });

  return { ok: true as const, message: toMessageView(senderUserId, message) };
}

export async function reactToChatMessage(userId: string, input: unknown) {
  const parsed = reactToChatMessageSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid reaction." };
  }

  const context = await resolveChatAccessContext(userId);
  if (!context.userId) {
    return { ok: false as const, error: "Chat message not found." };
  }

  const result = await prisma.$transaction(async (tx) => {
    const message = await tx.chatMessage.findFirst({
      where: {
        id: parsed.data.messageId,
        deletedAt: null,
        thread: scopeChatThreadWhere(context, "interact", {})
      },
      select: { id: true }
    });

    if (!message) return null;

    const existing = await tx.chatMessageReaction.findUnique({
      where: {
        messageId_userId: {
          messageId: message.id,
          userId
        }
      }
    });

    if (existing?.type === parsed.data.type) {
      await tx.chatMessageReaction.delete({ where: { id: existing.id } });
    } else {
      await tx.chatMessageReaction.upsert({
        where: {
          messageId_userId: {
            messageId: message.id,
            userId
          }
        },
        create: {
          messageId: message.id,
          userId,
          type: parsed.data.type
        },
        update: {
          type: parsed.data.type
        }
      });
    }

    return tx.chatMessageReaction.findMany({
      where: { messageId: message.id },
      select: { type: true, userId: true }
    });
  });

  if (!result) {
    return { ok: false as const, error: "Chat message not found or messaging is blocked." };
  }

  await diagnostics.info(MODULE_KEY, "Chat message reaction changed.", {
    userId,
    messageId: parsed.data.messageId,
    type: parsed.data.type
  });

  return {
    ok: true as const,
    reactions: chatReactionSummary(userId, { reactions: result })
  };
}

export async function markChatThreadRead(userId: string, threadId: string) {
  const context = await resolveChatAccessContext(userId);

  if (!context.userId) {
    return { ok: false as const, error: "Chat not found." };
  }

  const updated = await prisma.chatParticipant.updateMany({
    where: {
      threadId,
      userId,
      archivedAt: null,
      thread: {
        is: scopeChatThreadWhere(context, "read", { id: threadId })
      }
    },
    data: {
      lastReadAt: new Date()
    }
  });

  if (updated.count === 0) {
    return { ok: false as const, error: "Chat not found." };
  }

  return { ok: true as const };
}

export async function searchChatContacts(userId: string, query: string, filter?: string | null): Promise<ChatPersonView[]> {
  const context = await resolveChatAccessContext(userId);
  if (!context.userId) return [];

  const cleanQuery = query.trim();
  const contactFilter = normalizedContactFilter(filter);
  const relationshipTypes =
    contactFilter === "ALL"
      ? [SocialRelationshipType.FRIEND, SocialRelationshipType.FAMILY, SocialRelationshipType.ACQUAINTANCE, SocialRelationshipType.CONTACT]
      : contactFilter === "MEMBERS"
        ? []
        : [relationshipContactFilters[contactFilter]];
  const relationshipUserIds = await contactRelationshipUserIds(userId, relationshipTypes);
  const visibleMemberScope = {
    profile: {
      is: {
        visibility: {
          in: [ProfileVisibility.MEMBERS, ProfileVisibility.PUBLIC]
        }
      }
    }
  };

  if (!cleanQuery) {
    const users = await prisma.user.findMany({
      where:
        contactFilter === "MEMBERS"
          ? { AND: [{ id: { not: userId } }, context.visibleUserWhere, visibleMemberScope] }
          : { AND: [{ id: { in: relationshipUserIds } }, context.visibleUserWhere] },
      include: { profile: true },
      orderBy: { updatedAt: "desc" },
      take: 12
    });

    return uniquePeopleById(users.map(toPersonView));
  }

  const users = await withChatDbTimeout(
    prisma.user.findMany({
      where: {
        id: { not: userId },
        AND: [
          context.visibleUserWhere,
          contactFilter === "MEMBERS"
            ? visibleMemberScope
            : contactFilter === "ALL"
              ? { OR: [{ id: { in: relationshipUserIds } }, visibleMemberScope] }
              : { id: { in: relationshipUserIds } },
          {
            OR: [
              { username: { contains: cleanQuery, mode: "insensitive" } },
              { email: { contains: cleanQuery, mode: "insensitive" } },
              {
                profile: {
                  is: {
                    OR: [
                      { displayName: { contains: cleanQuery, mode: "insensitive" } },
                      { tagline: { contains: cleanQuery, mode: "insensitive" } },
                      { bio: { contains: cleanQuery, mode: "insensitive" } },
                      { location: { contains: cleanQuery, mode: "insensitive" } }
                    ]
                  }
                }
              }
            ]
          }
        ]
      },
      include: {
        profile: true
      },
      orderBy: { username: "asc" },
      take: 12
    }),
    "chat contact search"
  );

  return uniquePeopleById(users.map(toPersonView));
}

export async function createChatUploadIntent(userId: string, input: unknown) {
  const parsed = createChatUploadIntentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload." };
  }

  const result = await createUploadIntent(userId, {
    checksumSha256: parsed.data.checksumSha256,
    mimeType: parsed.data.mimeType,
    purpose: UploadIntentPurpose.CHAT_ATTACHMENT,
    sizeBytes: parsed.data.sizeBytes,
    visibility: MediaVisibility.PRIVATE
  });

  if (!result.ok) return { ok: false as const, error: result.error };

  return {
    ok: true as const,
    intentId: result.intent.id,
    intent: result.intent,
    uploadUrl: result.uploadUrl,
    uploadHeaders: result.uploadHeaders,
    storageKey: result.intent.storageKey,
    publicUrl: null,
    expiresInSeconds: result.expiresInSeconds
  };
}

export async function completeChatUpload(userId: string, input: unknown) {
  const parsed = completeChatUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload completion." };
  }

  if (parsed.data.thumbnailStorageKey) {
    return { ok: false as const, error: "Thumbnail uploads require a separate verified upload intent." };
  }

  const verified = await completeUploadIntent(userId, { intentId: parsed.data.intentId });
  if (!verified.ok) return { ok: false as const, error: verified.error };

  const normalizedMimeType = parsed.data.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    verified.intent.purpose !== UploadIntentPurpose.CHAT_ATTACHMENT ||
    verified.intent.visibility !== MediaVisibility.PRIVATE ||
    verified.intent.mimeType !== normalizedMimeType ||
    verified.intent.sizeBytes !== String(parsed.data.sizeBytes) ||
    (parsed.data.storageKey && parsed.data.storageKey !== verified.intent.storageKey)
  ) {
    return { ok: false as const, error: "Upload intent did not match this chat attachment." };
  }

  let consumed;
  try {
    consumed = await consumeVerifiedUploadIntent({
      ownerUserId: userId,
      intentId: parsed.data.intentId,
      purpose: UploadIntentPurpose.CHAT_ATTACHMENT,
      consume: async (transaction, intent) => {
        if (
          intent.ownerUserId !== userId ||
          intent.purpose !== UploadIntentPurpose.CHAT_ATTACHMENT ||
          intent.visibility !== MediaVisibility.PRIVATE ||
          intent.declaredMimeType !== normalizedMimeType ||
          intent.declaredSizeBytes !== BigInt(parsed.data.sizeBytes)
        ) {
          throw new Error("Chat upload intent contract changed during consumption.");
        }

        return transaction.mediaAsset.create({
          data: {
            ownerUserId: userId,
            storageKey: intent.storageKey,
            publicUrl: null,
            mimeType: intent.observedMimeType ?? intent.declaredMimeType,
            sizeBytes: intent.observedSizeBytes ?? intent.declaredSizeBytes,
            originalName: parsed.data.fileName,
            visibility: MediaVisibility.PRIVATE,
            metadata: {
              module: MODULE_KEY,
              uploadIntentId: intent.id,
              attachmentKind: attachmentKindForFile(parsed.data.fileName, intent.declaredMimeType),
              thumbnailStorageKey: null,
              thumbnailUrl: null
            }
          }
        });
      }
    });
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not consume verified chat upload intent.", {
      userId,
      intentId: parsed.data.intentId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Chat attachment could not be finalized." };
  }

  if (!consumed.ok) return { ok: false as const, error: consumed.error };
  const asset = consumed.value;

  await diagnostics.info(MODULE_KEY, "Chat attachment upload completed.", {
    userId,
    mediaAssetId: asset.id,
    storageKey: asset.storageKey
  });

  return {
    ok: true as const,
    intentId: parsed.data.intentId,
    attachment: {
      mediaAssetId: asset.id,
      kind: attachmentKindForFile(asset.originalName ?? parsed.data.fileName, asset.mimeType),
      fileName: asset.originalName ?? parsed.data.fileName,
      mimeType: asset.mimeType,
      sizeBytes: Number(asset.sizeBytes),
      storageKey: asset.storageKey,
      publicUrl: `/api/media/assets/${asset.id}`,
      thumbnailUrl: `/api/media/assets/${asset.id}`
    }
  };
}

export async function countUnreadChatThreads(userId?: string) {
  if (!userId) return 0;

  try {
    const context = await resolveChatAccessContext(userId);
    if (!context.userId) return 0;

    const participants = await withChatDbTimeout(
      prisma.chatParticipant.findMany({
        where: {
          userId,
          archivedAt: null,
          thread: {
            is: scopeChatThreadWhere(context, "read", {
            messages: {
              some: {
                  AND: [
                    visibleChatMessageWhere(context),
                    { senderUserId: { not: userId } }
                  ]
                }
              }
            })
          }
        },
        include: {
          thread: {
            select: {
              type: true,
              participants: {
                where: visibleChatParticipantWhere(context),
                select: { userId: true }
              },
              messages: {
                where: visibleChatMessageWhere(context),
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 1,
                select: { createdAt: true }
              }
            }
          }
        },
        take: 100
      }),
      "unread chat count"
    );

    const unreadKeys = new Set<string>();

    participants.forEach((participant) => {
      const lastMessageAt = participant.thread.messages[0]?.createdAt ?? null;
      const unread = Boolean(lastMessageAt && (!participant.lastReadAt || participant.lastReadAt < lastMessageAt));

      if (!unread) return;

      if (participant.thread.type === ChatThreadType.DIRECT) {
        const peerId = participant.thread.participants.find((threadParticipant) => threadParticipant.userId !== userId)?.userId;
        unreadKeys.add(peerId ? `direct:${peerId}` : `thread:${participant.threadId}`);
        return;
      }

      unreadKeys.add(`thread:${participant.threadId}`);
    });

    return unreadKeys.size;
  } catch (error) {
    await diagnostics.warn(MODULE_KEY, "Could not count unread chat threads.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return 0;
  }
}
