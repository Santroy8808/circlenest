import { createHash, randomUUID } from "node:crypto";
import {
  BillingCheckoutIntentStatus,
  MembershipTier,
  Prisma,
  StripeCheckoutKind,
  type BillingCheckoutIntent
} from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/platform/db";
import { readPlatformEnv } from "@/lib/platform/env";

const CHECKOUT_INTENT_TTL_MS = 30 * 60 * 1000;
const CLIENT_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,200}$/;

type CheckoutIntentSnapshot = {
  userId: string;
  idempotencyKey?: string;
  kind: StripeCheckoutKind;
  targetTier?: MembershipTier | null;
  creditPackageKey?: string | null;
  creditAmountSnapshot?: number | null;
  stripePriceIdSnapshot: string;
  amountCentsSnapshot: number;
  currencySnapshot: string;
};

function snapshotMatches(intent: BillingCheckoutIntent, input: CheckoutIntentSnapshot) {
  return (
    intent.userId === input.userId &&
    intent.kind === input.kind &&
    intent.targetTier === (input.targetTier ?? null) &&
    intent.creditPackageKey === (input.creditPackageKey ?? null) &&
    intent.creditAmountSnapshot === (input.creditAmountSnapshot ?? null) &&
    intent.stripePriceIdSnapshot === input.stripePriceIdSnapshot &&
    intent.amountCentsSnapshot === input.amountCentsSnapshot &&
    intent.currencySnapshot === input.currencySnapshot.toUpperCase()
  );
}

function durableIdempotencyKey(userId: string, kind: StripeCheckoutKind, clientKey: string) {
  return createHash("sha256").update(`${userId}:${kind}:${clientKey}`, "utf8").digest("hex");
}

export function resolveCheckoutOrigin(requestedOrigin: string) {
  const env = readPlatformEnv();
  const configuredOrigin = env.APP_ORIGIN || env.NEXTAUTH_URL;
  const candidate = process.env.NODE_ENV === "production" ? configuredOrigin : requestedOrigin || configuredOrigin;

  if (!candidate) throw new Error("Application origin is not configured.");

  const url = new URL(candidate);
  const isLocalDevelopment =
    process.env.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");

  if ((url.protocol !== "https:" && !isLocalDevelopment) || url.username || url.password) {
    throw new Error("Checkout origin is not allowed.");
  }

  return url.origin;
}

export async function getOrCreateCheckoutIntent(input: CheckoutIntentSnapshot) {
  const clientKey = input.idempotencyKey?.trim() || randomUUID();
  if (!CLIENT_IDEMPOTENCY_KEY_PATTERN.test(clientKey)) {
    return { ok: false as const, error: "Invalid checkout idempotency key." };
  }

  const currency = input.currencySnapshot.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isInteger(input.amountCentsSnapshot) || input.amountCentsSnapshot <= 0) {
    return { ok: false as const, error: "Invalid checkout price snapshot." };
  }

  const idempotencyKey = durableIdempotencyKey(input.userId, input.kind, clientKey);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHECKOUT_INTENT_TTL_MS);
  const intent = await prisma.billingCheckoutIntent.upsert({
    where: { idempotencyKey },
    update: {},
    create: {
      idempotencyKey,
      userId: input.userId,
      kind: input.kind,
      targetTier: input.targetTier ?? null,
      creditPackageKey: input.creditPackageKey ?? null,
      creditAmountSnapshot: input.creditAmountSnapshot ?? null,
      stripePriceIdSnapshot: input.stripePriceIdSnapshot,
      amountCentsSnapshot: input.amountCentsSnapshot,
      currencySnapshot: currency,
      expiresAt
    }
  });

  if (!snapshotMatches(intent, { ...input, currencySnapshot: currency })) {
    return { ok: false as const, error: "This checkout key was already used for a different purchase." };
  }

  if (intent.expiresAt <= now || intent.status === BillingCheckoutIntentStatus.EXPIRED) {
    await prisma.billingCheckoutIntent.updateMany({
      where: { id: intent.id, status: { in: [BillingCheckoutIntentStatus.PENDING, BillingCheckoutIntentStatus.SESSION_CREATED] } },
      data: { status: BillingCheckoutIntentStatus.EXPIRED }
    });
    return { ok: false as const, error: "This checkout attempt expired. Start a new checkout." };
  }

  if (
    intent.status === BillingCheckoutIntentStatus.CANCELED ||
    intent.status === BillingCheckoutIntentStatus.FAILED ||
    intent.status === BillingCheckoutIntentStatus.COMPLETED
  ) {
    return { ok: false as const, error: "This checkout key has already been finalized." };
  }

  return { ok: true as const, intent, stripeIdempotencyKey: `checkout-${intent.idempotencyKey}` };
}

export async function reusableCheckoutSessionUrl(intent: BillingCheckoutIntent, stripe: Stripe) {
  if (!intent.stripeCheckoutSessionId || intent.status !== BillingCheckoutIntentStatus.SESSION_CREATED) return null;

  const session = await stripe.checkout.sessions.retrieve(intent.stripeCheckoutSessionId);
  return session.status === "open" && session.url ? session.url : null;
}

export async function attachCheckoutSession(intentId: string, session: Stripe.Checkout.Session) {
  const updated = await prisma.billingCheckoutIntent.updateMany({
    where: {
      id: intentId,
      status: BillingCheckoutIntentStatus.PENDING,
      stripeCheckoutSessionId: null
    },
    data: {
      stripeCheckoutSessionId: session.id,
      stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null,
      sessionCreatedAt: new Date(),
      status: BillingCheckoutIntentStatus.SESSION_CREATED
    }
  });

  if (updated.count !== 1) {
    const existing = await prisma.billingCheckoutIntent.findUnique({ where: { id: intentId } });
    if (existing?.stripeCheckoutSessionId !== session.id) {
      throw new Error("Checkout intent was claimed by a different Stripe session.");
    }
  }
}

export async function markCheckoutIntentFailed(intentId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Stripe checkout failed.";
  await prisma.billingCheckoutIntent.updateMany({
    where: { id: intentId, status: BillingCheckoutIntentStatus.PENDING },
    data: {
      status: BillingCheckoutIntentStatus.FAILED,
      failedAt: new Date(),
      errorMessage: message.slice(0, 500)
    }
  });
}

export async function completeCheckoutIntent(
  tx: Prisma.TransactionClient,
  intentId: string,
  stripeSubscriptionId?: string | null
) {
  const completed = await tx.billingCheckoutIntent.updateMany({
    where: {
      id: intentId,
      status: { in: [BillingCheckoutIntentStatus.PENDING, BillingCheckoutIntentStatus.SESSION_CREATED] }
    },
    data: {
      status: BillingCheckoutIntentStatus.COMPLETED,
      completedAt: new Date(),
      stripeSubscriptionId: stripeSubscriptionId || undefined,
      errorMessage: null
    }
  });

  return completed.count === 1;
}
