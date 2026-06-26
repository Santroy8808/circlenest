import { randomBytes } from "crypto";
import {
  MailAttachmentKind,
  MailDeliveryKind,
  MailRecipientType,
  MediaVisibility,
  MembershipTier,
  Prisma,
  SocialRelationshipType,
  UserRole
} from "@prisma/client";
import { createPresignedR2PutUrl, getR2PublicUrl } from "@/lib/platform/r2";
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
  type MailThreadSummaryView
} from "@/modules/mail/types";

const MODULE_KEY = "mail";
const MAIL_DB_TIMEOUT_MS = 2500;

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

function toPersonView(user: {
  id: string;
  email: string;
  username: string;
  profile: { displayName: string | null; avatarUrl: string | null; tagline: string | null } | null;
}): MailPersonView {
  return {
    id: user.id,
    email: user.email,
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
    publicUrl: attachment.publicUrl ?? attachment.mediaAsset?.publicUrl,
    mediaAssetId: attachment.mediaAssetId
  };
}

function toRecipientView(
  recipient: Prisma.MailRecipientGetPayload<{ include: { user: { include: { profile: true } } } }>
): MailRecipientView {
  return {
    id: recipient.id,
    type: recipient.type,
    readAt: recipient.readAt?.toISOString(),
    user: toPersonView(recipient.user)
  };
}

function toMessageView(
  message: Prisma.MailMessageGetPayload<{
    include: {
      sender: { include: { profile: true } };
      recipients: { include: { user: { include: { profile: true } } } };
      attachments: { include: { mediaAsset: true } };
    };
  }>
): MailMessageView {
  return {
    id: message.id,
    subject: message.subject,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    createdAt: message.createdAt.toISOString(),
    sender: toPersonView(message.sender),
    recipients: message.recipients.map(toRecipientView),
    attachments: message.attachments.map(toAttachmentView)
  };
}

function previewText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function toThreadSummary(
  currentUserId: string,
  message: Prisma.MailMessageGetPayload<{
    include: {
      thread: true;
      sender: { include: { profile: true } };
      recipients: { include: { user: { include: { profile: true } } } };
      attachments: { include: { mediaAsset: true } };
    };
  }>
): MailThreadSummaryView {
  const recipientForCurrentUser = message.recipients.find((recipient) => recipient.userId === currentUserId);

  return {
    id: message.threadId,
    subject: message.thread.subject,
    deliveryKind: message.thread.deliveryKind,
    lastMessageAt: message.thread.lastMessageAt?.toISOString(),
    unread: Boolean(recipientForCurrentUser && !recipientForCurrentUser.readAt),
    preview: previewText(message.bodyText),
    sender: toPersonView(message.sender),
    recipients: message.recipients.map(toRecipientView)
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

async function assertThreadAccess(userId: string, threadId: string) {
  const thread = await prisma.mailThread.findFirst({
    where: {
      id: threadId,
      messages: {
        some: {
          OR: [
            { senderUserId: userId },
            {
              recipients: {
                some: {
                  userId,
                  deletedAt: null
                }
              }
            }
          ]
        }
      }
    },
    select: { id: true }
  });

  return Boolean(thread);
}

async function blockedRecipientIds(senderUserId: string, recipientUserIds: string[]) {
  const relationships = await prisma.socialRelationship.findMany({
    where: {
      type: SocialRelationshipType.BLOCK,
      OR: [
        { fromUserId: senderUserId, toUserId: { in: recipientUserIds } },
        { fromUserId: { in: recipientUserIds }, toUserId: senderUserId }
      ]
    },
    select: {
      fromUserId: true,
      toUserId: true
    }
  });

  return new Set(
    relationships.map((relationship) =>
      relationship.fromUserId === senderUserId ? relationship.toUserId : relationship.fromUserId
    )
  );
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

export async function listMailThreads(userId: string, folderInput: string | null = "inbox") {
  const folder = mailFolderSchema.catch("inbox").parse(folderInput ?? "inbox");

  if (folder === "sent") {
    const messages = await withMailDbTimeout(
      prisma.mailMessage.findMany({
        where: {
          senderUserId: userId,
          deletedAt: null
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
        },
        orderBy: { createdAt: "desc" },
        take: 60
      }),
      "sent mail lookup"
    );

    return uniqueThreadSummaries(messages.map((message) => toThreadSummary(userId, message)));
  }

  const recipientWhere =
    folder === "archive"
      ? { userId, deletedAt: null, archivedAt: { not: null } }
      : { userId, deletedAt: null, archivedAt: null };

  const recipients = await withMailDbTimeout(
    prisma.mailRecipient.findMany({
      where: recipientWhere,
      include: {
        message: {
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
        }
      },
      orderBy: { createdAt: "desc" },
      take: 60
    }),
    `${folder} mail lookup`
  );

  return uniqueThreadSummaries(recipients.map((recipient) => toThreadSummary(userId, recipient.message)));
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

export async function getMailThread(userId: string, threadId: string) {
  if (!(await assertThreadAccess(userId, threadId))) {
    return { ok: false as const, error: "Mail thread not found." };
  }

  const thread = await prisma.mailThread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
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
      }
    }
  });

  if (!thread || thread.messages.length === 0) {
    return { ok: false as const, error: "Mail thread not found." };
  }

  const latest = thread.messages[thread.messages.length - 1];
  const summary = toThreadSummary(userId, latest);

  return {
    ok: true as const,
    thread: {
      ...summary,
      messages: thread.messages.map(toMessageView)
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

  const deliveryKind =
    parsed.data.deliveryKind ?? (requestedRecipientIds.length > 1 ? MailDeliveryKind.MASS_INTERNAL : MailDeliveryKind.DIRECT);

  if (deliveryKind === MailDeliveryKind.INQUIRY) {
    return { ok: false as const, error: "Inquiry mail can only be created from storefront inquiries." };
  }

  const [massCap, senderTier] = await Promise.all([getMassRecipientCap(senderUserId), getSenderTier(senderUserId)]);

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
    return { ok: false as const, error: "One or more recipients could not be found." };
  }

  const blocked = await blockedRecipientIds(senderUserId, requestedRecipientIds);
  let finalRecipientIds = requestedRecipientIds.filter((recipientUserId) => !blocked.has(recipientUserId));

  if (deliveryKind === MailDeliveryKind.MASS_INTERNAL) {
    finalRecipientIds = await allowedRecipientsForMassMail(senderUserId, finalRecipientIds);
    if (senderTier === MembershipTier.ORG) {
      finalRecipientIds = await allowedRecipientsForOrgMassMail(senderUserId, finalRecipientIds);
    }
  }

  if (finalRecipientIds.length === 0) {
    return { ok: false as const, error: "No recipients are available for this mail." };
  }

  if (parsed.data.threadId && !(await assertThreadAccess(senderUserId, parsed.data.threadId))) {
    return { ok: false as const, error: "Mail thread not found." };
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
    const thread = parsed.data.threadId
      ? await tx.mailThread.update({
          where: { id: parsed.data.threadId },
          data: {
            subject: parsed.data.subject,
            deliveryKind
          }
        })
      : await tx.mailThread.create({
          data: {
            subject: parsed.data.subject,
            deliveryKind,
            createdByUserId: senderUserId
          }
        });

    const created = await tx.mailMessage.create({
      data: {
        threadId: thread.id,
        senderUserId,
        subject: parsed.data.subject,
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

  await upsertMailContacts(senderUserId, finalRecipientIds);

  await prisma.notification.createMany({
    data: finalRecipientIds.map((userId) => ({
      userId,
      title: `New mail from ${toPersonView(message.sender).displayName}`,
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
      ...toThreadSummary(senderUserId, message),
      messages: [toMessageView(message)]
    } satisfies MailThreadDetailView
  };
}

export async function markMailThreadRead(userId: string, threadId: string) {
  if (!(await assertThreadAccess(userId, threadId))) {
    return { ok: false as const, error: "Mail thread not found." };
  }

  await prisma.mailRecipient.updateMany({
    where: {
      userId,
      message: {
        threadId
      },
      readAt: null
    },
    data: {
      readAt: new Date()
    }
  });

  return { ok: true as const };
}

export async function searchMailContacts(userId: string, query: string): Promise<MailPersonView[]> {
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    const contacts = await prisma.mailContact.findMany({
      where: { ownerUserId: userId },
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

    return contacts.map((contact) => toPersonView(contact.contactUser));
  }

  const users = await withMailDbTimeout(
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
      take: 15
    }),
    "mail contact search"
  );

  return users.map(toPersonView);
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
      publicUrl: asset.publicUrl
    }
  };
}

export async function countUnreadMail(userId?: string) {
  if (!userId) return 0;

  try {
    return await withMailDbTimeout(
      prisma.mailRecipient.count({
        where: {
          userId,
          readAt: null,
          deletedAt: null,
          archivedAt: null
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
