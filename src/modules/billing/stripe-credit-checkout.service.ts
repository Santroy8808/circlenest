import { BillingCheckoutIntentStatus, MembershipTier, Prisma, StripeCheckoutKind } from "@prisma/client";
import type Stripe from "stripe";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { getStripeClient, getStripeRuntimeConfig } from "@/lib/platform/stripe";
import {
  attachCheckoutSession,
  completeCheckoutIntent,
  getOrCreateCheckoutIntent,
  resolveCheckoutOrigin,
  reusableCheckoutSessionUrl
} from "@/modules/billing/checkout-intents.service";

const MODULE_KEY = "stripe-credit-checkout";

const defaultCreditPackages = [
  {
    key: "credits.starter.25",
    label: "Starter credit pack",
    description: "Small ad-credit pack for first listings, boosts, and small ad tests.",
    creditAmount: 25,
    priceCents: 500,
    sortOrder: 10
  },
  {
    key: "credits.builder.75",
    label: "Builder credit pack",
    description: "Medium ad-credit pack for recurring Market and right-rail campaigns.",
    creditAmount: 75,
    priceCents: 1200,
    sortOrder: 20
  },
  {
    key: "credits.business.200",
    label: "Business credit pack",
    description: "Larger ad-credit pack for Professional storefront and campaign activity.",
    creditAmount: 200,
    priceCents: 2500,
    sortOrder: 30
  }
] as const;

export type StripeCreditPackageView = {
  key: string;
  label: string;
  description: string | null;
  creditAmount: number;
  priceCents: number;
  stripePriceId: string | null;
  active: boolean;
  sortOrder: number;
  checkoutReady: boolean;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { currency: currency.toUpperCase(), style: "currency" }).format(cents / 100);
}

function toCreditPackageView(packageRule: {
  key: string;
  label: string;
  description: string | null;
  creditAmount: number;
  priceCents: number;
  stripePriceId: string | null;
  active: boolean;
  sortOrder: number;
}, creditCheckoutEnabled: boolean): StripeCreditPackageView {
  return {
    key: packageRule.key,
    label: packageRule.label,
    description: packageRule.description,
    creditAmount: packageRule.creditAmount,
    priceCents: packageRule.priceCents,
    stripePriceId: packageRule.stripePriceId,
    active: packageRule.active,
    sortOrder: packageRule.sortOrder,
    checkoutReady: creditCheckoutEnabled && Boolean(packageRule.stripePriceId)
  };
}

export async function ensureDefaultStripeCreditPackages() {
  await Promise.all(
    defaultCreditPackages.map((packageRule) =>
      prisma.stripeCreditPackage.upsert({
        where: { key: packageRule.key },
        update: {},
        create: packageRule
      })
    )
  );
}

export async function listStripeCreditPackages(includeInactive = false) {
  await ensureDefaultStripeCreditPackages();
  const config = await getStripeRuntimeConfig();
  const packages = await prisma.stripeCreditPackage.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: "asc" }, { creditAmount: "asc" }]
  });

  return packages.map((packageRule) => toCreditPackageView(packageRule, config.creditCheckoutEnabled));
}

export async function createCreditCheckoutSession(input: {
  userId: string;
  packageKey: string;
  origin: string;
  idempotencyKey?: string;
}) {
  await ensureDefaultStripeCreditPackages();

  const [config, packageRule, user, membership] = await Promise.all([
    getStripeRuntimeConfig(),
    prisma.stripeCreditPackage.findFirst({
      where: {
        key: input.packageKey,
        active: true
      }
    }),
    prisma.user.findUnique({
      where: { id: input.userId },
      include: { profile: true }
    }),
    prisma.membership.upsert({
      where: { userId: input.userId },
      update: {},
      create: { userId: input.userId }
    })
  ]);

  if (!config.creditCheckoutEnabled) {
    return { ok: false as const, error: "Credit checkout is disabled." };
  }

  if (!config.secretKey || !config.webhookSecret) {
    return { ok: false as const, error: "Stripe credit checkout is not fully configured." };
  }

  if (!packageRule) {
    return { ok: false as const, error: "Choose an active credit package." };
  }

  if (!packageRule.stripePriceId) {
    return { ok: false as const, error: "Stripe price is not configured for this credit package." };
  }

  if (!user) {
    return { ok: false as const, error: "User was not found." };
  }

  const intentResult = await getOrCreateCheckoutIntent({
    userId: user.id,
    idempotencyKey: input.idempotencyKey,
    kind: StripeCheckoutKind.CREDIT_PURCHASE,
    creditPackageKey: packageRule.key,
    creditAmountSnapshot: packageRule.creditAmount,
    stripePriceIdSnapshot: packageRule.stripePriceId,
    amountCentsSnapshot: packageRule.priceCents,
    currencySnapshot: config.currency
  });

  if (!intentResult.ok) return intentResult;

  const stripe = await getStripeClient();
  const reusableUrl = await reusableCheckoutSessionUrl(intentResult.intent, stripe);
  if (reusableUrl) return { ok: true as const, url: reusableUrl, reused: true };

  const customerId =
    membership.stripeCustomerId ??
    (
      await stripe.customers.create({
        email: user.email,
        name: user.profile?.displayName ?? user.username,
        metadata: {
          userId: user.id
        }
      }, {
        idempotencyKey: `theta-customer-${user.id}`
      })
    ).id;

  if (!membership.stripeCustomerId) {
    await prisma.membership.update({
      where: { userId: user.id },
      data: { stripeCustomerId: customerId }
    });
  }

  const origin = resolveCheckoutOrigin(input.origin);
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer: customerId,
      line_items: [{ price: intentResult.intent.stripePriceIdSnapshot, quantity: 1 }],
      success_url: `${origin}/ads?credits=success`,
      cancel_url: `${origin}/ads?credits=cancel`,
      metadata: {
        checkoutIntentId: intentResult.intent.id,
        checkoutKind: StripeCheckoutKind.CREDIT_PURCHASE,
        userId: user.id,
        creditPackageKey: packageRule.key,
        creditAmount: String(packageRule.creditAmount)
      },
      payment_intent_data: {
        metadata: {
          checkoutIntentId: intentResult.intent.id,
          checkoutKind: StripeCheckoutKind.CREDIT_PURCHASE,
          userId: user.id,
          creditPackageKey: packageRule.key
        }
      }
    },
    {
      idempotencyKey: intentResult.stripeIdempotencyKey
    }
  );

  await attachCheckoutSession(intentResult.intent.id, session);

  await diagnostics.info(MODULE_KEY, "Stripe credit checkout session created.", {
    userId: user.id,
    creditPackageKey: packageRule.key,
    creditAmount: packageRule.creditAmount,
    price: money(packageRule.priceCents, config.currency),
    checkoutSessionId: session.id
  });

  return { ok: true as const, url: session.url };
}

async function backfillLegacyCreditCheckoutIntent(session: Stripe.Checkout.Session) {
  const existing = await prisma.billingCheckoutIntent.findUnique({
    where: { stripeCheckoutSessionId: session.id }
  });
  if (existing) return existing;

  const userId = session.metadata?.userId;
  const creditPackageKey = session.metadata?.creditPackageKey;
  const creditAmount = Number(session.metadata?.creditAmount);
  if (!userId || !creditPackageKey || !Number.isInteger(creditAmount) || creditAmount <= 0) return null;

  const [packageRule, user, config] = await Promise.all([
    prisma.stripeCreditPackage.findUnique({ where: { key: creditPackageKey } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    getStripeRuntimeConfig()
  ]);
  if (
    !packageRule ||
    !user ||
    packageRule.creditAmount !== creditAmount ||
    session.amount_total !== packageRule.priceCents ||
    session.currency?.toUpperCase() !== config.currency.toUpperCase() ||
    !packageRule.stripePriceId
  ) {
    return null;
  }

  return prisma.billingCheckoutIntent.upsert({
    where: { idempotencyKey: `legacy:${session.id}` },
    update: {},
    create: {
      idempotencyKey: `legacy:${session.id}`,
      userId,
      kind: StripeCheckoutKind.CREDIT_PURCHASE,
      creditPackageKey,
      creditAmountSnapshot: creditAmount,
      stripePriceIdSnapshot: packageRule.stripePriceId,
      amountCentsSnapshot: packageRule.priceCents,
      currencySnapshot: config.currency.toUpperCase(),
      stripeCheckoutSessionId: session.id,
      status: BillingCheckoutIntentStatus.SESSION_CREATED,
      sessionCreatedAt: new Date(session.created * 1000),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });
}

export async function fulfillCreditCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") {
    await diagnostics.warn(MODULE_KEY, "Credit checkout fulfillment skipped because payment is not paid.", {
      checkoutSessionId: session.id,
      paymentStatus: session.payment_status
    });
    return { ok: true as const, skipped: true };
  }

  const checkoutIntentId = session.metadata?.checkoutIntentId;
  const intent = checkoutIntentId
    ? await prisma.billingCheckoutIntent.findUnique({ where: { id: checkoutIntentId } })
    : await backfillLegacyCreditCheckoutIntent(session);
  if (
    !intent ||
    intent.kind !== StripeCheckoutKind.CREDIT_PURCHASE ||
    intent.stripeCheckoutSessionId !== session.id ||
    !intent.userId ||
    !intent.creditPackageKey ||
    !intent.creditAmountSnapshot
  ) {
    return { ok: false as const, error: "Stripe checkout session does not match its server intent." };
  }

  if (intent.status === BillingCheckoutIntentStatus.COMPLETED) {
    return { ok: true as const, skipped: true };
  }

  if (
    session.amount_total !== intent.amountCentsSnapshot ||
    session.currency?.toUpperCase() !== intent.currencySnapshot
  ) {
    return { ok: false as const, error: "Stripe checkout amount does not match its server snapshot." };
  }

  const userId = intent.userId;
  const creditPackageKey = intent.creditPackageKey;
  const creditAmount = intent.creditAmountSnapshot;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.stripeCheckoutFulfillment.create({
        data: {
          stripeCheckoutSessionId: session.id,
          userId,
          kind: StripeCheckoutKind.CREDIT_PURCHASE,
          creditPackageKey,
          creditsGranted: creditAmount
        }
      });

      const completed = await completeCheckoutIntent(tx, intent.id);
      if (!completed) throw new Error("Checkout intent could not be completed atomically.");

      await tx.membership.upsert({
        where: { userId },
        update: {
          platformCredits: {
            increment: creditAmount
          }
        },
        create: {
          userId,
          tier: MembershipTier.FREE,
          platformCredits: creditAmount
        }
      });

      await tx.adCreditLedgerEntry.create({
        data: {
          userId,
          amount: creditAmount,
          reason: `Stripe credit purchase: ${creditPackageKey}`,
          sourceType: "StripeCheckoutSession",
          sourceId: session.id
        }
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await diagnostics.info(MODULE_KEY, "Stripe credit checkout already fulfilled.", {
        checkoutSessionId: session.id
      });
      return { ok: true as const, skipped: true };
    }

    throw error;
  }

  await writeAuditLog({
    module: MODULE_KEY,
    action: "stripe.credits.fulfilled",
    targetType: "User",
    targetId: userId,
    metadata: {
      checkoutSessionId: session.id,
      creditPackageKey,
      creditsGranted: creditAmount
    }
  });

  await diagnostics.info(MODULE_KEY, "Stripe credit checkout fulfilled.", {
    checkoutSessionId: session.id,
    userId,
    creditPackageKey,
    creditsGranted: creditAmount
  });

  return { ok: true as const };
}
