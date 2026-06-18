import { randomBytes } from "crypto";
import {
  ChatAttachmentKind,
  ChatThreadType,
  MediaVisibility,
  Prisma,
  SocialRelationshipType
} from "@prisma/client";
import { createPresignedR2PutUrl, getR2PublicUrl } from "@/lib/platform/r2";
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

function attachmentKindForMime(mimeType: string) {
  return mimeType.startsWith("image/") ? ChatAttachmentKind.IMAGE : ChatAttachmentKind.FILE;
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

function toAttachmentView(
  attachment: Prisma.ChatAttachmentGetPayload<{ include: { mediaAsset: true } }>
): ChatAttachmentView {
  return {
    id: attachment.id,
    kind: attachment.kind,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes.toString(),
    publicUrl: attachment.publicUrl ?? attachment.mediaAsset?.publicUrl,
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
    messages: [...thread.messages].reverse().map(toMessageView)
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

  return threads.map((thread) => toThreadView(userId, thread));
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
          publicUrl: true
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
              kind: attachment.kind,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
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

  if (participants.length > 0) {
    await prisma.notification.createMany({
      data: participants.map((participant) => ({
        userId: participant.userId,
        title: `New chat from ${sender.displayName}`,
        body: parsed.data.body?.trim().slice(0, 180) || "Sent an attachment.",
        href: `/messages?thread=${parsed.data.threadId}`
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

export async function searchChatContacts(userId: string, query: string): Promise<ChatPersonView[]> {
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    const relationships = await prisma.socialRelationship.findMany({
      where: {
        fromUserId: userId,
        type: { in: [SocialRelationshipType.FRIEND, SocialRelationshipType.FAMILY, SocialRelationshipType.CONTACT] }
      },
      include: {
        toUser: {
          include: {
            profile: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 12
    });

    return relationships.map((relationship) => toPersonView(relationship.toUser));
  }

  const users = await withChatDbTimeout(
    prisma.user.findMany({
      where: {
        id: { not: userId },
        deactivatedAt: null,
        OR: [
          { username: { contains: cleanQuery, mode: "insensitive" } },
          { email: { contains: cleanQuery, mode: "insensitive" } },
          {
            profile: {
              is: {
                displayName: { contains: cleanQuery, mode: "insensitive" }
              }
            }
          },
          {
            profile: {
              is: {
                location: { contains: cleanQuery, mode: "insensitive" }
              }
            }
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

  return users.map(toPersonView);
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

  const publicUrl = getR2PublicUrl(parsed.data.storageKey);
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
        attachmentKind: attachmentKindForMime(parsed.data.mimeType)
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
      kind: attachmentKindForMime(asset.mimeType),
      fileName: asset.originalName ?? parsed.data.fileName,
      mimeType: asset.mimeType,
      sizeBytes: Number(asset.sizeBytes),
      storageKey: asset.storageKey,
      publicUrl: asset.publicUrl
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
              lastMessageAt: true
            }
          }
        },
        take: 100
      }),
      "unread chat count"
    );

    return participants.filter((participant) => {
      const lastMessageAt = participant.thread.lastMessageAt;
      return Boolean(lastMessageAt && (!participant.lastReadAt || participant.lastReadAt < lastMessageAt));
    }).length;
  } catch (error) {
    await diagnostics.warn(MODULE_KEY, "Could not count unread chat threads.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return 0;
  }
}
