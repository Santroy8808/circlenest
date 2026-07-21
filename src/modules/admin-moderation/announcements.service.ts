import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DeliveryChannel,
  DeliveryOutboxStatus,
  FeedVisibility,
  MembershipTier,
  Prisma,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  announcementAudienceKinds,
  announcementDeliveryChannels,
  type AdminAnnouncementResult
} from "@/modules/admin-moderation/types";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";

const MODULE_KEY = "admin-moderation";

const publicAnnouncementSchema = z.object({
  commandId: z.string().trim().min(8).max(200).optional().or(z.literal("")),
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
      select: { id: true, email: true },
      orderBy: {
        username: "asc"
      }
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
      select: { id: true, email: true },
      orderBy: {
        username: "asc"
      }
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
      select: { id: true, email: true },
      orderBy: {
        username: "asc"
      }
    });
  }

  const identifiers = parseIdentifierList(input.audienceValue);
  if (identifiers.length === 0) throw new Error("Enter at least one email or username.");

  return prisma.user.findMany({
    where: {
      ...baseWhere,
      OR: [{ email: { in: identifiers } }, { username: { in: identifiers } }]
    },
    select: { id: true, email: true },
    orderBy: {
      username: "asc"
    }
  });
}

type AnnouncementRecipient = { id: string; email: string | null };
type AnnouncementChannel = (typeof announcementDeliveryChannels)[number];

export function validateAnnouncementAudienceChannels(
  audienceKind: (typeof announcementAudienceKinds)[number],
  channels: readonly AnnouncementChannel[]
) {
  return channels.includes("GLOBAL_POST") && audienceKind !== "ALL_ACTIVE"
    ? "A public Stream announcement must use the All active members audience. Use a private delivery channel for a targeted audience."
    : null;
}

export function buildAnnouncementOutboxEntries(
  announcementId: string,
  actorUserId: string,
  title: string,
  body: string,
  channels: readonly AnnouncementChannel[],
  recipients: readonly AnnouncementRecipient[]
) {
  const payload = (channel: AnnouncementChannel) =>
    ({
      announcementId,
      actorUserId,
      channel,
      title,
      body,
      ...(channel === "GLOBAL_POST" ? { visibility: "PUBLIC", isAdminAnnouncement: true } : {})
    }) satisfies Prisma.InputJsonObject;
  const entries: Array<{
    announcementId: string;
    recipientUserId: string | null;
    recipientAddress: string | null;
    channel: DeliveryChannel;
    idempotencyKey: string;
    payload: Prisma.InputJsonObject;
  }> = [];

  for (const channel of channels) {
    if (channel === "GLOBAL_POST") {
      entries.push({
        announcementId,
        recipientUserId: null,
        recipientAddress: null,
        channel: DeliveryChannel.GLOBAL_POST,
        idempotencyKey: `announcement:${announcementId}:GLOBAL_POST:global`,
        payload: payload(channel)
      });
      continue;
    }

    for (const recipient of recipients) {
      if (channel === "CHAT" && recipient.id === actorUserId) continue;
      if (channel === "PERSONAL_EMAIL" && !recipient.email) continue;
      const deliveryChannel =
        channel === "LOGIN_POPUP"
          ? DeliveryChannel.POPUP
          : channel === "PERSONAL_EMAIL"
            ? DeliveryChannel.PERSONAL_EMAIL
            : channel === "MAIL"
              ? DeliveryChannel.MAIL
              : DeliveryChannel.CHAT;
      entries.push({
        announcementId,
        recipientUserId: recipient.id,
        recipientAddress: channel === "PERSONAL_EMAIL" ? recipient.email : null,
        channel: deliveryChannel,
        idempotencyKey: `announcement:${announcementId}:${deliveryChannel}:${recipient.id}`,
        payload: payload(channel)
      });
    }
  }

  return entries;
}

async function findAnnouncementReplay(commandId: string) {
  const audit = await prisma.auditLog.findUnique({ where: { operationId: commandId } });
  if (!audit) return null;
  if (audit.module !== MODULE_KEY || audit.action !== "announcement.published" || audit.targetType !== "PublicAnnouncement" || !audit.targetId) {
    return { ok: false as const, error: "That command id has already been used for another administrator operation." };
  }
  const announcement = await prisma.publicAnnouncement.findUnique({ where: { id: audit.targetId } });
  if (!announcement) return { ok: false as const, error: "The stored announcement receipt is incomplete. Review the audit log." };
  return { ok: true as const, commandId, auditLogId: audit.id, replayed: true as const, announcement: toAnnouncementResult(announcement) };
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function publishPublicAnnouncement(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = publicAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid announcement." };
  }

  const audienceChannelError = validateAnnouncementAudienceChannels(parsed.data.audienceKind, parsed.data.channels);
  if (audienceChannelError) return { ok: false as const, error: audienceChannelError };

  const commandId = parsed.data.commandId || randomUUID();
  const replay = await findAnnouncementReplay(commandId);
  if (replay) return replay;

  let recipients;
  try {
    recipients = await resolveAudience(parsed.data);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not resolve audience." };
  }

  const uniqueRecipients = Array.from(
    new Map(recipients.map((recipient) => [recipient.id, { id: recipient.id, email: recipient.email }])).values()
  );
  if (uniqueRecipients.length === 0) {
    return { ok: false as const, error: "That audience has no active recipients." };
  }

  let completed;
  try {
    completed = await prisma.$transaction(async (transaction) => {
      const announcement = await transaction.publicAnnouncement.create({
        data: {
          createdByUserId: actorUserId,
          title: parsed.data.title,
          body: parsed.data.body,
          audienceKind: parsed.data.audienceKind,
          audienceValue: parsed.data.audienceValue || null,
          channels: parsed.data.channels,
          recipientCount: uniqueRecipients.length,
          metadata: { commandId, reason: parsed.data.reason || null } as Prisma.InputJsonObject
        }
      });
      const outboxEntries = buildAnnouncementOutboxEntries(
        announcement.id,
        actorUserId,
        parsed.data.title,
        parsed.data.body,
        parsed.data.channels,
        uniqueRecipients
      );
      if (outboxEntries.length > 0) {
        await transaction.deliveryOutbox.createMany({ data: outboxEntries });
      }
      const personalEmailQueuedCount = outboxEntries.filter((entry) => entry.channel === DeliveryChannel.PERSONAL_EMAIL).length;
      const updated = await transaction.publicAnnouncement.update({
        where: { id: announcement.id },
        data: { personalEmailQueuedCount }
      });
      const metadata = {
        commandId,
        announcementId: updated.id,
        audienceKind: updated.audienceKind,
        audienceValue: updated.audienceValue,
        channels: updated.channels,
        recipientCount: updated.recipientCount,
        outboxCount: outboxEntries.length,
        personalEmailQueuedCount
      } satisfies Prisma.InputJsonObject;
      await transaction.adminAction.create({
        data: { actorUserId, actionKey: "announcements", module: MODULE_KEY, status: "queued", metadata }
      });
      const audit = await transaction.auditLog.create({
        data: {
          operationId: commandId,
          requestId: commandId,
          actorUserId,
          module: MODULE_KEY,
          action: "announcement.published",
          targetType: "PublicAnnouncement",
          targetId: updated.id,
          severity: "warning",
          outcome: "SUCCESS",
          before: Prisma.JsonNull,
          after: toAnnouncementResult(updated) as unknown as Prisma.InputJsonObject,
          metadata
        }
      });
      return { announcement: updated, auditLogId: audit.id };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const duplicate = await findAnnouncementReplay(commandId);
      if (duplicate) return duplicate;
    }
    throw error;
  }
  await diagnostics.info(MODULE_KEY, "Public announcement published.", {
    actorUserId,
    announcementId: completed.announcement.id,
    channels: completed.announcement.channels,
    recipientCount: completed.announcement.recipientCount
  });

  return {
    ok: true as const,
    commandId,
    auditLogId: completed.auditLogId,
    replayed: false as const,
    announcement: toAnnouncementResult(completed.announcement)
  };
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
  const commandId = `announcement-dismiss:${announcement.id}`;
  const completed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.publicAnnouncement.updateMany({
      where: { id: announcement.id, dismissedAt: null },
      data: { dismissedAt, dismissedByUserId: actorUserId }
    });
    if (claimed.count !== 1) {
      const alreadyDismissed = await tx.publicAnnouncement.findUniqueOrThrow({ where: { id: announcement.id } });
      return { announcement: alreadyDismissed, alreadyDismissed: true };
    }
    const nextAnnouncement = await tx.publicAnnouncement.findUniqueOrThrow({ where: { id: announcement.id } });

    await tx.deliveryOutbox.updateMany({
      where: {
        announcementId: announcement.id,
        status: { in: [DeliveryOutboxStatus.PENDING, DeliveryOutboxStatus.PROCESSING] }
      },
      data: { status: DeliveryOutboxStatus.CANCELLED, error: "Announcement dismissed before delivery." }
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
          sourceType: "PublicAnnouncement",
          sourceId: announcement.id,
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

    await tx.auditLog.create({
      data: {
        operationId: commandId,
        requestId: commandId,
        actorUserId,
        module: MODULE_KEY,
        action: "announcement.dismissed",
        targetType: "PublicAnnouncement",
        targetId: nextAnnouncement.id,
        severity: "warning",
        outcome: "SUCCESS",
        before: toAnnouncementResult(announcement) as unknown as Prisma.InputJsonObject,
        after: toAnnouncementResult(nextAnnouncement) as unknown as Prisma.InputJsonObject,
        metadata: {
          commandId,
          channels: nextAnnouncement.channels,
          feedPostId: nextAnnouncement.feedPostId,
          recipientCount: nextAnnouncement.recipientCount
        } as Prisma.InputJsonObject
      }
    });

    return { announcement: nextAnnouncement, alreadyDismissed: false };
  });

  if (completed.alreadyDismissed) {
    return { ok: true as const, announcement: toAnnouncementResult(completed.announcement), alreadyDismissed: true };
  }
  await diagnostics.info(MODULE_KEY, "Public announcement dismissed.", {
    actorUserId,
    announcementId: completed.announcement.id,
    feedPostId: completed.announcement.feedPostId
  });

  return { ok: true as const, announcement: toAnnouncementResult(completed.announcement), alreadyDismissed: false };
}
