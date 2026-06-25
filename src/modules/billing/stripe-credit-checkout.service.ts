import { MembershipTier, Prisma, StripeCheckoutKind } from "@prisma/client";
import type Stripe from "stripe";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { getStripeClient, getStripeRuntimeConfig } from "@/lib/platform/stripe";

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

  const stripe = await getStripeClient();
  const customerId =
    membership.stripeCustomerId ??
    (
      await stripe.customers.create({
        email: user.email,
        name: user.profile?.displayName ?? user.username,
        metadata: {
          userId: user.id
        }
      })
    ).id;

  if (!membership.stripeCustomerId) {
    await prisma.membership.update({
      where: { userId: user.id },
      data: { stripeCustomerId: customerId }
    });
  }

  const origin = new URL(input.origin).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: packageRule.stripePriceId, quantity: 1 }],
    success_url: `${origin}/ads?credits=success`,
    cancel_url: `${origin}/ads?credits=cancel`,
    metadata: {
      checkoutKind: StripeCheckoutKind.CREDIT_PURCHASE,
      userId: user.id,
      creditPackageKey: packageRule.key,
      creditAmount: String(packageRule.creditAmount)
    },
    payment_intent_data: {
      metadata: {
        checkoutKind: StripeCheckoutKind.CREDIT_PURCHASE,
        userId: user.id,
        creditPackageKey: packageRule.key,
        creditAmount: String(packageRule.creditAmount)
      }
    }
  });

  await diagnostics.info(MODULE_KEY, "Stripe credit checkout session created.", {
    userId: user.id,
    creditPackageKey: packageRule.key,
    creditAmount: packageRule.creditAmount,
    price: money(packageRule.priceCents, config.currency),
    checkoutSessionId: session.id
  });

  return { ok: true as const, url: session.url };
}

export async function fulfillCreditCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") {
    await diagnostics.warn(MODULE_KEY, "Credit checkout fulfillment skipped because payment is not paid.", {
      checkoutSessionId: session.id,
      paymentStatus: session.payment_status
    });
    return { ok: true as const, skipped: true };
  }

  const userId = session.metadata?.userId;
  const creditPackageKey = session.metadata?.creditPackageKey;
  const creditAmount = Number(session.metadata?.creditAmount);

  if (!userId || !creditPackageKey || !Number.isInteger(creditAmount) || creditAmount <= 0) {
    return { ok: false as const, error: "Stripe checkout session is missing credit metadata." };
  }

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
