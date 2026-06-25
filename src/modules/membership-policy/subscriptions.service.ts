import { MembershipSubscriptionStatus, MembershipTier, Prisma, StripeCheckoutKind } from "@prisma/client";
import type Stripe from "stripe";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { getStripeClient, getStripeRuntimeConfig, getStripeWebhookSecret } from "@/lib/platform/stripe";
import { fulfillCreditCheckoutSession } from "@/modules/billing/stripe-credit-checkout.service";
import { getTierPolicy } from "@/modules/membership-policy/policy";
import { ensureLaunchDefaults, stripePriceIdForTier } from "@/modules/membership-policy/launch-access.service";
import { getPublicPolicyMatrix } from "@/modules/membership-policy/membership-policy.service";

const MODULE_KEY = "membership-subscriptions";

export type SubscriptionUpgradePlanView = {
  tier: MembershipTier;
  displayName: string;
  summary: string;
  standardPriceCents: number;
  stripePriceId: string | null;
  monthlyCreditBudget: number;
  eligible: boolean;
  hiddenUntilEligible: boolean;
  current: boolean;
  checkoutReady: boolean;
};

function activeEligibilityWhere(userId: string, tier: MembershipTier) {
  return {
    userId,
    tier,
    active: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
  };
}

function statusFromStripe(status: Stripe.Subscription.Status): MembershipSubscriptionStatus {
  if (status === "active") return MembershipSubscriptionStatus.ACTIVE;
  if (status === "trialing") return MembershipSubscriptionStatus.TRIALING;
  if (status === "past_due") return MembershipSubscriptionStatus.PAST_DUE;
  if (status === "canceled") return MembershipSubscriptionStatus.CANCELED;
  if (status === "unpaid") return MembershipSubscriptionStatus.UNPAID;
  return MembershipSubscriptionStatus.INCOMPLETE;
}

function stripePeriodEnd(subscription: Stripe.Subscription) {
  const periodEnd = typeof (subscription as { current_period_end?: number }).current_period_end === "number" ? (subscription as { current_period_end?: number }).current_period_end : null;
  return periodEnd ? new Date(periodEnd * 1000) : null;
}

function canActivateStatus(status: MembershipSubscriptionStatus) {
  return status === MembershipSubscriptionStatus.ACTIVE || status === MembershipSubscriptionStatus.TRIALING;
}

export async function listAvailableSubscriptionUpgradePlans(userId: string): Promise<SubscriptionUpgradePlanView[]> {
  await ensureLaunchDefaults();

  const [membership, plans, orgEligibility] = await Promise.all([
    prisma.membership.findUnique({
      where: { userId },
      select: {
        tier: true
      }
    }),
    prisma.subscriptionPlanRule.findMany({
      where: {
        active: true
      },
      orderBy: {
        standardPriceCents: "asc"
      }
    }),
    prisma.membershipTierUpgradeEligibility.findFirst({
      where: activeEligibilityWhere(userId, MembershipTier.ORG),
      select: {
        id: true
      }
    })
  ]);

  const currentTier = membership?.tier ?? MembershipTier.FREE;
  const publicPaidTiers = new Set<MembershipTier>(
    getPublicPolicyMatrix()
      .map((policy) => policy.tier)
      .filter((tier) => tier !== MembershipTier.FREE)
  );
  const allowedTiers = new Set<MembershipTier>(publicPaidTiers);

  if (orgEligibility) {
    allowedTiers.add(MembershipTier.ORG);
  }

  return plans
    .filter((plan) => allowedTiers.has(plan.tier))
    .map((plan) => {
      const policy = getTierPolicy(plan.tier);
      const stripePriceId = plan.stripePriceId ?? stripePriceIdForTier(plan.tier);

      return {
        tier: plan.tier,
        displayName: plan.displayName,
        summary: policy.summary,
        standardPriceCents: plan.standardPriceCents,
        stripePriceId,
        monthlyCreditBudget: plan.monthlyCreditBudget,
        eligible: plan.tier !== MembershipTier.ORG || Boolean(orgEligibility),
        hiddenUntilEligible: plan.tier === MembershipTier.ORG,
        current: currentTier === plan.tier,
        checkoutReady: Boolean(stripePriceId)
      };
    });
}

export async function createSubscriptionCheckoutSession(input: {
  userId: string;
  targetTier: MembershipTier;
  origin: string;
}) {
  if (input.targetTier === MembershipTier.FREE) {
    return { ok: false as const, error: "Free tier does not require checkout." };
  }

  const availablePlans = await listAvailableSubscriptionUpgradePlans(input.userId);
  const targetPlan = availablePlans.find((plan) => plan.tier === input.targetTier);

  if (!targetPlan?.eligible) {
    return { ok: false as const, error: "This upgrade is not available for this account." };
  }

  if (!targetPlan.stripePriceId) {
    return { ok: false as const, error: "Stripe price is not configured for this plan." };
  }

  const stripeConfig = await getStripeRuntimeConfig();

  if (!stripeConfig.subscriptionCheckoutEnabled) {
    return { ok: false as const, error: "Subscription checkout is disabled." };
  }

  if (!stripeConfig.secretKey || !stripeConfig.webhookSecret) {
    return { ok: false as const, error: "Stripe subscription checkout is not fully configured." };
  }

  const [user, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      include: {
        profile: true
      }
    }),
    prisma.membership.upsert({
      where: { userId: input.userId },
      update: {},
      create: {
        userId: input.userId
      }
    })
  ]);

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
      data: {
        stripeCustomerId: customerId
      }
    });
  }

  const origin = new URL(input.origin).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: targetPlan.stripePriceId, quantity: 1 }],
    success_url: `${origin}/settings/subscription?checkout=success`,
    cancel_url: `${origin}/settings/subscription?checkout=cancel`,
    metadata: {
      userId: user.id,
      targetTier: input.targetTier
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        targetTier: input.targetTier
      }
    }
  });

  await diagnostics.info(MODULE_KEY, "Stripe checkout session created.", {
    userId: user.id,
    targetTier: input.targetTier,
    checkoutSessionId: session.id
  });

  return { ok: true as const, url: session.url };
}

async function applyStripeSubscription(input: {
  userId: string;
  targetTier: MembershipTier;
  stripeCustomerId: string | null;
  subscription: Stripe.Subscription;
}) {
  const status = statusFromStripe(input.subscription.status);
  const targetPolicy = getTierPolicy(input.targetTier);
  const activeTier = canActivateStatus(status) ? input.targetTier : MembershipTier.FREE;
  const activePolicy = getTierPolicy(activeTier);

  const membership = await prisma.membership.upsert({
    where: { userId: input.userId },
    update: {
      tier: activeTier,
      storageLimitBytes: BigInt(activePolicy.limits.storageLimitBytes),
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.subscription.id,
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: stripePeriodEnd(input.subscription),
      subscriptionCancelAtPeriodEnd: Boolean(input.subscription.cancel_at_period_end)
    },
    create: {
      userId: input.userId,
      tier: activeTier,
      storageLimitBytes: BigInt(activePolicy.limits.storageLimitBytes),
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.subscription.id,
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: stripePeriodEnd(input.subscription),
      subscriptionCancelAtPeriodEnd: Boolean(input.subscription.cancel_at_period_end)
    }
  });

  if (input.targetTier === MembershipTier.ORG && canActivateStatus(status)) {
    await prisma.membershipTierUpgradeEligibility.updateMany({
      where: {
        userId: input.userId,
        tier: MembershipTier.ORG
      },
      data: {
        active: false
      }
    });
  }

  await writeAuditLog({
    module: MODULE_KEY,
    action: "stripe.subscription.synced",
    targetType: "User",
    targetId: input.userId,
    severity: canActivateStatus(status) ? "info" : "warning",
    metadata: {
      targetTier: input.targetTier,
      activeTier,
      targetTierName: targetPolicy.displayName,
      stripeSubscriptionId: input.subscription.id,
      subscriptionStatus: status
    } as Prisma.InputJsonObject
  });

  return membership;
}

async function userIdForSubscription(subscription: Stripe.Subscription) {
  const metadataUserId = subscription.metadata?.userId;
  if (metadataUserId) return metadataUserId;

  const membership = await prisma.membership.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    select: { userId: true }
  });

  return membership?.userId ?? null;
}

async function tierForSubscription(subscription: Stripe.Subscription) {
  const parsed = Object.values(MembershipTier).find((tier) => tier === subscription.metadata?.targetTier);
  if (parsed) return parsed;

  const membership = await prisma.membership.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    select: { tier: true }
  });

  return membership?.tier ?? MembershipTier.FREE;
}

export async function handleStripeWebhook(rawBody: string, signature: string | null) {
  if (!signature) {
    return { ok: false as const, error: "Missing Stripe signature." };
  }

  const stripe = await getStripeClient();
  const event = stripe.webhooks.constructEvent(rawBody, signature, await getStripeWebhookSecret());

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.checkoutKind === StripeCheckoutKind.CREDIT_PURCHASE) {
      const result = await fulfillCreditCheckoutSession(session);
      return result.ok ? { ok: true as const, eventType: event.type } : result;
    }

    const userId = session.metadata?.userId;
    const targetTier = Object.values(MembershipTier).find((tier) => tier === session.metadata?.targetTier);
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

    if (userId && targetTier && subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await applyStripeSubscription({
        userId,
        targetTier,
        stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
        subscription
      });
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = await userIdForSubscription(subscription);
    const targetTier = await tierForSubscription(subscription);

    if (userId) {
      await applyStripeSubscription({
        userId,
        targetTier,
        stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
        subscription
      });
    }
  }

  return { ok: true as const, eventType: event.type };
}
