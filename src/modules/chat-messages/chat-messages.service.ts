import { constants, createPublicKey, publicEncrypt, randomBytes } from "crypto";
import {
  ChatAttachmentKind,
  ChatThreadType,
  MediaVisibility,
  ProfileVisibility,
  Prisma,
  SocialRelationshipType
} from "@prisma/client";
import { createPresignedR2PutUrl, getR2PublicUrl, verifyR2Object } from "@/lib/platform/r2";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  completeChatUploadSchema,
  createChatUploadIntentSchema,
  createDirectChatThreadSchema,
  createGroupChatThreadSchema,
  sendChatMessageSchema,
  type ChatAttachmentView,
  type ChatMessageView,
  type ChatPersonView,
  type ChatThreadDetailView,
  type ChatThreadView
} from "@/modules/chat-messages/types";

const MODULE_KEY = "chat-messages";
const CHAT_DB_TIMEOUT_MS = 2500;
const DESKTOP_BRIDGE_DEVICE_ID = "theta-space-desktop-bridge";

function withChatDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), CHAT_DB_TIMEOUT_MS);
    })
  ]);
}

function safeFileName(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return cleaned || "attachment";
}

function dateSlug(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function attachmentKindForFile(fileName: string, mimeType: string) {
  return mimeType.toLowerCase().startsWith("image/") || /\.(avif|gif|jpe?g|png|webp|bmp|svg)$/i.test(fileName)
    ? ChatAttachmentKind.IMAGE
    : ChatAttachmentKind.FILE;
}

function readThumbnailUrl(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;

  const value = (metadata as Record<string, unknown>).thumbnailUrl;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mediaAssetUrl(mediaAsset?: { id: string; publicUrl: string | null } | null) {
  return mediaAsset ? mediaAsset.publicUrl ?? `/api/media/assets/${mediaAsset.id}` : null;
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
    publicUrl: attachment.publicUrl ?? mediaAssetUrl(attachment.mediaAsset),
    thumbnailUrl: readThumbnailUrl(attachment.mediaAsset?.metadata),
    mediaAssetId: attachment.mediaAssetId
  };
}

function toMessageView(
  message: Prisma.ChatMessageGetPayload<{
    include: {
      sender: { include: { profile: true } };
      attachments: { include: { mediaAsset: true } };
    };
  }>
): ChatMessageView {
  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    sender: toPersonView(message.sender),
    attachments: message.attachments.map(toAttachmentView)
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
  thread: Prisma.ChatThreadGetPayload<{ include: { participants: true } }>
) {
  if (!thread.lastMessageAt) return false;
  const participant = thread.participants.find((item) => item.userId === currentUserId);
  return Boolean(participant && (!participant.lastReadAt || participant.lastReadAt < thread.lastMessageAt));
}

function toThreadView(
  currentUserId: string,
  thread: Prisma.ChatThreadGetPayload<{
    include: {
      participants: { include: { user: { include: { profile: true } } } };
      messages: {
        include: {
          sender: { include: { profile: true } };
          attachments: { include: { mediaAsset: true } };
        };
      };
    };
  }>
): ChatThreadView {
  return {
    id: thread.id,
    type: thread.type,
    title: titleForThread(currentUserId, thread),
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastMessageAt: thread.lastMessageAt?.toISOString(),
    unread: threadUnreadForUser(currentUserId, thread),
    participants: thread.participants.map((participant) => toPersonView(participant.user)),
    lastMessage: thread.messages[0] ? toMessageView(thread.messages[0]) : null
  };
}

function toThreadDetailView(
  currentUserId: string,
  thread: Prisma.ChatThreadGetPayload<{
    include: {
      participants: { include: { user: { include: { profile: true } } } };
      messages: {
        include: {
          sender: { include: { profile: true } };
          attachments: { include: { mediaAsset: true } };
        };
      };
    };
  }>
): ChatThreadDetailView {
  return {
    ...toThreadView(currentUserId, thread),
    messages: [...thread.messages].reverse().map((message) => ({
      ...toMessageView(message),
      deliveryState: messageDeliveryState(currentUserId, message, thread.participants)
    }))
  };
}

async function assertParticipant(userId: string, threadId: string) {
  const participant = await prisma.chatParticipant.findUnique({
    where: {
      threadId_userId: {
        threadId,
        userId
      }
    }
  });

  return Boolean(participant && !participant.archivedAt);
}

async function isBlockedBetween(firstUserId: string, secondUserId: string) {
  const relationship = await prisma.socialRelationship.findFirst({
    where: {
      type: SocialRelationshipType.BLOCK,
      OR: [
        { fromUserId: firstUserId, toUserId: secondUserId },
        { fromUserId: secondUserId, toUserId: firstUserId }
      ]
    },
    select: { id: true }
  });

  return Boolean(relationship);
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
    const publicUrl = attachment.publicUrl ?? mediaAssetUrl(attachment.mediaAsset);
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
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      participants: {
        where: { archivedAt: null },
        select: { userId: true }
      }
    }
  });

  if (!thread || thread.type !== ChatThreadType.DIRECT) return;

  const participantUserIds = thread.participants.map((participant) => participant.userId);
  if (participantUserIds.length !== 2) return;

  const body = mobileBridgeBody(message);
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
  const body = input.body?.trim();

  if (participantUserIds.length !== 2 || !body) return;

  const targetUserId = participantUserIds.find((userId) => userId !== input.senderUserId);
  if (!targetUserId) return;

  const target = await prisma.user.findFirst({
    where: {
      id: targetUserId,
      deactivatedAt: null
    },
    select: { id: true }
  });

  if (!target || (await isBlockedBetween(input.senderUserId, target.id))) return;

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
      include: {
        sender: { include: { profile: true } },
        attachments: { include: { mediaAsset: true } }
      }
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
  const threads = await withChatDbTimeout(
    prisma.chatThread.findMany({
      where: {
        participants: {
          some: {
            userId,
            archivedAt: null
          }
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
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            sender: {
              include: {
                profile: true
              }
            },
            attachments: {
              include: {
                mediaAsset: true
              }
            }
          }
        }
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 50
    }),
    "chat thread lookup"
  );

  const views = threads.map((thread) => toThreadView(userId, thread));
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

export async function getChatThread(userId: string, threadId: string) {
  if (!(await assertParticipant(userId, threadId))) {
    return { ok: false as const, error: "Chat not found." };
  }

  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
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
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 60,
        include: {
          sender: {
            include: {
              profile: true
            }
          },
          attachments: {
            include: {
              mediaAsset: true
            }
          }
        }
      }
    }
  });

  if (!thread) {
    return { ok: false as const, error: "Chat not found." };
  }

  return { ok: true as const, thread: toThreadDetailView(userId, thread) };
}

export async function findOrCreateDirectChatThread(currentUserId: string, input: unknown) {
  const parsed = createDirectChatThreadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid chat." };
  }

  if (parsed.data.targetUserId === currentUserId) {
    return { ok: false as const, error: "Pick someone else to chat with." };
  }

  const target = await prisma.user.findFirst({
    where: {
      id: parsed.data.targetUserId,
      deactivatedAt: null
    },
    select: { id: true }
  });

  if (!target) {
    return { ok: false as const, error: "That member was not found." };
  }

  if (await isBlockedBetween(currentUserId, target.id)) {
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
        include: {
          sender: {
            include: {
              profile: true
            }
          },
          attachments: {
            include: {
              mediaAsset: true
            }
          }
        }
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

  const users = await prisma.user.findMany({
    where: {
      id: { in: participantUserIds },
      deactivatedAt: null
    },
    select: { id: true }
  });

  if (users.length !== participantUserIds.length) {
    return { ok: false as const, error: "One or more members could not be found." };
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
        include: {
          sender: {
            include: {
              profile: true
            }
          },
          attachments: {
            include: {
              mediaAsset: true
            }
          }
        }
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

  if (!(await assertParticipant(senderUserId, parsed.data.threadId))) {
    return { ok: false as const, error: "Chat not found." };
  }

  const mediaAssetIds = parsed.data.attachments.map((attachment) => attachment.mediaAssetId).filter(Boolean) as string[];
  const mediaAssets = mediaAssetIds.length
    ? await prisma.mediaAsset.findMany({
        where: {
          id: { in: mediaAssetIds },
          ownerUserId: senderUserId
        },
        select: {
          id: true,
          storageKey: true,
          publicUrl: true,
          mimeType: true
        }
      })
    : [];
  const mediaAssetMap = new Map(mediaAssets.map((asset) => [asset.id, asset]));

  if (mediaAssets.length !== mediaAssetIds.length) {
    return { ok: false as const, error: "One or more attachments could not be used." };
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: {
        threadId: parsed.data.threadId,
        senderUserId,
        body: parsed.data.body?.trim() || null,
        attachments: {
          create: parsed.data.attachments.map((attachment) => {
            const mediaAsset = attachment.mediaAssetId ? mediaAssetMap.get(attachment.mediaAssetId) : undefined;
            return {
              mediaAssetId: attachment.mediaAssetId || undefined,
              kind: attachmentKindForFile(attachment.fileName, mediaAsset?.mimeType ?? attachment.mimeType),
              fileName: attachment.fileName,
              mimeType: mediaAsset?.mimeType ?? attachment.mimeType,
              sizeBytes: BigInt(attachment.sizeBytes),
              storageKey: mediaAsset?.storageKey ?? (attachment.storageKey || null),
              publicUrl: mediaAsset?.publicUrl ?? (attachment.publicUrl || null)
            };
          })
        }
      },
      include: {
        sender: {
          include: {
            profile: true
          }
        },
        attachments: {
          include: {
            mediaAsset: true
          }
        }
      }
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

  return { ok: true as const, message: toMessageView(message) };
}

export async function markChatThreadRead(userId: string, threadId: string) {
  if (!(await assertParticipant(userId, threadId))) {
    return { ok: false as const, error: "Chat not found." };
  }

  await prisma.chatParticipant.update({
    where: {
      threadId_userId: {
        threadId,
        userId
      }
    },
    data: {
      lastReadAt: new Date()
    }
  });

  return { ok: true as const };
}

export async function searchChatContacts(userId: string, query: string, filter?: string | null): Promise<ChatPersonView[]> {
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
          ? { id: { not: userId }, deactivatedAt: null, ...visibleMemberScope }
          : { id: { in: relationshipUserIds }, deactivatedAt: null },
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
        deactivatedAt: null,
        AND: [
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

  const storageKey = [
    "users",
    userId,
    "chat",
    dateSlug(),
    `${randomBytes(8).toString("hex")}-${safeFileName(parsed.data.fileName)}`
  ].join("/");

  try {
    const uploadUrl = await createPresignedR2PutUrl({
      storageKey,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes
    });

    return {
      ok: true as const,
      uploadUrl,
      storageKey,
      publicUrl: getR2PublicUrl(storageKey),
      expiresInSeconds: 300
    };
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not create chat upload intent.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Media storage is not configured." };
  }
}

export async function completeChatUpload(userId: string, input: unknown) {
  const parsed = completeChatUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload completion." };
  }

  const expectedPrefix = ["users", userId, "chat"].join("/") + "/";
  if (!parsed.data.storageKey.startsWith(expectedPrefix)) {
    return { ok: false as const, error: "Invalid upload key." };
  }

  if (parsed.data.thumbnailStorageKey && !parsed.data.thumbnailStorageKey.startsWith(expectedPrefix)) {
    return { ok: false as const, error: "Invalid thumbnail upload key." };
  }

  const uploadedObject = await verifyR2Object({
    storageKey: parsed.data.storageKey,
    expectedMimeType: parsed.data.mimeType,
    expectedSizeBytes: parsed.data.sizeBytes,
    label: "Chat attachment upload"
  });

  if (!uploadedObject.ok) {
    return { ok: false as const, error: uploadedObject.error };
  }

  if (parsed.data.thumbnailStorageKey) {
    const uploadedThumbnail = await verifyR2Object({
      storageKey: parsed.data.thumbnailStorageKey,
      expectedMimeType: "image/jpeg",
      label: "Chat thumbnail upload"
    });

    if (!uploadedThumbnail.ok) {
      return { ok: false as const, error: uploadedThumbnail.error };
    }
  }

  const publicUrl = getR2PublicUrl(parsed.data.storageKey);
  const thumbnailUrl = parsed.data.thumbnailStorageKey ? getR2PublicUrl(parsed.data.thumbnailStorageKey) : null;
  const asset = await prisma.mediaAsset.create({
    data: {
      ownerUserId: userId,
      storageKey: parsed.data.storageKey,
      publicUrl,
      mimeType: parsed.data.mimeType,
      sizeBytes: BigInt(parsed.data.sizeBytes),
      originalName: parsed.data.fileName,
      visibility: MediaVisibility.MEMBERS,
      metadata: {
        module: MODULE_KEY,
        attachmentKind: attachmentKindForFile(parsed.data.fileName, parsed.data.mimeType),
        thumbnailStorageKey: parsed.data.thumbnailStorageKey ?? null,
        thumbnailUrl
      }
    }
  });

  await diagnostics.info(MODULE_KEY, "Chat attachment upload completed.", {
    userId,
    mediaAssetId: asset.id,
    storageKey: asset.storageKey
  });

  return {
    ok: true as const,
    attachment: {
      mediaAssetId: asset.id,
      kind: attachmentKindForFile(asset.originalName ?? parsed.data.fileName, asset.mimeType),
      fileName: asset.originalName ?? parsed.data.fileName,
      mimeType: asset.mimeType,
      sizeBytes: Number(asset.sizeBytes),
      storageKey: asset.storageKey,
      publicUrl: asset.publicUrl,
      thumbnailUrl
    }
  };
}

export async function countUnreadChatThreads(userId?: string) {
  if (!userId) return 0;

  try {
    const participants = await withChatDbTimeout(
      prisma.chatParticipant.findMany({
        where: {
          userId,
          archivedAt: null,
          thread: {
            lastMessageAt: { not: null },
            messages: {
              some: {
                senderUserId: { not: userId },
                deletedAt: null
              }
            }
          }
        },
        include: {
          thread: {
            select: {
              type: true,
              lastMessageAt: true,
              participants: {
                where: { archivedAt: null },
                select: { userId: true }
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
      const lastMessageAt = participant.thread.lastMessageAt;
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
