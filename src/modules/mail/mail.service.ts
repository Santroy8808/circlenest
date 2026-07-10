import { randomBytes } from "crypto";
import {
  MailAttachmentKind,
  MailDeliveryKind,
  MailRecipientType,
  MediaAssetStatus,
  MediaVisibility,
  MembershipTier,
  Prisma,
  SocialRelationshipType,
  UserRole
} from "@prisma/client";
import { createPresignedR2PutUrl, verifyR2Object } from "@/lib/platform/r2";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
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

const MODULE_KEY = "mail";
const MAIL_DB_TIMEOUT_MS = 2500;
const DEFAULT_MAIL_PAGE_SIZE = 30;
const MAX_MAIL_PAGE_SIZE = 50;

class MailAccessError extends Error {}

function withMailDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), MAIL_DB_TIMEOUT_MS);
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
  return mimeType.startsWith("image/") ? MailAttachmentKind.IMAGE : MailAttachmentKind.FILE;
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

function uniqueThreadSummaries(items: MailThreadSummaryView[]) {
  const seen = new Set<string>();
  const output: MailThreadSummaryView[] = [];

  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      output.push(item);
    }
  }

  return output;
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
    const cursorRecord = options.cursor
      ? await prisma.mailMessage.findFirst({
          where: {
            id: options.cursor,
            senderUserId: userId,
            deletedAt: null
          },
          select: { id: true }
        })
      : null;

    if (options.cursor && !cursorRecord) {
      return { threads: [], nextCursor: null };
    }

    const messages = await withMailDbTimeout(
      prisma.mailMessage.findMany({
        where: {
          senderUserId: userId,
          deletedAt: null
        },
        select: mailSummaryMessageSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...(cursorRecord ? { cursor: { id: cursorRecord.id }, skip: 1 } : {}),
        take: limit + 1
      }),
      "sent mail lookup"
    );
    const hasMore = messages.length > limit;
    const pageMessages = messages.slice(0, limit);

    return {
      threads: uniqueThreadSummaries(
        pageMessages.map((message) => toThreadSummary(userId, message, blockedUserIds))
      ),
      nextCursor: hasMore ? pageMessages[pageMessages.length - 1]?.id ?? null : null
    };
  }

  const recipientWhere: Prisma.MailRecipientWhereInput = {
    userId,
    deletedAt: null,
    ...(folder === "archive" ? { archivedAt: { not: null } } : { archivedAt: null }),
    message: {
      deletedAt: null,
      senderUserId: { notIn: [...blockedUserIds] }
    }
  };
  const cursorRecord = options.cursor
    ? await prisma.mailRecipient.findFirst({
        where: {
          ...recipientWhere,
          id: options.cursor
        },
        select: { id: true }
      })
    : null;

  if (options.cursor && !cursorRecord) {
    return { threads: [], nextCursor: null };
  }

  const recipients = await withMailDbTimeout(
    prisma.mailRecipient.findMany({
      where: recipientWhere,
      select: {
        id: true,
        message: {
          select: mailSummaryMessageSelect
        }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursorRecord ? { cursor: { id: cursorRecord.id }, skip: 1 } : {}),
      take: limit + 1
    }),
    `${folder} mail lookup`
  );
  const hasMore = recipients.length > limit;
  const pageRecipients = recipients.slice(0, limit);

  return {
    threads: uniqueThreadSummaries(
      pageRecipients.map((recipient) => toThreadSummary(userId, recipient.message, blockedUserIds))
    ),
    nextCursor: hasMore ? pageRecipients[pageRecipients.length - 1]?.id ?? null : null
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
    message = await prisma.$transaction(async (tx) => {
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
    });
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
  const parsed = createMailUploadIntentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload." };
  }

  const storageKey = [
    "users",
    userId,
    "mail",
    dateSlug(),
    `${randomBytes(8).toString("hex")}-${safeFileName(parsed.data.fileName)}`
  ].join("/");

  try {
    const uploadUrl = await createPresignedR2PutUrl({
      storageKey,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      access: "private"
    });

    return {
      ok: true as const,
      uploadUrl,
      storageKey,
      publicUrl: null,
      expiresInSeconds: 300
    };
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not create mail upload intent.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Media storage is not configured." };
  }
}

export async function completeMailUpload(userId: string, input: unknown) {
  const parsed = completeMailUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload completion." };
  }

  const expectedPrefix = ["users", userId, "mail"].join("/") + "/";
  if (!parsed.data.storageKey.startsWith(expectedPrefix)) {
    return { ok: false as const, error: "Invalid mail upload key." };
  }

  const uploadedObject = await verifyR2Object({
    storageKey: parsed.data.storageKey,
    expectedMimeType: parsed.data.mimeType,
    expectedSizeBytes: parsed.data.sizeBytes,
    access: "private",
    label: "Mail attachment upload"
  });

  if (!uploadedObject.ok) {
    return { ok: false as const, error: uploadedObject.error };
  }

  const publicUrl = null;
  const asset = await prisma.mediaAsset.create({
    data: {
      ownerUserId: userId,
      storageKey: parsed.data.storageKey,
      publicUrl,
      mimeType: parsed.data.mimeType,
      sizeBytes: BigInt(parsed.data.sizeBytes),
      originalName: parsed.data.fileName,
      visibility: MediaVisibility.PRIVATE,
      metadata: {
        module: MODULE_KEY,
        attachmentKind: attachmentKindForMime(parsed.data.mimeType)
      }
    }
  });

  await diagnostics.info(MODULE_KEY, "Mail attachment upload completed.", {
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
      publicUrl: `/api/media/assets/${asset.id}`
    }
  };
}

export async function countUnreadMail(userId?: string) {
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
