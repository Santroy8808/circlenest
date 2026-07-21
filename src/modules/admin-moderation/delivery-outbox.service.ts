import {
  ChatThreadType,
  DeliveryChannel,
  DeliveryOutboxStatus,
  FeedVisibility,
  MailDeliveryKind,
  MailRecipientType,
  NotificationKind,
  Prisma,
  RecordRetentionClass
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/platform/db";
import { sendSmtpMail } from "@/lib/platform/smtp";
import { assertChatMessageWriteAllowed } from "@/modules/chat-messages/chat-retention";
import { assertNewFeedPostWriteAllowed } from "@/modules/feed-stream/feed-write-fence";
import { isInternalMailEnabled } from "@/modules/mail/mail.service";

const deliveryPayloadSchema = z.object({
  announcementId: z.string().min(1),
  actorUserId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1)
});

const DELIVERY_LOCK_TIMEOUT_MS = 5 * 60_000;

export function announcementEmailMessageId(outboxId: string) {
  return `<announcement-${outboxId}@theta-space.net>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function claimNextAnnouncementDelivery(workerId: string, now = new Date()) {
  const staleBefore = new Date(now.getTime() - DELIVERY_LOCK_TIMEOUT_MS);

  for (let scan = 0; scan < 5; scan += 1) {
    const candidate = await prisma.deliveryOutbox.findFirst({
      where: {
        OR: [
          { status: DeliveryOutboxStatus.PENDING, availableAt: { lte: now } },
          { status: DeliveryOutboxStatus.PROCESSING, lockedAt: { lte: staleBefore } }
        ],
        announcement: { dismissedAt: null }
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }]
    });
    if (!candidate) return null;

    const exactClaim = {
      id: candidate.id,
      status: candidate.status,
      attempts: candidate.attempts,
      ...(candidate.status === DeliveryOutboxStatus.PROCESSING ? { lockedAt: candidate.lockedAt } : {})
    };
    if (candidate.attempts >= candidate.maxAttempts) {
      await prisma.deliveryOutbox.updateMany({
        where: exactClaim,
        data: {
          status: DeliveryOutboxStatus.FAILED,
          failedAt: now,
          lockedAt: null,
          lockedBy: null,
          error: candidate.error ?? "Announcement delivery exhausted its retry limit."
        }
      });
      continue;
    }

    const claimed = await prisma.deliveryOutbox.updateMany({
      where: exactClaim,
      data: {
        status: DeliveryOutboxStatus.PROCESSING,
        attempts: { increment: 1 },
        lockedAt: now,
        lockedBy: workerId,
        error: null
      }
    });
    if (claimed.count !== 1) continue;

    return prisma.deliveryOutbox.findUnique({ where: { id: candidate.id } });
  }

  return null;
}

async function lockActiveAnnouncement(
  transaction: Prisma.TransactionClient,
  outbox: NonNullable<Awaited<ReturnType<typeof claimNextAnnouncementDelivery>>>
) {
  const rows = await transaction.$queryRaw<Array<{ dismissedAt: Date | null }>>(
    Prisma.sql`SELECT "dismissedAt" FROM "PublicAnnouncement" WHERE "id" = ${outbox.announcementId} FOR UPDATE`
  );
  return rows[0]?.dismissedAt == null;
}

async function cancelClaim(
  transaction: Prisma.TransactionClient,
  outbox: NonNullable<Awaited<ReturnType<typeof claimNextAnnouncementDelivery>>>
) {
  await transaction.deliveryOutbox.updateMany({
    where: {
      id: outbox.id,
      status: DeliveryOutboxStatus.PROCESSING,
      lockedBy: outbox.lockedBy
    },
    data: {
      status: DeliveryOutboxStatus.CANCELLED,
      lockedAt: null,
      lockedBy: null,
      error: "Announcement dismissed before delivery."
    }
  });
}

async function markDatabaseDeliverySent(
  outbox: NonNullable<Awaited<ReturnType<typeof claimNextAnnouncementDelivery>>>,
  payload: z.infer<typeof deliveryPayloadSchema>
): Promise<boolean> {
  if (!outbox.recipientUserId && outbox.channel !== DeliveryChannel.GLOBAL_POST) {
    throw new Error("Announcement delivery is missing a recipient.");
  }

  await prisma.$transaction(async (transaction) => {
    if (!(await lockActiveAnnouncement(transaction, outbox))) {
      await cancelClaim(transaction, outbox);
      return;
    }

    let feedPostId: string | undefined;
    let mailThreadId: string | undefined;

    if (outbox.channel === DeliveryChannel.CHAT) {
      await assertChatMessageWriteAllowed(
        transaction,
        {
          threadKind: "NEW_VITAL",
          senderUserId: payload.actorUserId,
          participantUserIds: [payload.actorUserId, outbox.recipientUserId!]
        }
      );
      const sentAt = new Date();
      await transaction.chatThread.create({
        data: {
          type: ChatThreadType.GROUP,
          retentionClass: RecordRetentionClass.VITAL,
          title: `Announcement: ${payload.title}`,
          createdByUserId: payload.actorUserId,
          lastMessageAt: sentAt,
          participants: {
            create: [
              { userId: payload.actorUserId, lastReadAt: sentAt },
              { userId: outbox.recipientUserId! }
            ]
          },
          messages: {
            create: { senderUserId: payload.actorUserId, body: payload.body, createdAt: sentAt }
          }
        }
      });
    } else if (outbox.channel === DeliveryChannel.POPUP) {
      await transaction.alert.create({
        data: {
          userId: outbox.recipientUserId!,
          title: payload.title,
          body: payload.body,
          href: "/alerts",
          sourceType: "PublicAnnouncement",
          sourceId: outbox.announcementId
        }
      });
    } else if (outbox.channel === DeliveryChannel.GLOBAL_POST) {
      await assertNewFeedPostWriteAllowed(transaction, { actorUserId: payload.actorUserId });
      const post = await transaction.feedPost.create({
        data: {
          authorUserId: payload.actorUserId,
          body: `Platform announcement: ${payload.title}\n\n${payload.body}`,
          visibility: FeedVisibility.PUBLIC,
          isAdminAnnouncement: true
        }
      });
      feedPostId = post.id;
    } else if (outbox.channel === DeliveryChannel.MAIL) {
      if (!isInternalMailEnabled()) throw new Error("Internal Mail is currently unavailable.");
      const [sender, recipient] = await Promise.all([
        transaction.user.findUnique({ where: { id: payload.actorUserId }, select: { username: true, email: true } }),
        transaction.user.findUnique({ where: { id: outbox.recipientUserId! }, select: { username: true, email: true } })
      ]);
      if (!sender || !recipient) throw new Error("Announcement mail account was not found.");
      const sentAt = new Date();
      const thread = await transaction.mailThread.create({
        data: {
          subject: payload.title,
          deliveryKind: MailDeliveryKind.MASS_INTERNAL,
          createdByUserId: payload.actorUserId,
          lastMessageAt: sentAt,
          messages: {
            create: {
              senderUserId: payload.actorUserId,
              senderIdentitySnapshot: `${sender.username} <${sender.email}>`,
              subject: payload.title,
              bodyText: payload.body,
              createdAt: sentAt,
              recipients: {
                create: {
                  userId: outbox.recipientUserId!,
                  recipientIdentitySnapshot: `${recipient.username} <${recipient.email}>`,
                  type: MailRecipientType.TO
                }
              }
            }
          }
        }
      });
      mailThreadId = thread.id;
      await transaction.notification.create({
        data: {
          idempotencyKey: `${outbox.idempotencyKey}:notification`,
          kind: NotificationKind.ADMIN_ANNOUNCEMENT,
          sourceType: "PublicAnnouncement",
          sourceId: outbox.announcementId,
          actionable: true,
          userId: outbox.recipientUserId!,
          title: `Platform announcement: ${payload.title}`,
          body: payload.body.slice(0, 180),
          href: `/mail?thread=${thread.id}`
        }
      });
    } else if (outbox.channel === DeliveryChannel.NOTIFICATION) {
      await transaction.notification.create({
        data: {
          idempotencyKey: outbox.idempotencyKey,
          kind: NotificationKind.ADMIN_ANNOUNCEMENT,
          sourceType: "PublicAnnouncement",
          sourceId: outbox.announcementId,
          actionable: true,
          userId: outbox.recipientUserId!,
          title: payload.title,
          body: payload.body,
          href: "/alerts"
        }
      });
    } else {
      throw new Error(`Unsupported database delivery channel: ${outbox.channel}`);
    }

    const deliveredAt = new Date();
    const completed = await transaction.deliveryOutbox.updateMany({
      where: {
        id: outbox.id,
        status: DeliveryOutboxStatus.PROCESSING,
        lockedBy: outbox.lockedBy
      },
      data: {
        status: DeliveryOutboxStatus.SENT,
        sentAt: deliveredAt,
        lockedAt: null,
        lockedBy: null,
        providerMessageId: mailThreadId ?? feedPostId ?? undefined
      }
    });
    if (completed.count !== 1) throw new Error("Announcement delivery claim was lost.");

    await transaction.publicAnnouncement.update({
      where: { id: outbox.announcementId },
      data: {
        chatDeliveryCount: outbox.channel === DeliveryChannel.CHAT ? { increment: 1 } : undefined,
        mailDeliveryCount: outbox.channel === DeliveryChannel.MAIL ? { increment: 1 } : undefined,
        popupDeliveryCount: outbox.channel === DeliveryChannel.POPUP ? { increment: 1 } : undefined,
        globalPostDeliveryCount: outbox.channel === DeliveryChannel.GLOBAL_POST ? { increment: 1 } : undefined,
        feedPostId
      }
    });
  });

  const completed = await prisma.deliveryOutbox.findUnique({
    where: { id: outbox.id },
    select: { status: true }
  });
  return completed?.status === DeliveryOutboxStatus.SENT;
}

async function markPersonalEmailSent(
  outbox: NonNullable<Awaited<ReturnType<typeof claimNextAnnouncementDelivery>>>,
  payload: z.infer<typeof deliveryPayloadSchema>
): Promise<boolean> {
  if (!outbox.recipientAddress) throw new Error("Announcement email is missing a recipient address.");
  return prisma.$transaction(async (transaction) => {
    if (!(await lockActiveAnnouncement(transaction, outbox))) {
      await cancelClaim(transaction, outbox);
      return false;
    }

    const deterministicMessageId = announcementEmailMessageId(outbox.id);
    const stillOwned = await transaction.deliveryOutbox.updateMany({
      where: {
        id: outbox.id,
        status: DeliveryOutboxStatus.PROCESSING,
        lockedBy: outbox.lockedBy
      },
      data: { providerMessageId: deterministicMessageId }
    });
    if (stillOwned.count !== 1) throw new Error("Announcement delivery claim was lost.");

    const info = await sendSmtpMail({
      to: outbox.recipientAddress!,
      subject: payload.title,
      text: payload.body,
      messageId: deterministicMessageId,
      html: `<div style="background:#080d15;color:#e7edf8;padding:28px;font-family:Arial,sans-serif"><div style="max-width:640px;margin:auto;border:1px solid #d6ad3d;border-radius:18px;padding:28px"><div style="color:#f4ca4f;letter-spacing:.18em;font-weight:700">THETA-SPACE</div><h1 style="color:#f4ca4f">${escapeHtml(payload.title)}</h1><p style="font-size:16px;line-height:1.65;white-space:pre-wrap">${escapeHtml(payload.body)}</p></div></div>`
    });
    const completed = await transaction.deliveryOutbox.updateMany({
      where: {
        id: outbox.id,
        status: DeliveryOutboxStatus.PROCESSING,
        lockedBy: outbox.lockedBy,
        providerMessageId: deterministicMessageId
      },
      data: {
        status: DeliveryOutboxStatus.SENT,
        sentAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        providerMessageId: info.messageId || deterministicMessageId
      }
    });
    if (completed.count !== 1) throw new Error("Announcement email delivery receipt could not be recorded.");
    return true;
  });
}

async function markDeliveryFailed(
  outbox: NonNullable<Awaited<ReturnType<typeof claimNextAnnouncementDelivery>>>,
  error: unknown
) {
  const finalAttempt = outbox.attempts >= outbox.maxAttempts;
  const retryAt = new Date(Date.now() + Math.min(30 * 60_000, 2 ** outbox.attempts * 30_000));
  await prisma.deliveryOutbox.updateMany({
    where: { id: outbox.id, status: DeliveryOutboxStatus.PROCESSING, lockedBy: outbox.lockedBy },
    data: {
      status: finalAttempt ? DeliveryOutboxStatus.FAILED : DeliveryOutboxStatus.PENDING,
      availableAt: finalAttempt ? outbox.availableAt : retryAt,
      failedAt: finalAttempt ? new Date() : null,
      lockedAt: null,
      lockedBy: null,
      error: error instanceof Error ? error.message.slice(0, 2000) : "Unknown announcement delivery error."
    }
  });
}

export async function runOneAnnouncementDelivery(workerId: string, now = new Date()) {
  const outbox = await claimNextAnnouncementDelivery(workerId, now);
  if (!outbox) return { ran: false as const };

  const parsed = deliveryPayloadSchema.safeParse(outbox.payload);
  if (!parsed.success) {
    await markDeliveryFailed(outbox, new Error("Announcement delivery payload is invalid."));
    return { ran: true as const, delivered: false as const, outboxId: outbox.id };
  }

  try {
    const delivered = outbox.channel === DeliveryChannel.PERSONAL_EMAIL
      ? await markPersonalEmailSent(outbox, parsed.data)
      : await markDatabaseDeliverySent(outbox, parsed.data);
    return { ran: true as const, delivered, outboxId: outbox.id };
  } catch (error) {
    await markDeliveryFailed(outbox, error);
    return { ran: true as const, delivered: false as const, outboxId: outbox.id };
  }
}
