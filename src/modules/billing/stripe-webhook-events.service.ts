import { randomUUID } from "node:crypto";
import { Prisma, StripeWebhookEventStatus } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/platform/db";

const WEBHOOK_LEASE_MS = 2 * 60 * 1000;
const MAX_ERROR_LENGTH = 1_000;

function stripeObjectId(event: Stripe.Event) {
  const object = event.data.object as { id?: unknown };
  return typeof object.id === "string" && object.id ? object.id : null;
}

function retryAt(attempts: number) {
  const delaySeconds = Math.min(5 * 2 ** Math.max(attempts - 1, 0), 60 * 60);
  return new Date(Date.now() + delaySeconds * 1000);
}

export async function processStripeWebhookEventOnce<T>(event: Stripe.Event, processor: () => Promise<T>) {
  const eventCreatedAt = new Date(event.created * 1000);
  const objectId = stripeObjectId(event);
  const payload = JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue;
  const stored = await prisma.stripeWebhookEvent.upsert({
    where: { providerEventId: event.id },
    update: {},
    create: {
      providerEventId: event.id,
      eventType: event.type,
      objectId,
      payload,
      livemode: event.livemode,
      apiVersion: event.api_version ?? null,
      eventCreatedAt
    }
  });

  if (
    stored.status === StripeWebhookEventStatus.PROCESSED ||
    stored.status === StripeWebhookEventStatus.IGNORED
  ) {
    return { ok: true as const, duplicate: true, result: null as T | null };
  }

  const now = new Date();
  const claimToken = randomUUID();
  const claimed = await prisma.stripeWebhookEvent.updateMany({
    where: {
      id: stored.id,
      OR: [
        { status: { in: [StripeWebhookEventStatus.RECEIVED, StripeWebhookEventStatus.FAILED] } },
        { status: StripeWebhookEventStatus.PROCESSING, lockedUntil: { lt: now } },
        { status: StripeWebhookEventStatus.PROCESSING, lockedUntil: null }
      ]
    },
    data: {
      status: StripeWebhookEventStatus.PROCESSING,
      attempts: { increment: 1 },
      lastAttemptAt: now,
      lockedUntil: new Date(now.getTime() + WEBHOOK_LEASE_MS),
      claimToken,
      nextAttemptAt: null,
      errorAt: null,
      errorMessage: null
    }
  });

  if (claimed.count !== 1) {
    return { ok: true as const, inProgress: true, result: null as T | null };
  }

  try {
    if (objectId) {
      const newerProcessedEvent = await prisma.stripeWebhookEvent.findFirst({
        where: {
          id: { not: stored.id },
          objectId,
          status: StripeWebhookEventStatus.PROCESSED,
          eventCreatedAt: { gt: eventCreatedAt }
        },
        select: { id: true }
      });

      if (newerProcessedEvent) {
        await prisma.stripeWebhookEvent.updateMany({
          where: { id: stored.id, claimToken },
          data: {
            status: StripeWebhookEventStatus.IGNORED,
            processedAt: new Date(),
            lockedUntil: null,
            claimToken: null
          }
        });
        return { ok: true as const, outOfOrder: true, result: null as T | null };
      }
    }

    const result = await processor();
    const completed = await prisma.stripeWebhookEvent.updateMany({
      where: { id: stored.id, claimToken, status: StripeWebhookEventStatus.PROCESSING },
      data: {
        status: StripeWebhookEventStatus.PROCESSED,
        processedAt: new Date(),
        lockedUntil: null,
        claimToken: null,
        nextAttemptAt: null
      }
    });

    if (completed.count !== 1) throw new Error("Stripe webhook processing lease was lost.");
    return { ok: true as const, result };
  } catch (error) {
    const current = await prisma.stripeWebhookEvent.findUnique({
      where: { id: stored.id },
      select: { attempts: true }
    });
    const message = error instanceof Error ? error.message : "Stripe webhook processing failed.";
    await prisma.stripeWebhookEvent.updateMany({
      where: { id: stored.id, claimToken },
      data: {
        status: StripeWebhookEventStatus.FAILED,
        errorAt: new Date(),
        errorMessage: message.slice(0, MAX_ERROR_LENGTH),
        nextAttemptAt: retryAt(current?.attempts ?? 1),
        lockedUntil: null,
        claimToken: null
      }
    });
    throw error;
  }
}
