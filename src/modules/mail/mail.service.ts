import {
  MailAttachmentKind,
  MailDeliveryKind,
  MailRecipientType,
  MediaAssetStatus,
  MediaVisibility,
  MembershipTier,
  Prisma,
  SocialRelationshipType,
  UploadIntentPurpose,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { isEnabled } from "@/lib/platform/env";
import { diagnostics } from "@/lib/platform/logging";
import {
  lockReadyMediaAssetsForReference,
  withMediaAssetReferenceValidation
} from "@/lib/platform/media-asset-reference-fence";
import { isAdminRole } from "@/lib/platform/roles";
import {
  completeMailUploadSchema,
  createMailUploadIntentSchema,
  mailFolderSchema,
  sendMailSchema,
  updateMailPreferenceSchema,
  type MailAttachmentView,
  type MailFolder,
  type MailMessageView,
  type MailPersonView,
  type MailPreferenceView,
  type MailRecipientView,
  type MailThreadDetailView,
  type MailThreadPageView,
  type MailThreadSummaryView
} from "@/modules/mail/types";
import {
  completeUploadIntent,
  consumeVerifiedUploadIntent,
  createUploadIntent
} from "@/modules/media/upload-intent.service";

const MODULE_KEY = "mail";
const MAIL_DB_TIMEOUT_MS = 2500;
const DEFAULT_MAIL_PAGE_SIZE = 30;
const MAX_MAIL_PAGE_SIZE = 50;
export const INTERNAL_MAIL_UNAVAILABLE_ERROR = "Internal Mail is currently unavailable.";

class MailAccessError extends Error {}

function withMailDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), MAIL_DB_TIMEOUT_MS);
    })
  ]);
}

function attachmentKindForMime(mimeType: string) {
  return mimeType.startsWith("image/") ? MailAttachmentKind.IMAGE : MailAttachmentKind.FILE;
}

export function isInternalMailEnabled(input: NodeJS.ProcessEnv = process.env) {
  return isEnabled(input.INTERNAL_MAIL_ENABLED, false);
}

type MailPersonRecord = {
  id: string;
  email: string;
  username: string;
  profile: { displayName: string | null; avatarUrl: string | null; tagline: string | null } | null;
};

type MailRecipientForView = {
  id: string;
  userId: string;
  type: MailRecipientType;
  readAt: Date | null;
  user: MailPersonRecord;
};

type MailSummaryMessage = {
  id: string;
  threadId: string;
  senderUserId: string;
  bodyText: string;
  createdAt: Date;
  thread: {
    subject: string;
    deliveryKind: MailDeliveryKind;
    lastMessageAt: Date | null;
  };
  sender: MailPersonRecord;
  recipients: MailRecipientForView[];
};

const mailPersonSelect = {
  id: true,
  email: true,
  username: true,
  profile: {
    select: {
      displayName: true,
      avatarUrl: true,
      tagline: true
    }
  }
} satisfies Prisma.UserSelect;

const mailSummaryMessageSelect = {
  id: true,
  threadId: true,
  senderUserId: true,
  bodyText: true,
  createdAt: true,
  thread: {
    select: {
      subject: true,
      deliveryKind: true,
      lastMessageAt: true
    }
  },
  sender: {
    select: mailPersonSelect
  },
  recipients: {
    select: {
      id: true,
      userId: true,
      type: true,
      readAt: true,
      user: {
        select: mailPersonSelect
      }
    }
  }
} satisfies Prisma.MailMessageSelect;

function toPersonView(user: MailPersonRecord, viewerUserId: string): MailPersonView {
  return {
    id: user.id,
    email: user.id === viewerUserId ? user.email : "",
    username: user.username,
    displayName: user.profile?.displayName ?? user.username,
    avatarUrl: user.profile?.avatarUrl,
    tagline: user.profile?.tagline
  };
}

function toAttachmentView(
  attachment: Prisma.MailAttachmentGetPayload<{ include: { mediaAsset: true } }>
): MailAttachmentView {
  return {
    id: attachment.id,
    kind: attachment.kind,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes.toString(),
    publicUrl: `/api/mail/attachments/${attachment.id}`,
    mediaAssetId: null
  };
}

function toRecipientView(
  recipient: MailRecipientForView,
  viewerUserId: string
): MailRecipientView {
  return {
    id: recipient.id,
    type: recipient.type,
    readAt: recipient.userId === viewerUserId ? recipient.readAt?.toISOString() : undefined,
    user: toPersonView(recipient.user, viewerUserId)
  };
}

type MailMessageForView = Prisma.MailMessageGetPayload<{
  include: {
    thread: true;
    sender: { include: { profile: true } };
    recipients: { include: { user: { include: { profile: true } } } };
    attachments: { include: { mediaAsset: true } };
  };
}>;

function visibleRecipientsForViewer(
  currentUserId: string,
  message: { senderUserId: string; thread: { deliveryKind: MailDeliveryKind }; recipients: MailRecipientForView[] },
  blockedUserIds: Set<string>
) {
  const unblocked = message.recipients.filter(
    (recipient) => recipient.userId === currentUserId || !blockedUserIds.has(recipient.userId)
  );

  if (message.senderUserId === currentUserId) {
    return unblocked;
  }

  if (message.thread.deliveryKind === MailDeliveryKind.MASS_INTERNAL || message.recipients.length > 1) {
    return unblocked.filter((recipient) => recipient.userId === currentUserId);
  }

  return unblocked.filter(
    (recipient) => recipient.userId === currentUserId || recipient.type !== MailRecipientType.BCC
  );
}

function toMessageView(
  currentUserId: string,
  message: MailMessageForView,
  blockedUserIds: Set<string>
): MailMessageView {
  return {
    id: message.id,
    subject: message.subject,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    createdAt: message.createdAt.toISOString(),
    sender: toPersonView(message.sender, currentUserId),
    recipients: visibleRecipientsForViewer(currentUserId, message, blockedUserIds).map((recipient) =>
      toRecipientView(recipient, currentUserId)
    ),
    attachments: message.attachments.map(toAttachmentView)
  };
}

function previewText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function toThreadSummary(
  currentUserId: string,
  message: MailSummaryMessage,
  blockedUserIds: Set<string>
): MailThreadSummaryView {
  const recipientForCurrentUser = message.recipients.find((recipient) => recipient.userId === currentUserId);

  return {
    id: message.threadId,
    subject: message.thread.subject,
    deliveryKind: message.thread.deliveryKind,
    lastMessageAt: message.thread.lastMessageAt?.toISOString(),
    unread: Boolean(recipientForCurrentUser && !recipientForCurrentUser.readAt),
    preview: previewText(message.bodyText),
    sender: toPersonView(message.sender, currentUserId),
    recipients: visibleRecipientsForViewer(currentUserId, message, blockedUserIds).map((recipient) =>
      toRecipientView(recipient, currentUserId)
    )
  };
}

type MailThreadCursor = {
  updatedAt: Date;
  id: string;
};

const MAIL_THREAD_CURSOR_PREFIX = "mail-thread-v1.";

function encodeMailThreadCursor(thread: MailThreadCursor) {
  return `${MAIL_THREAD_CURSOR_PREFIX}${Buffer.from(JSON.stringify([thread.updatedAt.toISOString(), thread.id]), "utf8").toString("base64url")}`;
}

function decodeMailThreadCursor(value: string): MailThreadCursor | null {
  if (!value.startsWith(MAIL_THREAD_CURSOR_PREFIX)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(value.slice(MAIL_THREAD_CURSOR_PREFIX.length), "base64url").toString("utf8")
    ) as unknown;
    if (!Array.isArray(decoded) || decoded.length !== 2) return null;
    const [rawUpdatedAt, rawId] = decoded;
    const id = typeof rawId === "string" ? rawId.trim() : "";
    const updatedAt = typeof rawUpdatedAt === "string" ? new Date(rawUpdatedAt) : new Date(Number.NaN);
    if (!id || id.length > 64 || Number.isNaN(updatedAt.getTime())) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

function descendingMailThreadCursorWhere(cursor: MailThreadCursor | null) {
  if (!cursor) return {};
  return {
    OR: [
      { updatedAt: { lt: cursor.updatedAt } },
      { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }
    ]
  };
}

async function getMailPolicyConfig() {
  return prisma.mailPolicyConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" }
  });
}

async function getMassRecipientCap(userId: string) {
  const [user, config] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { membership: true }
    }),
    getMailPolicyConfig()
  ]);

  if (!user) return 1;
  if (isAdminRole(user.role)) return config.adminMassRecipientCap;
  if (user.membership?.tier === MembershipTier.ORG) return config.professionalMassRecipientCap;

  return user.membership?.tier === MembershipTier.PROFESSIONAL ? config.professionalMassRecipientCap : 1;
}

async function getSenderTier(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      membership: {
        select: {
          tier: true
        }
      }
    }
  });

  return isAdminRole(user?.role) ? MembershipTier.PROFESSIONAL : user?.membership?.tier ?? MembershipTier.FREE;
}

function boundedPageSize(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_MAIL_PAGE_SIZE;
  return Math.min(MAX_MAIL_PAGE_SIZE, Math.max(1, Math.trunc(value ?? DEFAULT_MAIL_PAGE_SIZE)));
}

function visibleMessageWhere(userId: string, blockedUserIds: Set<string>, threadId?: string): Prisma.MailMessageWhereInput {
  return {
    ...(threadId ? { threadId } : {}),
    deletedAt: null,
    OR: [
      { senderUserId: userId },
      {
        senderUserId: { notIn: [...blockedUserIds] },
        recipients: {
          some: {
            userId,
            deletedAt: null
          }
        }
      }
    ]
  };
}

async function blockedUserIdsFor(userId: string) {
  const relationships = await prisma.socialRelationship.findMany({
    where: {
      type: SocialRelationshipType.BLOCK,
      OR: [{ fromUserId: userId }, { toUserId: userId }]
    },
    select: {
      fromUserId: true,
      toUserId: true
    }
  });

  return new Set(
    relationships.map((relationship) =>
      relationship.fromUserId === userId ? relationship.toUserId : relationship.fromUserId
    )
  );
}

async function getAccessibleThread(userId: string, threadId: string, blockedUserIds: Set<string>) {
  return prisma.mailThread.findFirst({
    where: {
      id: threadId,
      messages: {
        some: visibleMessageWhere(userId, blockedUserIds)
      }
    },
    select: {
      id: true,
      subject: true,
      deliveryKind: true
    }
  });
}

async function allowedRecipientsForMassMail(senderUserId: string, recipientUserIds: string[]) {
  const [preferences, optOuts] = await Promise.all([
    prisma.mailPreference.findMany({
      where: {
        userId: { in: recipientUserIds },
        allowMassMail: false
      },
      select: { userId: true }
    }),
    prisma.mailSenderOptOut.findMany({
      where: {
        ownerUserId: { in: recipientUserIds },
        senderUserId
      },
      select: { ownerUserId: true }
    })
  ]);
  const blocked = new Set([...preferences.map((item) => item.userId), ...optOuts.map((item) => item.ownerUserId)]);

  return recipientUserIds.filter((recipientUserId) => !blocked.has(recipientUserId));
}

async function allowedRecipientsForOrgMassMail(senderUserId: string, recipientUserIds: string[]) {
  const profile = await prisma.businessProfile.findUnique({
    where: { ownerUserId: senderUserId },
    select: {
      businessName: true
    }
  });

  if (!profile) return [];

  const [parishioners, eventRsvps] = await Promise.all([
    prisma.scientologyProfile.findMany({
      where: {
        userId: { in: recipientUserIds },
        orgName: {
          equals: profile.businessName,
          mode: "insensitive"
        }
      },
      select: {
        userId: true
      }
    }),
    prisma.eventRsvp.findMany({
      where: {
        userId: { in: recipientUserIds },
        event: {
          createdByUserId: senderUserId
        }
      },
      select: {
        userId: true
      }
    })
  ]);

  const allowed = new Set<string>();
  for (const item of parishioners) allowed.add(item.userId);
  for (const item of eventRsvps) {
    if (item.userId) allowed.add(item.userId);
  }

  return recipientUserIds.filter((recipientUserId) => allowed.has(recipientUserId));
}

async function upsertMailContacts(ownerUserId: string, contactUserIds: string[]) {
  await Promise.all(
    contactUserIds.map((contactUserId) =>
      prisma.mailContact.upsert({
        where: {
          ownerUserId_contactUserId: {
            ownerUserId,
            contactUserId
          }
        },
        update: {
          source: "sent-mail"
        },
        create: {
          ownerUserId,
          contactUserId,
          source: "sent-mail"
        }
      })
    )
  );
}

export async function listMailThreadsPage(
  userId: string,
  folderInput: string | null = "inbox",
  options: { cursor?: string | null; limit?: number } = {}
): Promise<MailThreadPageView> {
  const folder = mailFolderSchema.catch("inbox").parse(folderInput ?? "inbox");
  const limit = boundedPageSize(options.limit);
  const blockedUserIds = await blockedUserIdsFor(userId);

  if (folder === "sent") {
    const stableCursor = options.cursor ? decodeMailThreadCursor(options.cursor) : null;
    const legacyCursor = options.cursor && !stableCursor
      ? await prisma.mailMessage.findFirst({
          where: {
            id: options.cursor,
            senderUserId: userId,
            deletedAt: null
          },
          select: {
            thread: {
              select: { id: true, updatedAt: true }
            }
          }
        })
      : null;

    if (options.cursor && !stableCursor && !legacyCursor) {
      return { threads: [], nextCursor: null };
    }
    const cursor = stableCursor ?? legacyCursor?.thread ?? null;
    const sentMessageWhere: Prisma.MailMessageWhereInput = {
      senderUserId: userId,
      deletedAt: null
    };

    const threads = await withMailDbTimeout(
      prisma.mailThread.findMany({
        where: {
          messages: { some: sentMessageWhere },
          ...descendingMailThreadCursorWhere(cursor)
        },
        select: {
          id: true,
          updatedAt: true,
          messages: {
            where: sentMessageWhere,
            select: mailSummaryMessageSelect,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1
          }
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit + 1
      }),
      "sent mail lookup"
    );
    const hasMore = threads.length > limit;
    const pageThreads = threads.slice(0, limit);

    return {
      threads: pageThreads.flatMap((thread) => {
        const message = thread.messages[0];
        return message ? [toThreadSummary(userId, message, blockedUserIds)] : [];
      }),
      nextCursor: hasMore && pageThreads.at(-1) ? encodeMailThreadCursor(pageThreads.at(-1)!) : null
    };
  }

  const recipientStateWhere: Prisma.MailRecipientWhereInput = {
    userId,
    deletedAt: null,
    ...(folder === "archive" ? { archivedAt: { not: null } } : { archivedAt: null })
  };
  const visibleFolderMessageWhere: Prisma.MailMessageWhereInput = {
    deletedAt: null,
    senderUserId: { notIn: [...blockedUserIds] },
    recipients: { some: recipientStateWhere }
  };
  const stableCursor = options.cursor ? decodeMailThreadCursor(options.cursor) : null;
  const legacyCursor = options.cursor && !stableCursor
    ? await prisma.mailRecipient.findFirst({
        where: {
          ...recipientStateWhere,
          id: options.cursor,
          message: visibleFolderMessageWhere
        },
        select: {
          message: {
            select: {
              thread: {
                select: { id: true, updatedAt: true }
              }
            }
          }
        }
      })
    : null;

  if (options.cursor && !stableCursor && !legacyCursor) {
    return { threads: [], nextCursor: null };
  }
  const cursor = stableCursor ?? legacyCursor?.message.thread ?? null;

  const threads = await withMailDbTimeout(
    prisma.mailThread.findMany({
      where: {
        messages: { some: visibleFolderMessageWhere },
        ...descendingMailThreadCursorWhere(cursor)
      },
      select: {
        id: true,
        updatedAt: true,
        messages: {
          where: visibleFolderMessageWhere,
          select: mailSummaryMessageSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1
        }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1
    }),
    `${folder} mail lookup`
  );
  const hasMore = threads.length > limit;
  const pageThreads = threads.slice(0, limit);

  return {
    threads: pageThreads.flatMap((thread) => {
      const message = thread.messages[0];
      return message ? [toThreadSummary(userId, message, blockedUserIds)] : [];
    }),
    nextCursor: hasMore && pageThreads.at(-1) ? encodeMailThreadCursor(pageThreads.at(-1)!) : null
  };
}

export async function listMailThreads(userId: string, folderInput: string | null = "inbox") {
  return (await listMailThreadsPage(userId, folderInput, { limit: MAX_MAIL_PAGE_SIZE })).threads;
}

export async function safeListMailThreads(userId: string, folder: MailFolder = "inbox") {
  try {
    return await listMailThreads(userId, folder);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list mail threads.", {
      userId,
      folder,
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function getMailThread(
  userId: string,
  threadId: string,
  options: { cursor?: string | null; limit?: number } = {}
) {
  const blockedUserIds = await blockedUserIdsFor(userId);
  const limit = boundedPageSize(options.limit);
  const messageWhere = visibleMessageWhere(userId, blockedUserIds, threadId);
  const cursorRecord = options.cursor
    ? await prisma.mailMessage.findFirst({
        where: {
          ...messageWhere,
          id: options.cursor
        },
        select: { id: true }
      })
    : null;

  if (options.cursor && !cursorRecord) {
    return { ok: false as const, error: "Mail thread not found." };
  }

  const messages = await prisma.mailMessage.findMany({
    where: messageWhere,
    include: {
      thread: true,
      sender: {
        include: {
          profile: true
        }
      },
      recipients: {
        include: {
          user: {
            include: {
              profile: true
            }
          }
        }
      },
      attachments: {
        include: {
          mediaAsset: true
        }
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursorRecord ? { cursor: { id: cursorRecord.id }, skip: 1 } : {}),
    take: limit + 1
  });

  if (messages.length === 0) {
    return { ok: false as const, error: "Mail thread not found." };
  }

  const hasMore = messages.length > limit;
  const pageMessages = messages.slice(0, limit);
  const summary = toThreadSummary(userId, pageMessages[0], blockedUserIds);

  return {
    ok: true as const,
    thread: {
      ...summary,
      messages: [...pageMessages].reverse().map((message) => toMessageView(userId, message, blockedUserIds)),
      nextCursor: hasMore ? pageMessages[pageMessages.length - 1]?.id ?? null : null
    } satisfies MailThreadDetailView
  };
}

export async function sendMail(senderUserId: string, input: unknown) {
  if (!isInternalMailEnabled()) {
    return { ok: false as const, error: INTERNAL_MAIL_UNAVAILABLE_ERROR };
  }

  const parsed = sendMailSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid mail." };
  }

  const requestedRecipientIds = parsed.data.recipientUserIds.filter((recipientUserId) => recipientUserId !== senderUserId);

  if (requestedRecipientIds.length === 0) {
    return { ok: false as const, error: "Choose at least one recipient." };
  }

  const [massCap, senderTier, blockedUserIds] = await Promise.all([
    getMassRecipientCap(senderUserId),
    getSenderTier(senderUserId),
    blockedUserIdsFor(senderUserId)
  ]);
  const existingThread = parsed.data.threadId
    ? await getAccessibleThread(senderUserId, parsed.data.threadId, blockedUserIds)
    : null;

  if (parsed.data.threadId && !existingThread) {
    return { ok: false as const, error: "Mail thread not found." };
  }

  if (existingThread) {
    const existingParticipants = await prisma.user.findMany({
      where: {
        id: { in: requestedRecipientIds },
        OR: [
          {
            sentMailMessages: {
              some: {
                threadId: existingThread.id,
                deletedAt: null
              }
            }
          },
          {
            mailRecipients: {
              some: {
                deletedAt: null,
                message: {
                  threadId: existingThread.id,
                  deletedAt: null
                }
              }
            }
          }
        ]
      },
      select: { id: true }
    });

    if (existingParticipants.length !== requestedRecipientIds.length) {
      return { ok: false as const, error: "Mail thread not found." };
    }
  }

  const deliveryKind =
    existingThread?.deliveryKind ??
    (requestedRecipientIds.length > 1
      ? MailDeliveryKind.MASS_INTERNAL
      : parsed.data.deliveryKind ?? MailDeliveryKind.DIRECT);

  if (!existingThread && deliveryKind === MailDeliveryKind.INQUIRY) {
    return { ok: false as const, error: "Inquiry mail can only be created from storefront inquiries." };
  }

  if (deliveryKind === MailDeliveryKind.MASS_INTERNAL && requestedRecipientIds.length > massCap) {
    return { ok: false as const, error: `This account can send internal mass mail to ${massCap} recipients at a time.` };
  }

  if (requestedRecipientIds.length > 1 && massCap < requestedRecipientIds.length) {
    return { ok: false as const, error: "Upgrade or reduce recipients to send to multiple people." };
  }

  const recipients = await prisma.user.findMany({
    where: {
      id: { in: requestedRecipientIds },
      deactivatedAt: null
    },
    select: { id: true }
  });

  if (recipients.length !== requestedRecipientIds.length) {
    return { ok: false as const, error: "One or more recipients are unavailable." };
  }

  let finalRecipientIds = requestedRecipientIds.filter((recipientUserId) => !blockedUserIds.has(recipientUserId));

  if (deliveryKind === MailDeliveryKind.MASS_INTERNAL || requestedRecipientIds.length > 1) {
    finalRecipientIds = await allowedRecipientsForMassMail(senderUserId, finalRecipientIds);
    if (senderTier === MembershipTier.ORG) {
      finalRecipientIds = await allowedRecipientsForOrgMassMail(senderUserId, finalRecipientIds);
    }
  }

  if (finalRecipientIds.length === 0) {
    return { ok: false as const, error: "One or more recipients are unavailable." };
  }

  const mediaAssetIds = parsed.data.attachments.map((attachment) => attachment.mediaAssetId).filter(Boolean) as string[];
  const uniqueMediaAssetIds = [...new Set(mediaAssetIds)];

  if (mediaAssetIds.length !== parsed.data.attachments.length || uniqueMediaAssetIds.length !== mediaAssetIds.length) {
    return { ok: false as const, error: "One or more attachments could not be used." };
  }

  const mediaAssets = mediaAssetIds.length
    ? await prisma.mediaAsset.findMany({
        where: {
          id: { in: uniqueMediaAssetIds },
          ownerUserId: senderUserId,
          status: MediaAssetStatus.READY
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

  if (
    mediaAssets.length !== uniqueMediaAssetIds.length ||
    parsed.data.attachments.some((attachment) => {
      const mediaAsset = attachment.mediaAssetId ? mediaAssetMap.get(attachment.mediaAssetId) : null;
      return (
        !mediaAsset ||
        mediaAsset.mimeType !== attachment.mimeType ||
        mediaAsset.sizeBytes !== BigInt(attachment.sizeBytes)
      );
    })
  ) {
    return { ok: false as const, error: "One or more attachments could not be used." };
  }

  const threadSubject = existingThread?.subject ?? parsed.data.subject;
  let message: MailMessageForView;

  try {
    const creation = await withMediaAssetReferenceValidation(() => prisma.$transaction(async (tx) => {
      const thread = existingThread
        ? await tx.mailThread.findFirst({
            where: {
              id: existingThread.id,
              messages: {
                some: visibleMessageWhere(senderUserId, blockedUserIds)
              }
            }
          })
        : await tx.mailThread.create({
          data: {
            subject: threadSubject,
            deliveryKind,
            createdByUserId: senderUserId
          }
        });

      if (!thread) {
        throw new MailAccessError();
      }

      await lockReadyMediaAssetsForReference(tx, uniqueMediaAssetIds);

      const created = await tx.mailMessage.create({
        data: {
          threadId: thread.id,
          senderUserId,
          subject: threadSubject,
          bodyText: parsed.data.bodyText,
          bodyHtml: parsed.data.bodyHtml || null,
          recipients: {
            create: finalRecipientIds.map((userId) => ({
              userId,
              type: MailRecipientType.TO
            }))
          },
          attachments: {
            create: parsed.data.attachments.map((attachment) => {
              const mediaAsset = attachment.mediaAssetId ? mediaAssetMap.get(attachment.mediaAssetId) : undefined;

              if (!mediaAsset) {
                throw new MailAccessError();
              }

              return {
                mediaAssetId: mediaAsset.id,
                kind: attachmentKindForMime(mediaAsset.mimeType),
                fileName: mediaAsset.originalName ?? attachment.fileName,
                mimeType: mediaAsset.mimeType,
                sizeBytes: mediaAsset.sizeBytes,
                storageKey: mediaAsset.storageKey,
                publicUrl: mediaAsset.publicUrl
              };
            })
          }
        },
        include: {
          thread: true,
          sender: {
            include: {
              profile: true
            }
          },
          recipients: {
            include: {
              user: {
                include: {
                  profile: true
                }
              }
            }
          },
          attachments: {
            include: {
              mediaAsset: true
            }
          }
        }
      });

      await tx.mailThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: created.createdAt
        }
      });

      return created;
    }));
    if (!creation.ok) return creation;
    message = creation.value;
  } catch (error) {
    if (error instanceof MailAccessError) {
      return { ok: false as const, error: "Mail thread not found." };
    }
    throw error;
  }

  await upsertMailContacts(senderUserId, finalRecipientIds);

  await prisma.notification.createMany({
    data: finalRecipientIds.map((userId) => ({
      userId,
      title: `New mail from ${toPersonView(message.sender, senderUserId).displayName}`,
      body: message.subject,
      href: `/mail?thread=${message.threadId}`
    }))
  });

  await diagnostics.info(MODULE_KEY, "Mail sent.", {
    senderUserId,
    threadId: message.threadId,
    recipientCount: finalRecipientIds.length,
    requestedRecipientCount: requestedRecipientIds.length,
    deliveryKind
  });

  return {
    ok: true as const,
    thread: {
      ...toThreadSummary(senderUserId, message, blockedUserIds),
      messages: [toMessageView(senderUserId, message, blockedUserIds)]
    } satisfies MailThreadDetailView
  };
}

export async function markMailThreadRead(userId: string, threadId: string) {
  const blockedUserIds = await blockedUserIdsFor(userId);

  const updated = await prisma.mailRecipient.updateMany({
    where: {
      userId,
      deletedAt: null,
      message: {
        threadId,
        deletedAt: null,
        senderUserId: { notIn: [...blockedUserIds] }
      },
      readAt: null
    },
    data: {
      readAt: new Date()
    }
  });

  if (updated.count === 0 && !(await getAccessibleThread(userId, threadId, blockedUserIds))) {
    return { ok: false as const, error: "Mail thread not found." };
  }

  return { ok: true as const };
}

export async function setMailThreadArchived(userId: string, threadId: string, archived: boolean) {
  const blockedUserIds = await blockedUserIdsFor(userId);
  const updated = await prisma.mailRecipient.updateMany({
    where: {
      userId,
      deletedAt: null,
      message: {
        threadId,
        deletedAt: null,
        senderUserId: { notIn: [...blockedUserIds] }
      }
    },
    data: {
      archivedAt: archived ? new Date() : null
    }
  });

  if (updated.count === 0) {
    return { ok: false as const, error: "Mail thread not found." };
  }

  return { ok: true as const };
}

export async function deleteMailThread(userId: string, threadId: string) {
  const blockedUserIds = await blockedUserIdsFor(userId);
  const updated = await prisma.mailRecipient.updateMany({
    where: {
      userId,
      deletedAt: null,
      message: {
        threadId,
        deletedAt: null,
        senderUserId: { notIn: [...blockedUserIds] }
      }
    },
    data: {
      archivedAt: null,
      deletedAt: new Date()
    }
  });

  if (updated.count === 0) {
    return { ok: false as const, error: "Mail thread not found." };
  }

  return { ok: true as const };
}

export async function getMailAttachment(userId: string, attachmentId: string) {
  const blockedUserIds = await blockedUserIdsFor(userId);
  const attachment = await prisma.mailAttachment.findFirst({
    where: {
      id: attachmentId,
      message: visibleMessageWhere(userId, blockedUserIds)
    },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      storageKey: true,
      mediaAsset: {
        select: {
          storageKey: true
        }
      }
    }
  });
  const storageKey = attachment?.storageKey ?? attachment?.mediaAsset?.storageKey;

  if (!attachment || !storageKey) {
    return { ok: false as const, error: "Mail attachment not found." };
  }

  return {
    ok: true as const,
    attachment: {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      storageKey
    }
  };
}

export async function searchMailContacts(userId: string, query: string): Promise<MailPersonView[]> {
  const cleanQuery = query.trim().slice(0, 100);
  const blockedUserIds = await blockedUserIdsFor(userId);

  if (!cleanQuery) {
    const contacts = await prisma.mailContact.findMany({
      where: {
        ownerUserId: userId,
        contactUserId: { notIn: [...blockedUserIds] },
        contactUser: {
          deactivatedAt: null
        }
      },
      include: {
        contactUser: {
          include: {
            profile: true
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 15
    });

    return contacts.map((contact) => toPersonView(contact.contactUser, userId));
  }

  if (cleanQuery.length < 2) return [];

  const identityFilters: Prisma.UserWhereInput[] = [
    { username: { contains: cleanQuery, mode: "insensitive" } },
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
  ];

  if (cleanQuery.includes("@")) {
    identityFilters.push({ email: { equals: cleanQuery.toLowerCase() } });
  }

  const users = await withMailDbTimeout(
    prisma.user.findMany({
      where: {
        id: { notIn: [userId, ...blockedUserIds] },
        deactivatedAt: null,
        OR: identityFilters
      },
      include: {
        profile: true
      },
      orderBy: { username: "asc" },
      take: 15
    }),
    "mail contact search"
  );

  return users.map((user) => toPersonView(user, userId));
}

export async function getMailPreference(userId: string): Promise<MailPreferenceView> {
  const preference = await prisma.mailPreference.upsert({
    where: { userId },
    update: {},
    create: { userId }
  });

  return {
    allowMassMail: preference.allowMassMail
  };
}

export async function updateMailPreference(userId: string, input: unknown) {
  const parsed = updateMailPreferenceSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid mail preference." };
  }

  const preference = await prisma.mailPreference.upsert({
    where: { userId },
    update: {
      allowMassMail: parsed.data.allowMassMail
    },
    create: {
      userId,
      allowMassMail: parsed.data.allowMassMail
    }
  });

  return { ok: true as const, preference: { allowMassMail: preference.allowMassMail } };
}

export async function createMailUploadIntent(userId: string, input: unknown) {
  if (!isInternalMailEnabled()) {
    return { ok: false as const, error: INTERNAL_MAIL_UNAVAILABLE_ERROR };
  }

  const parsed = createMailUploadIntentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload." };
  }

  const result = await createUploadIntent(userId, {
    checksumSha256: parsed.data.checksumSha256,
    mimeType: parsed.data.mimeType,
    purpose: UploadIntentPurpose.MAIL_ATTACHMENT,
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

export async function completeMailUpload(userId: string, input: unknown) {
  if (!isInternalMailEnabled()) {
    return { ok: false as const, error: INTERNAL_MAIL_UNAVAILABLE_ERROR };
  }

  const parsed = completeMailUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload completion." };
  }

  const verified = await completeUploadIntent(userId, { intentId: parsed.data.intentId });
  if (!verified.ok) return { ok: false as const, error: verified.error };

  const normalizedMimeType = parsed.data.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    verified.intent.purpose !== UploadIntentPurpose.MAIL_ATTACHMENT ||
    verified.intent.visibility !== MediaVisibility.PRIVATE ||
    verified.intent.mimeType !== normalizedMimeType ||
    verified.intent.sizeBytes !== String(parsed.data.sizeBytes) ||
    (parsed.data.storageKey && parsed.data.storageKey !== verified.intent.storageKey)
  ) {
    return { ok: false as const, error: "Upload intent did not match this mail attachment." };
  }

  let consumed;
  try {
    consumed = await consumeVerifiedUploadIntent({
      ownerUserId: userId,
      intentId: parsed.data.intentId,
      purpose: UploadIntentPurpose.MAIL_ATTACHMENT,
      consume: async (transaction, intent) => {
        if (
          intent.ownerUserId !== userId ||
          intent.purpose !== UploadIntentPurpose.MAIL_ATTACHMENT ||
          intent.visibility !== MediaVisibility.PRIVATE ||
          intent.declaredMimeType !== normalizedMimeType ||
          intent.declaredSizeBytes !== BigInt(parsed.data.sizeBytes)
        ) {
          throw new Error("Mail upload intent contract changed during consumption.");
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
              attachmentKind: attachmentKindForMime(intent.declaredMimeType)
            }
          }
        });
      }
    });
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not consume verified mail upload intent.", {
      userId,
      intentId: parsed.data.intentId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Mail attachment could not be finalized." };
  }

  if (!consumed.ok) return { ok: false as const, error: consumed.error };
  const asset = consumed.value;

  await diagnostics.info(MODULE_KEY, "Mail attachment upload completed.", {
    userId,
    mediaAssetId: asset.id,
    storageKey: asset.storageKey
  });

  return {
    ok: true as const,
    intentId: parsed.data.intentId,
    attachment: {
      mediaAssetId: asset.id,
      kind: attachmentKindForMime(asset.mimeType),
      fileName: asset.originalName ?? parsed.data.fileName,
      mimeType: asset.mimeType,
      sizeBytes: Number(asset.sizeBytes),
      storageKey: asset.storageKey,
      publicUrl: `/api/media/assets/${asset.id}`
    }
  };
}

export async function countUnreadMail(userId?: string) {
  if (!isInternalMailEnabled()) return 0;
  if (!userId) return 0;

  try {
    const blockedUserIds = await blockedUserIdsFor(userId);
    return await withMailDbTimeout(
      prisma.mailRecipient.count({
        where: {
          userId,
          readAt: null,
          deletedAt: null,
          archivedAt: null,
          message: {
            deletedAt: null,
            senderUserId: { notIn: [...blockedUserIds] }
          }
        }
      }),
      "unread mail count"
    );
  } catch (error) {
    await diagnostics.warn(MODULE_KEY, "Could not count unread mail.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return 0;
  }
}
