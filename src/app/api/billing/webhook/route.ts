import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  getStripeBillingConfig,
  normalizeBillingPlanTier,
  normalizeBillingStatus,
  resolveEffectiveAccessTier,
  resolveSubscriptionTierFromStripe,
  toDateFromUnixSeconds,
  verifyStripeWebhookSignature,
} from "@/lib/billing/stripe";
import { seedDefaultStripeProcessorConfigs } from "@/lib/payments/processor-config";

type StripeEventObject = Record<string, unknown>;

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(value: unknown) {
  return value === true;
}

function getMetadata(object: StripeEventObject) {
  const metadata = object.metadata;
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
}

function getSubscriptionPriceId(object: StripeEventObject) {
  const items = object.items;
  if (!items || typeof items !== "object") return null;
  const data = (items as { data?: unknown[] }).data;
  if (!Array.isArray(data) || !data.length) return null;
  const first = data[0];
  if (!first || typeof first !== "object") return null;
  const price = (first as { price?: unknown }).price;
  if (!price || typeof price !== "object") return null;
  return getString((price as { id?: unknown }).id) || null;
}

function getEffectiveTierFromStripeObject(object: StripeEventObject) {
  const tier = resolveSubscriptionTierFromStripe({
    metadata: getMetadata(object),
    priceId: getSubscriptionPriceId(object),
  });
  return tier ?? "CONTRIBUTOR";
}

async function syncSubscriptionFromStripeObject(object: StripeEventObject, stripeStatus: string) {
  const userId = getString(getMetadata(object).userId);
  const providerSubscriptionId = getString(object.id);
  const providerCustomerId = getString(object.customer);
  if (!userId || !providerSubscriptionId || !providerCustomerId) return;

  const subscriptionTier = getEffectiveTierFromStripeObject(object);
  const status = normalizeBillingStatus(stripeStatus);
  const currentPeriodStart = toDateFromUnixSeconds(object.current_period_start);
  const currentPeriodEnd = toDateFromUnixSeconds(object.current_period_end);
  const cancelAtPeriodEnd = getBoolean(object.cancel_at_period_end);
  const canceledAt = toDateFromUnixSeconds(object.canceled_at);
  const trialEndsAt = toDateFromUnixSeconds(object.trial_end);
  const pausedAt = toDateFromUnixSeconds(object.paused_at);

  await prisma.$transaction(async (tx) => {
    await tx.billingSubscription.upsert({
      where: { userId },
      create: {
        userId,
        provider: "STRIPE",
        providerCustomerId,
        providerSubscriptionId,
        subscriptionTier,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        canceledAt,
        trialEndsAt,
        pausedAt,
      },
      update: {
        provider: "STRIPE",
        providerCustomerId,
        providerSubscriptionId,
        subscriptionTier,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        canceledAt,
        trialEndsAt,
        pausedAt,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: resolveEffectiveAccessTier({
          userId,
          providerCustomerId,
          providerSubscriptionId,
          subscriptionTier,
          status,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd,
          canceledAt,
          trialEndsAt,
          pausedAt,
        }),
      },
    });
  });
}

export async function POST(request: Request) {
  const config = getStripeBillingConfig();
  if (!config.webhookSecret) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!verifyStripeWebhookSignature(rawBody, signature, config.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: { id?: string; type?: string; livemode?: boolean; created?: number; data?: { object?: StripeEventObject } };
  try {
    event = JSON.parse(rawBody) as { id?: string; type?: string; livemode?: boolean; created?: number; data?: { object?: StripeEventObject } };
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const eventId = getString(event.id);
  const eventType = getString(event.type);
  if (!eventId || !eventType) {
    return NextResponse.json({ error: "Invalid event envelope." }, { status: 400 });
  }

  const object = event.data?.object ?? {};
  await seedDefaultStripeProcessorConfigs();
  const processorConfig = await prisma.paymentProcessorConfig.findFirst({
    where: { provider: "STRIPE", area: "MEMBERSHIP_SUBSCRIPTIONS" },
    orderBy: [{ isEnabled: "desc" }, { updatedAt: "desc" }],
    select: { id: true },
  });
  if (!processorConfig) {
    return NextResponse.json({ error: "Payment processor configuration is unavailable." }, { status: 503 });
  }

  try {
    await prisma.paymentProcessorWebhookEvent.create({
      data: {
        processorConfigId: processorConfig.id,
        provider: "STRIPE",
        eventId,
        eventType,
        status: "PROCESSING",
        metadataJson: JSON.stringify({
          livemode: event.livemode === true,
          created: event.created ?? null,
        }),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await prisma.paymentProcessorConfig.update({
        where: { id: processorConfig.id },
        data: { webhookHealthStatus: "READY" },
      });
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw error;
  }

  try {
    if (eventType === "checkout.session.completed") {
      const session = object;
      const metadata = getMetadata(session);
      const userId = getString(metadata.userId);
      const subscriptionTier = normalizeBillingPlanTier(getString(metadata.tier)) ?? "CONTRIBUTOR";
      const providerCustomerId = getString(session.customer);
      const providerSubscriptionId = getString(session.subscription);
      const paymentStatus = getString(session.payment_status).toUpperCase();

      if (userId && providerSubscriptionId) {
        await prisma.$transaction(async (tx) => {
          await tx.billingSubscription.upsert({
            where: { userId },
            create: {
              userId,
              provider: "STRIPE",
              providerCustomerId: providerCustomerId || null,
              providerSubscriptionId,
              subscriptionTier,
              status: paymentStatus === "PAID" ? "ACTIVE" : "TRIALING",
              currentPeriodStart: null,
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
              canceledAt: null,
              trialEndsAt: null,
              pausedAt: null,
            },
            update: {
              provider: "STRIPE",
              providerCustomerId: providerCustomerId || null,
              providerSubscriptionId,
              subscriptionTier,
              status: paymentStatus === "PAID" ? "ACTIVE" : "TRIALING",
            },
          });
          await tx.user.update({
            where: { id: userId },
            data: {
              subscriptionTier,
            },
          });
        });
      }
    } else if (eventType === "customer.subscription.created" || eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
      await syncSubscriptionFromStripeObject(object, getString(object.status));
    } else if (eventType === "invoice.payment_failed" || eventType === "invoice.payment_succeeded") {
      const subscriptionId = getString(object.subscription);
      if (subscriptionId) {
        const existing = await prisma.billingSubscription.findFirst({
          where: { providerSubscriptionId: subscriptionId },
          select: {
            userId: true,
            providerCustomerId: true,
            providerSubscriptionId: true,
            subscriptionTier: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            canceledAt: true,
            trialEndsAt: true,
            pausedAt: true,
          },
        });
        if (existing) {
          const nextStatus = eventType === "invoice.payment_failed" ? "PAST_DUE" : "ACTIVE";
          await prisma.$transaction(async (tx) => {
            await tx.billingSubscription.update({
              where: { userId: existing.userId },
              data: { status: nextStatus },
            });
            await tx.user.update({
              where: { id: existing.userId },
              data: {
                subscriptionTier: resolveEffectiveAccessTier({
                  ...existing,
                  status: nextStatus,
                }),
              },
            });
          });
        }
      }
    }

    await prisma.$transaction([
      prisma.paymentProcessorWebhookEvent.update({
        where: { provider_eventId: { provider: "STRIPE", eventId } },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
        },
      }),
      prisma.paymentProcessorConfig.update({
        where: { id: processorConfig.id },
        data: { webhookHealthStatus: "READY" },
      }),
    ]);

    return NextResponse.json({ received: true, ignored: !["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.payment_failed", "invoice.payment_succeeded"].includes(eventType) });
  } catch (error) {
    await prisma.$transaction([
      prisma.paymentProcessorWebhookEvent.update({
        where: { provider_eventId: { provider: "STRIPE", eventId } },
        data: {
          status: "FAILED",
          retryCount: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown webhook error",
        },
      }),
      prisma.paymentProcessorConfig.update({
        where: { id: processorConfig.id },
        data: { webhookHealthStatus: "FAILED" },
      }),
    ]);

    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
