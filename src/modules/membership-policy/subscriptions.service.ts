import {
  BillingCheckoutIntentStatus,
  MembershipSubscriptionStatus,
  MembershipTier,
  Prisma,
  StripeCheckoutKind
} from "@prisma/client";
import type Stripe from "stripe";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { getStripeClient, getStripeRuntimeConfig, getStripeWebhookSecret } from "@/lib/platform/stripe";
import { fulfillCreditCheckoutSession } from "@/modules/billing/stripe-credit-checkout.service";
import {
  attachCheckoutSession,
  completeCheckoutIntent,
  getOrCreateCheckoutIntent,
  resolveCheckoutOrigin,
  reusableCheckoutSessionUrl
} from "@/modules/billing/checkout-intents.service";
import { processStripeWebhookEventOnce } from "@/modules/billing/stripe-webhook-events.service";
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
  idempotencyKey?: string;
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
  if (membership.stripeSubscriptionId && membership.subscriptionStatus !== MembershipSubscriptionStatus.CANCELED) {
    return { ok: false as const, error: "This account already has a Stripe subscription. Manage that subscription before starting another." };
  }

  const intentResult = await getOrCreateCheckoutIntent({
    userId: user.id,
    idempotencyKey: input.idempotencyKey,
    kind: StripeCheckoutKind.SUBSCRIPTION,
    targetTier: input.targetTier,
    stripePriceIdSnapshot: targetPlan.stripePriceId,
    amountCentsSnapshot: targetPlan.standardPriceCents,
    currencySnapshot: stripeConfig.currency
  });

  if (!intentResult.ok) return intentResult;

  const canonicalIntent = await prisma.billingCheckoutIntent.findFirst({
    where: {
      userId: user.id,
      kind: StripeCheckoutKind.SUBSCRIPTION,
      status: { in: [BillingCheckoutIntentStatus.PENDING, BillingCheckoutIntentStatus.SESSION_CREATED] },
      expiresAt: { gt: new Date() }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  if (canonicalIntent && canonicalIntent.id !== intentResult.intent.id) {
    await prisma.billingCheckoutIntent.updateMany({
      where: { id: intentResult.intent.id, status: BillingCheckoutIntentStatus.PENDING },
      data: { status: BillingCheckoutIntentStatus.CANCELED, canceledAt: new Date() }
    });

    if (canonicalIntent.targetTier !== input.targetTier) {
      return { ok: false as const, error: "Another subscription checkout is already in progress." };
    }

    const canonicalUrl = await reusableCheckoutSessionUrl(canonicalIntent, stripe);
    if (canonicalUrl) return { ok: true as const, url: canonicalUrl, reused: true };
    return { ok: false as const, error: "A subscription checkout is already being prepared. Try again shortly." };
  }

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
      data: {
        stripeCustomerId: customerId
      }
    });
  }

  const origin = resolveCheckoutOrigin(input.origin);
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: intentResult.intent.stripePriceIdSnapshot, quantity: 1 }],
      success_url: `${origin}/settings/subscription?checkout=success`,
      cancel_url: `${origin}/settings/subscription?checkout=cancel`,
      metadata: {
        checkoutIntentId: intentResult.intent.id,
        checkoutKind: StripeCheckoutKind.SUBSCRIPTION,
        userId: user.id,
        targetTier: input.targetTier
      },
      subscription_data: {
        metadata: {
          checkoutIntentId: intentResult.intent.id,
          userId: user.id,
          targetTier: input.targetTier
        }
      }
    },
    {
      idempotencyKey: intentResult.stripeIdempotencyKey
    }
  );

  await attachCheckoutSession(intentResult.intent.id, session);

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
  checkoutIntentId?: string;
}) {
  const status = statusFromStripe(input.subscription.status);
  const targetPolicy = getTierPolicy(input.targetTier);
  const activeTier = canActivateStatus(status) ? input.targetTier : MembershipTier.FREE;
  const activePolicy = getTierPolicy(activeTier);

  const membership = await prisma.$transaction(async (tx) => {
    const updatedMembership = await tx.membership.upsert({
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
      await tx.membershipTierUpgradeEligibility.updateMany({
        where: {
          userId: input.userId,
          tier: MembershipTier.ORG
        },
        data: {
          active: false
        }
      });
    }

    if (input.checkoutIntentId) {
      const completed = await completeCheckoutIntent(tx, input.checkoutIntentId, input.subscription.id);
      if (!completed) {
        const intent = await tx.billingCheckoutIntent.findUnique({ where: { id: input.checkoutIntentId } });
        if (intent?.status !== BillingCheckoutIntentStatus.COMPLETED) {
          throw new Error("Subscription checkout intent could not be completed atomically.");
        }
      }
    }

    return updatedMembership;
  });

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

  const processing = await processStripeWebhookEventOnce(event, async () => {
    if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const intent = session.metadata?.checkoutIntentId
        ? await prisma.billingCheckoutIntent.findUnique({ where: { id: session.metadata.checkoutIntentId } })
        : await prisma.billingCheckoutIntent.findUnique({ where: { stripeCheckoutSessionId: session.id } });

      if (intent) {
        const failed = event.type === "checkout.session.async_payment_failed";
        await prisma.billingCheckoutIntent.updateMany({
          where: {
            id: intent.id,
            status: { in: [BillingCheckoutIntentStatus.PENDING, BillingCheckoutIntentStatus.SESSION_CREATED] }
          },
          data: failed
            ? {
                status: BillingCheckoutIntentStatus.FAILED,
                failedAt: new Date(),
                errorMessage: "Stripe reported that asynchronous payment failed."
              }
            : {
                status: BillingCheckoutIntentStatus.EXPIRED
              }
        });
      }
      return;
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.checkoutKind === StripeCheckoutKind.CREDIT_PURCHASE) {
        const result = await fulfillCreditCheckoutSession(session);
        if (!result.ok) throw new Error(result.error);
        return;
      }

      const checkoutIntentId = session.metadata?.checkoutIntentId;
      const intent = checkoutIntentId
        ? await prisma.billingCheckoutIntent.findUnique({ where: { id: checkoutIntentId } })
        : null;
      const legacyUserId = session.metadata?.userId;
      const legacyTargetTier = Object.values(MembershipTier).find((tier) => tier === session.metadata?.targetTier);
      const userId = intent?.userId ?? legacyUserId;
      const targetTier = intent?.targetTier ?? legacyTargetTier;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

      if (!userId || !targetTier || !subscriptionId) {
        throw new Error("Stripe subscription checkout is missing server identity data.");
      }

      if (intent) {
        if (
          intent.kind !== StripeCheckoutKind.SUBSCRIPTION ||
          intent.stripeCheckoutSessionId !== session.id ||
          intent.targetTier !== targetTier ||
          session.amount_total !== intent.amountCentsSnapshot ||
          session.currency?.toUpperCase() !== intent.currencySnapshot
        ) {
          throw new Error("Stripe subscription checkout does not match its server intent.");
        }
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await applyStripeSubscription({
        userId,
        targetTier,
        stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
        subscription,
        checkoutIntentId: intent?.id
      });
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = await userIdForSubscription(subscription);
      const targetTier = await tierForSubscription(subscription);

      if (!userId) throw new Error("Stripe subscription event could not be matched to a user.");

      const checkoutIntentId = subscription.metadata?.checkoutIntentId;
      if (checkoutIntentId) {
        const intent = await prisma.billingCheckoutIntent.findUnique({ where: { id: checkoutIntentId } });
        if (
          !intent ||
          intent.kind !== StripeCheckoutKind.SUBSCRIPTION ||
          intent.userId !== userId ||
          intent.targetTier !== targetTier ||
          !subscription.items.data.some((item) => item.price.id === intent.stripePriceIdSnapshot)
        ) {
          throw new Error("Stripe subscription does not match its server checkout intent.");
        }
      }

      await applyStripeSubscription({
        userId,
        targetTier,
        stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
        subscription,
        checkoutIntentId
      });
    }
  });

  return {
    ok: true as const,
    eventType: event.type,
    duplicate: "duplicate" in processing ? processing.duplicate : false,
    inProgress: "inProgress" in processing ? processing.inProgress : false,
    outOfOrder: "outOfOrder" in processing ? processing.outOfOrder : false
  };
}
