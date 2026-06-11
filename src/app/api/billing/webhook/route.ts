import { NextResponse } from "next/server";
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
  return tier ?? "PLUS";
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

  let event: { type?: string; data?: { object?: StripeEventObject } };
  try {
    event = JSON.parse(rawBody) as { type?: string; data?: { object?: StripeEventObject } };
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const eventType = getString(event.type);
  const object = event.data?.object ?? {};

  if (eventType === "checkout.session.completed") {
    const session = object;
    const metadata = getMetadata(session);
    const userId = getString(metadata.userId);
    const subscriptionTier = normalizeBillingPlanTier(getString(metadata.tier)) ?? "PLUS";
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

    return NextResponse.json({ received: true });
  }

  if (eventType === "customer.subscription.created" || eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
    await syncSubscriptionFromStripeObject(object, getString(object.status));
    return NextResponse.json({ received: true });
  }

  if (eventType === "invoice.payment_failed" || eventType === "invoice.payment_succeeded") {
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
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true, ignored: true });
}
