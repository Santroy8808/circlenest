import { z } from "zod";
import {
  ChatThreadType,
  FeedVisibility,
  MailDeliveryKind,
  MailRecipientType,
  MembershipTier,
  Prisma,
  UserRole
} from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  announcementAudienceKinds,
  announcementDeliveryChannels,
  type AdminAnnouncementResult
} from "@/modules/admin-moderation/types";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import { isInternalMailEnabled } from "@/modules/mail/mail.service";

const MODULE_KEY = "admin-moderation";

const publicAnnouncementSchema = z.object({
  audienceKind: z.enum(announcementAudienceKinds),
  audienceValue: z.string().trim().max(2000).optional().or(z.literal("")),
  channels: z.array(z.enum(announcementDeliveryChannels)).min(1).max(5),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(10).max(4000),
  reason: z.string().trim().max(500).optional().or(z.literal(""))
});

function toAnnouncementResult(announcement: {
  id: string;
  title: string;
  recipientCount: number;
  chatDeliveryCount: number;
  mailDeliveryCount: number;
  popupDeliveryCount: number;
  globalPostDeliveryCount: number;
  personalEmailQueuedCount: number;
  feedPostId: string | null;
  dismissedAt: Date | null;
  dismissedByUserId: string | null;
  createdAt: Date;
}): AdminAnnouncementResult {
  return {
    id: announcement.id,
    title: announcement.title,
    recipientCount: announcement.recipientCount,
    chatDeliveryCount: announcement.chatDeliveryCount,
    mailDeliveryCount: announcement.mailDeliveryCount,
    popupDeliveryCount: announcement.popupDeliveryCount,
    globalPostDeliveryCount: announcement.globalPostDeliveryCount,
    personalEmailQueuedCount: announcement.personalEmailQueuedCount,
    feedPostId: announcement.feedPostId,
    dismissedAt: announcement.dismissedAt?.toISOString() ?? null,
    dismissedByUserId: announcement.dismissedByUserId,
    createdAt: announcement.createdAt.toISOString()
  };
}

function parseIdentifierList(value?: string) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

async function resolveAudience(input: z.infer<typeof publicAnnouncementSchema>) {
  const baseWhere: Prisma.UserWhereInput = {
    deactivatedAt: null
  };

  if (input.audienceKind === "ALL_ACTIVE") {
    return prisma.user.findMany({
      where: baseWhere,
      include: {
        profile: true,
        membership: true
      },
      orderBy: {
        username: "asc"
      },
      take: 1000
    });
  }

  if (input.audienceKind === "TIER") {
    const tier = z.nativeEnum(MembershipTier).safeParse(input.audienceValue);
    if (!tier.success) throw new Error("Choose a valid membership tier.");

    return prisma.user.findMany({
      where: {
        ...baseWhere,
        membership: {
          is: {
            tier: tier.data
          }
        }
      },
      include: {
        profile: true,
        membership: true
      },
      orderBy: {
        username: "asc"
      },
      take: 1000
    });
  }

  if (input.audienceKind === "ROLE") {
    const role = z.nativeEnum(UserRole).safeParse(input.audienceValue);
    if (!role.success) throw new Error("Choose a valid role.");

    return prisma.user.findMany({
      where: {
        ...baseWhere,
        role: role.data
      },
      include: {
        profile: true,
        membership: true
      },
      orderBy: {
        username: "asc"
      },
      take: 1000
    });
  }

  const identifiers = parseIdentifierList(input.audienceValue);
  if (identifiers.length === 0) throw new Error("Enter at least one email or username.");

  return prisma.user.findMany({
    where: {
      ...baseWhere,
      OR: [{ email: { in: identifiers } }, { username: { in: identifiers } }]
    },
    include: {
      profile: true,
      membership: true
    },
    orderBy: {
      username: "asc"
    },
    take: 1000
  });
}

async function deliverChat(actorUserId: string, title: string, body: string, recipientUserIds: string[]) {
  let count = 0;

  for (const recipientUserId of recipientUserIds.filter((userId) => userId !== actorUserId)) {
    const thread = await prisma.chatThread.create({
      data: {
        type: ChatThreadType.GROUP,
        title: `Announcement: ${title}`,
        createdByUserId: actorUserId,
        participants: {
          create: [
            {
              userId: actorUserId,
              lastReadAt: new Date()
            },
            {
              userId: recipientUserId
            }
          ]
        }
      }
    });

    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderUserId: actorUserId,
        body
      }
    });
    await prisma.chatThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date() }
    });
    count += 1;
  }

  return count;
}

async function deliverMail(actorUserId: string, title: string, body: string, recipientUserIds: string[]) {
  if (!isInternalMailEnabled()) return 0;
  if (recipientUserIds.length === 0) return 0;

  const thread = await prisma.mailThread.create({
    data: {
      subject: title,
      deliveryKind: MailDeliveryKind.MASS_INTERNAL,
      createdByUserId: actorUserId,
      messages: {
        create: {
          senderUserId: actorUserId,
          subject: title,
          bodyText: body,
          recipients: {
            create: recipientUserIds.map((userId) => ({
              userId,
              type: MailRecipientType.TO
            }))
          }
        }
      }
    },
    include: {
      messages: {
        select: {
          id: true,
          createdAt: true
        },
        take: 1
      }
    }
  });

  await prisma.mailThread.update({
    where: { id: thread.id },
    data: {
      lastMessageAt: thread.messages[0]?.createdAt ?? new Date()
    }
  });

  await prisma.notification.createMany({
    data: recipientUserIds.map((userId) => ({
      userId,
      title: `Platform announcement: ${title}`,
      body: body.slice(0, 180),
      href: `/mail?thread=${thread.id}`
    }))
  });

  return recipientUserIds.length;
}

async function deliverLoginPopup(title: string, body: string, recipientUserIds: string[]) {
  if (recipientUserIds.length === 0) return 0;

  await prisma.alert.createMany({
    data: recipientUserIds.map((userId) => ({
      userId,
      title,
      body,
      href: "/alerts"
    }))
  });

  return recipientUserIds.length;
}

async function deliverGlobalPost(actorUserId: string, title: string, body: string) {
  return prisma.feedPost.create({
    data: {
      authorUserId: actorUserId,
      body: `Platform announcement: ${title}\n\n${body}`,
      visibility: FeedVisibility.MEMBERS,
      isAdminAnnouncement: true
    }
  });
}

export async function publishPublicAnnouncement(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = publicAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid announcement." };
  }

  if (parsed.data.channels.includes("MAIL") && !isInternalMailEnabled()) {
    return { ok: false as const, error: "Internal Mail is currently unavailable." };
  }

  let recipients;
  try {
    recipients = await resolveAudience(parsed.data);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not resolve audience." };
  }

  const recipientUserIds = Array.from(new Set(recipients.map((recipient) => recipient.id)));
  if (recipientUserIds.length === 0) {
    return { ok: false as const, error: "That audience has no active recipients." };
  }

  const announcement = await prisma.publicAnnouncement.create({
    data: {
      createdByUserId: actorUserId,
      title: parsed.data.title,
      body: parsed.data.body,
      audienceKind: parsed.data.audienceKind,
      audienceValue: parsed.data.audienceValue || null,
      channels: parsed.data.channels,
      recipientCount: recipientUserIds.length,
      metadata: {
        reason: parsed.data.reason || null
      }
    }
  });
  let chatDeliveryCount = 0;
  let mailDeliveryCount = 0;
  let popupDeliveryCount = 0;
  let globalPostDeliveryCount = 0;
  let personalEmailQueuedCount = 0;
  let feedPostId: string | null = null;

  if (parsed.data.channels.includes("CHAT")) {
    chatDeliveryCount = await deliverChat(actorUserId, parsed.data.title, parsed.data.body, recipientUserIds);
  }

  if (parsed.data.channels.includes("MAIL")) {
    mailDeliveryCount = await deliverMail(actorUserId, parsed.data.title, parsed.data.body, recipientUserIds);
  }

  if (parsed.data.channels.includes("LOGIN_POPUP")) {
    popupDeliveryCount = await deliverLoginPopup(parsed.data.title, parsed.data.body, recipientUserIds);
  }

  if (parsed.data.channels.includes("GLOBAL_POST")) {
    const post = await deliverGlobalPost(actorUserId, parsed.data.title, parsed.data.body);
    feedPostId = post.id;
    globalPostDeliveryCount = 1;
  }

  if (parsed.data.channels.includes("PERSONAL_EMAIL")) {
    personalEmailQueuedCount = recipients.filter((recipient) => Boolean(recipient.email)).length;
  }

  const updated = await prisma.publicAnnouncement.update({
    where: { id: announcement.id },
    data: {
      chatDeliveryCount,
      mailDeliveryCount,
      popupDeliveryCount,
      globalPostDeliveryCount,
      personalEmailQueuedCount,
      feedPostId
    }
  });

  await prisma.adminAction.create({
    data: {
      actorUserId,
      actionKey: "announcements",
      module: MODULE_KEY,
      status: "completed",
      metadata: {
        announcementId: updated.id,
        channels: updated.channels,
        recipientCount: updated.recipientCount,
        personalEmailQueuedCount
      } as Prisma.InputJsonObject
    }
  });
  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "announcement.published",
    targetType: "PublicAnnouncement",
    targetId: updated.id,
    severity: "warning",
    metadata: {
      audienceKind: updated.audienceKind,
      audienceValue: updated.audienceValue,
      channels: updated.channels,
      recipientCount: updated.recipientCount
    }
  });
  await diagnostics.info(MODULE_KEY, "Public announcement published.", {
    actorUserId,
    announcementId: updated.id,
    channels: updated.channels,
    recipientCount: updated.recipientCount
  });

  return { ok: true as const, announcement: toAnnouncementResult(updated) };
}

export async function listRecentPublicAnnouncements(actorUserId?: string) {
  if (!(await isAdminUser(actorUserId))) return [];

  const announcements = await prisma.publicAnnouncement.findMany({
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return announcements.map(toAnnouncementResult);
}

export async function dismissPublicAnnouncement(actorUserId: string, announcementId: string) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const announcement = await prisma.publicAnnouncement.findUnique({
    where: { id: announcementId }
  });

  if (!announcement) {
    return { ok: false as const, error: "Announcement not found." };
  }

  if (announcement.dismissedAt) {
    return { ok: true as const, announcement: toAnnouncementResult(announcement), alreadyDismissed: true };
  }

  const dismissedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const nextAnnouncement = await tx.publicAnnouncement.update({
      where: { id: announcement.id },
      data: {
        dismissedAt,
        dismissedByUserId: actorUserId
      }
    });

    if (announcement.feedPostId) {
      await tx.feedPost.updateMany({
        where: {
          id: announcement.feedPostId,
          isAdminAnnouncement: true
        },
        data: {
          isAdminAnnouncement: false,
          visibility: FeedVisibility.PRIVATE,
          pinnedUntil: null
        }
      });
    }

    if (announcement.popupDeliveryCount > 0) {
      await tx.alert.updateMany({
        where: {
          title: announcement.title,
          body: announcement.body,
          href: "/alerts",
          readAt: null
        },
        data: {
          readAt: dismissedAt
        }
      });
    }

    await tx.adminAction.create({
      data: {
        actorUserId,
        actionKey: "announcements",
        module: MODULE_KEY,
        status: "dismissed",
        metadata: {
          announcementId: announcement.id,
          feedPostId: announcement.feedPostId,
          channels: announcement.channels
        } as Prisma.InputJsonObject
      }
    });

    return nextAnnouncement;
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "announcement.dismissed",
    targetType: "PublicAnnouncement",
    targetId: updated.id,
    severity: "warning",
    metadata: {
      channels: updated.channels,
      feedPostId: updated.feedPostId,
      recipientCount: updated.recipientCount
    }
  });
  await diagnostics.info(MODULE_KEY, "Public announcement dismissed.", {
    actorUserId,
    announcementId: updated.id,
    feedPostId: updated.feedPostId
  });

  return { ok: true as const, announcement: toAnnouncementResult(updated), alreadyDismissed: false };
}
