import {
  BillingCheckoutIntentStatus,
  DestructiveActionKind,
  DestructiveActionStatus,
  MembershipSubscriptionStatus,
  MembershipTier,
  MembershipUpgradeMode,
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
import { getTierPolicy, isOperationalMembershipTier, normalizeOperationalMembershipTier } from "@/modules/membership-policy/policy";
import { ensureLaunchDefaults, stripePriceIdForTier } from "@/modules/membership-policy/launch-access.service";
import { getContributorUpgradeOfferForUser } from "@/modules/membership-policy/contributor-upgrade.service";

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
  upgradeMode: MembershipUpgradeMode;
  offerId: string | null;
  currentPriceCents: number;
  futureMonthlyPriceCents: number | null;
  betaMessage: string | null;
  canAcceptOffer: boolean;
};

export type SubscriptionBillingSummary = {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: MembershipSubscriptionStatus;
  subscriptionCurrentPeriodEnd: string | null;
  subscriptionCancelAtPeriodEnd: boolean;
  canManageBilling: boolean;
};

function statusFromStripe(status: Stripe.Subscription.Status): MembershipSubscriptionStatus {
  if (status === "active") return MembershipSubscriptionStatus.ACTIVE;
  if (status === "trialing") return MembershipSubscriptionStatus.TRIALING;
  if (status === "past_due") return MembershipSubscriptionStatus.PAST_DUE;
  if (status === "canceled" || status === "incomplete_expired") return MembershipSubscriptionStatus.CANCELED;
  if (status === "unpaid") return MembershipSubscriptionStatus.UNPAID;
  return MembershipSubscriptionStatus.INCOMPLETE;
}

export function resolveStripeSubscriptionPeriodEnd(input: {
  itemCurrentPeriodEnds: Array<number | null | undefined>;
  legacyCurrentPeriodEnd?: number | null;
}) {
  const itemPeriodEnds = input.itemCurrentPeriodEnds.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
  );
  const periodEnd = itemPeriodEnds.length > 0
    ? Math.min(...itemPeriodEnds)
    : typeof input.legacyCurrentPeriodEnd === "number" &&
        Number.isFinite(input.legacyCurrentPeriodEnd) &&
        input.legacyCurrentPeriodEnd > 0
      ? input.legacyCurrentPeriodEnd
      : null;

  return periodEnd ? new Date(periodEnd * 1000) : null;
}

function stripePeriodEnd(subscription: Stripe.Subscription) {
  const legacyCurrentPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number | null })
    .current_period_end;
  return resolveStripeSubscriptionPeriodEnd({
    itemCurrentPeriodEnds: subscription.items.data.map((item) => item.current_period_end),
    legacyCurrentPeriodEnd
  });
}

export function stripeSubscriptionRequiresAccountDeletionCancellation(status: Stripe.Subscription.Status) {
  return status !== "canceled" && status !== "incomplete_expired";
}

export function accountDeletionStripeIdempotencyKey(
  destructiveActionRequestId: string,
  resourceKind: "subscription" | "checkout-session",
  stripeResourceId: string
) {
  return `account-delete:${destructiveActionRequestId}:${resourceKind}:${stripeResourceId}`;
}

export function stripeCheckoutIntentMatchesUser(input: {
  intentUserId: string | null;
  eventUserId: string;
  deletionBound: boolean;
}) {
  return input.intentUserId === input.eventUserId || (input.intentUserId === null && input.deletionBound);
}

function canActivateStatus(status: MembershipSubscriptionStatus) {
  return status === MembershipSubscriptionStatus.ACTIVE || status === MembershipSubscriptionStatus.TRIALING;
}

export function resolveStripeMembershipApplicationState(input: {
  subscriptionStatus: MembershipSubscriptionStatus;
  targetTier: MembershipTier;
  accountBlocked: boolean;
}) {
  const activeTier =
    !input.accountBlocked &&
    canActivateStatus(input.subscriptionStatus) &&
    isOperationalMembershipTier(input.targetTier)
      ? input.targetTier
      : MembershipTier.FREE;
  return {
    activeTier,
    storageLimitBytes: getTierPolicy(activeTier).limits.storageLimitBytes
  };
}

type StripeClient = Awaited<ReturnType<typeof getStripeClient>>;

async function listStripeSubscriptionsForCustomer(stripe: StripeClient, stripeCustomerId: string) {
  const subscriptions: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {})
    });
    subscriptions.push(...page.data);
    if (!page.has_more) return subscriptions;

    const lastSubscription = page.data.at(-1);
    if (!lastSubscription) {
      throw new Error("Stripe returned an incomplete subscription page.");
    }
    startingAfter = lastSubscription.id;
  }
}

async function listOpenStripeSubscriptionCheckoutSessionsForCustomer(
  stripe: StripeClient,
  stripeCustomerId: string
) {
  const sessions: Stripe.Checkout.Session[] = [];
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.checkout.sessions.list({
      customer: stripeCustomerId,
      status: "open",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {})
    });
    sessions.push(...page.data.filter((session) => session.mode === "subscription"));
    if (!page.has_more) return sessions;

    const lastSession = page.data.at(-1);
    if (!lastSession) {
      throw new Error("Stripe returned an incomplete checkout-session page.");
    }
    startingAfter = lastSession.id;
  }
}

async function cancelStripeSubscriptionForAccountDeletion(input: {
  stripe: StripeClient;
  subscription: Stripe.Subscription;
  destructiveActionRequestId: string;
}) {
  if (!stripeSubscriptionRequiresAccountDeletionCancellation(input.subscription.status)) {
    return { subscription: input.subscription, cancellationPerformed: false as const };
  }

  const subscription = await input.stripe.subscriptions.cancel(
    input.subscription.id,
    {
      invoice_now: false,
      prorate: false,
      cancellation_details: {
        comment: "Theta-Space account deletion"
      }
    },
    {
      idempotencyKey: accountDeletionStripeIdempotencyKey(
        input.destructiveActionRequestId,
        "subscription",
        input.subscription.id
      )
    }
  );
  if (stripeSubscriptionRequiresAccountDeletionCancellation(subscription.status)) {
    throw new Error(`Stripe did not confirm cancellation of subscription ${subscription.id}.`);
  }

  return { subscription, cancellationPerformed: true as const };
}

async function expireStripeCheckoutSessionForAccountDeletion(input: {
  stripe: StripeClient;
  stripeCheckoutSessionId: string;
  idempotencyKey: string;
}) {
  let session = await input.stripe.checkout.sessions.retrieve(input.stripeCheckoutSessionId);
  if (session.status !== "open") return session;

  try {
    session = await input.stripe.checkout.sessions.expire(
      input.stripeCheckoutSessionId,
      {},
      { idempotencyKey: input.idempotencyKey }
    );
  } catch (error) {
    const latestSession = await input.stripe.checkout.sessions.retrieve(input.stripeCheckoutSessionId);
    if (latestSession.status === "open") throw error;
    session = latestSession;
  }

  return session;
}

async function recordAccountDeletionSubscriptionEvidence(input: {
  userId: string;
  destructiveActionRequestId: string;
  stripeCustomerId: string | null;
  subscription: Stripe.Subscription;
  cancellationPerformed: boolean;
  source: "account-cleanup" | "webhook";
}) {
  const operationId =
    `account-delete:${input.destructiveActionRequestId}:stripe-subscription:${input.subscription.id}:terminal`;
  await prisma.auditLog.upsert({
    where: { operationId },
    update: {},
    create: {
      operationId,
      requestId: input.destructiveActionRequestId,
      module: MODULE_KEY,
      action: "stripe.subscription_terminal_for_account_deletion",
      targetType: "User",
      targetId: input.userId,
      severity: "critical",
      metadata: {
        source: input.source,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.subscription.id,
        stripeSubscriptionStatus: input.subscription.status,
        stripeCanceledAt: input.subscription.canceled_at,
        stripeEndedAt: input.subscription.ended_at,
        cancellationPerformed: input.cancellationPerformed
      }
    }
  });
}

export async function cancelSubscriptionForAccountDeletion(input: {
  userId: string;
  destructiveActionRequestId: string;
}) {
  const [membership, checkoutIntents] = await Promise.all([
    prisma.membership.findUnique({
      where: { userId: input.userId },
      select: {
        stripeCustomerId: true,
        stripeSubscriptionId: true
      }
    }),
    prisma.billingCheckoutIntent.findMany({
      where: {
        userId: input.userId,
        kind: StripeCheckoutKind.SUBSCRIPTION,
        status: { in: [BillingCheckoutIntentStatus.PENDING, BillingCheckoutIntentStatus.SESSION_CREATED] },
        stripeCheckoutSessionId: { not: null }
      },
      select: {
        id: true,
        stripeCheckoutSessionId: true
      }
    })
  ]);
  if (!membership?.stripeCustomerId && !membership?.stripeSubscriptionId && checkoutIntents.length === 0) {
    return {
      canceled: false,
      cancellationPerformed: false,
      stripeCustomerId: membership?.stripeCustomerId ?? null,
      stripeSubscriptionId: membership?.stripeSubscriptionId ?? null,
      stripeSubscriptionIds: [] as string[],
      expiredCheckoutSessionIds: [] as string[]
    };
  }

  const stripe = await getStripeClient();
  const seedSubscriptionIds = new Set<string>();
  const expiredCheckoutSessionIds = new Set<string>();
  if (membership?.stripeSubscriptionId) seedSubscriptionIds.add(membership.stripeSubscriptionId);

  for (const intent of checkoutIntents) {
    if (!intent.stripeCheckoutSessionId) continue;
    const session = await expireStripeCheckoutSessionForAccountDeletion({
      stripe,
      stripeCheckoutSessionId: intent.stripeCheckoutSessionId,
      idempotencyKey: accountDeletionStripeIdempotencyKey(
        input.destructiveActionRequestId,
        "checkout-session",
        intent.stripeCheckoutSessionId
      )
    });
    if (session.status === "expired") {
      expiredCheckoutSessionIds.add(session.id);
      await prisma.billingCheckoutIntent.updateMany({
        where: {
          id: intent.id,
          status: { in: [BillingCheckoutIntentStatus.PENDING, BillingCheckoutIntentStatus.SESSION_CREATED] }
        },
        data: {
          status: BillingCheckoutIntentStatus.CANCELED,
          canceledAt: new Date()
        }
      });
      continue;
    }

    if (session.status === "complete") {
      const stripeSubscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!stripeSubscriptionId) {
        throw new Error(`Completed Stripe checkout session ${session.id} has no subscription.`);
      }
      seedSubscriptionIds.add(stripeSubscriptionId);
      await prisma.billingCheckoutIntent.updateMany({
        where: {
          id: intent.id,
          status: { in: [BillingCheckoutIntentStatus.PENDING, BillingCheckoutIntentStatus.SESSION_CREATED] }
        },
        data: {
          status: BillingCheckoutIntentStatus.COMPLETED,
          completedAt: new Date(),
          stripeSubscriptionId
        }
      });
    }
  }

  if (membership?.stripeCustomerId) {
    const openSessions = await listOpenStripeSubscriptionCheckoutSessionsForCustomer(
      stripe,
      membership.stripeCustomerId
    );
    for (const openSession of openSessions) {
      const session = await expireStripeCheckoutSessionForAccountDeletion({
        stripe,
        stripeCheckoutSessionId: openSession.id,
        idempotencyKey: accountDeletionStripeIdempotencyKey(
          input.destructiveActionRequestId,
          "checkout-session",
          openSession.id
        )
      });
      if (session.status === "expired") {
        expiredCheckoutSessionIds.add(session.id);
        continue;
      }
      if (session.status === "complete") {
        const stripeSubscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (!stripeSubscriptionId) {
          throw new Error(`Completed Stripe checkout session ${session.id} has no subscription.`);
        }
        seedSubscriptionIds.add(stripeSubscriptionId);
      }
    }
  }

  const subscriptions = new Map<string, Stripe.Subscription>();
  const cancellationPerformedIds = new Set<string>();
  for (let reconciliationPass = 0; reconciliationPass < 2; reconciliationPass += 1) {
    if (membership?.stripeCustomerId) {
      for (const subscription of await listStripeSubscriptionsForCustomer(stripe, membership.stripeCustomerId)) {
        if (
          stripeSubscriptionRequiresAccountDeletionCancellation(subscription.status) ||
          seedSubscriptionIds.has(subscription.id) ||
          subscriptions.has(subscription.id)
        ) {
          subscriptions.set(subscription.id, subscription);
        }
      }
    }
    for (const stripeSubscriptionId of seedSubscriptionIds) {
      if (!subscriptions.has(stripeSubscriptionId)) {
        subscriptions.set(stripeSubscriptionId, await stripe.subscriptions.retrieve(stripeSubscriptionId));
      }
    }

    for (const subscription of subscriptions.values()) {
      const cancellation = await cancelStripeSubscriptionForAccountDeletion({
        stripe,
        subscription,
        destructiveActionRequestId: input.destructiveActionRequestId
      });
      subscriptions.set(cancellation.subscription.id, cancellation.subscription);
      if (cancellation.cancellationPerformed) {
        cancellationPerformedIds.add(cancellation.subscription.id);
      }
    }
  }

  const stillBillable = Array.from(subscriptions.values()).filter((subscription) =>
    stripeSubscriptionRequiresAccountDeletionCancellation(subscription.status)
  );
  if (stillBillable.length > 0) {
    throw new Error(`Stripe still reports ${stillBillable.length} billable subscription(s) for the deleting account.`);
  }

  const primarySubscription = membership?.stripeSubscriptionId
    ? subscriptions.get(membership.stripeSubscriptionId) ?? null
    : null;
  const freePolicy = getTierPolicy(MembershipTier.FREE);
  await prisma.$transaction(async (tx) => {
    const latestMembership = await tx.membership.findUnique({
      where: { userId: input.userId },
      select: { stripeCustomerId: true, stripeSubscriptionId: true }
    });
    if (
      Boolean(latestMembership) !== Boolean(membership) ||
      latestMembership?.stripeCustomerId !== membership?.stripeCustomerId ||
      latestMembership?.stripeSubscriptionId !== membership?.stripeSubscriptionId
    ) {
      throw new Error("Membership billing identity changed while its Stripe subscriptions were being canceled.");
    }
    if (!latestMembership) return;

    await tx.membership.update({
      where: { userId: input.userId },
      data: {
        tier: MembershipTier.FREE,
        storageLimitBytes: BigInt(freePolicy.limits.storageLimitBytes),
        subscriptionStatus:
          subscriptions.size > 0 ? MembershipSubscriptionStatus.CANCELED : MembershipSubscriptionStatus.NONE,
        subscriptionCurrentPeriodEnd: primarySubscription ? stripePeriodEnd(primarySubscription) : null,
        subscriptionCancelAtPeriodEnd: false
      }
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  for (const subscription of subscriptions.values()) {
    await recordAccountDeletionSubscriptionEvidence({
      userId: input.userId,
      destructiveActionRequestId: input.destructiveActionRequestId,
      stripeCustomerId: membership?.stripeCustomerId ?? null,
      subscription,
      cancellationPerformed: cancellationPerformedIds.has(subscription.id),
      source: "account-cleanup"
    });
  }

  const stripeSubscriptionIds = Array.from(subscriptions.keys()).sort();
  return {
    canceled: stripeSubscriptionIds.length > 0,
    cancellationPerformed: cancellationPerformedIds.size > 0,
    stripeCustomerId: membership?.stripeCustomerId ?? null,
    stripeSubscriptionId: membership?.stripeSubscriptionId ?? stripeSubscriptionIds[0] ?? null,
    stripeSubscriptionIds,
    expiredCheckoutSessionIds: Array.from(expiredCheckoutSessionIds).sort()
  };
}

export function resolveContributorPlanEligibility(input: {
  currentTier: MembershipTier;
  selfServiceEnabled: boolean;
  upgradeMode: MembershipUpgradeMode;
  offerCanAccept: boolean;
  stripePriceConfigured: boolean;
}) {
  const current = input.currentTier === MembershipTier.CONTRIBUTOR;
  const eligible = !current && input.selfServiceEnabled && input.offerCanAccept;

  return {
    current,
    eligible,
    checkoutReady:
      eligible &&
      input.upgradeMode === MembershipUpgradeMode.STRIPE &&
      input.stripePriceConfigured,
    canAcceptOffer:
      eligible && input.upgradeMode === MembershipUpgradeMode.BETA_FREE
  };
}

export async function getSubscriptionBillingSummary(userId: string): Promise<SubscriptionBillingSummary> {
  const membership = await prisma.membership.findUnique({
    where: { userId },
    select: {
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
      subscriptionCancelAtPeriodEnd: true
    }
  });

  return {
    stripeCustomerId: membership?.stripeCustomerId ?? null,
    stripeSubscriptionId: membership?.stripeSubscriptionId ?? null,
    subscriptionStatus: membership?.subscriptionStatus ?? MembershipSubscriptionStatus.NONE,
    subscriptionCurrentPeriodEnd: membership?.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
    subscriptionCancelAtPeriodEnd: membership?.subscriptionCancelAtPeriodEnd ?? false,
    canManageBilling: Boolean(membership?.stripeCustomerId)
  };
}

export async function listAvailableSubscriptionUpgradePlans(userId: string): Promise<SubscriptionUpgradePlanView[]> {
  await ensureLaunchDefaults();

  const [membership, plans, contributorOffer] = await Promise.all([
    prisma.membership.findUnique({
      where: { userId },
      select: {
        tier: true
      }
    }),
    prisma.subscriptionPlanRule.findMany({
      where: {
        active: true,
        memberVisible: true
      },
      orderBy: {
        standardPriceCents: "asc"
      }
    }),
    getContributorUpgradeOfferForUser(userId)
  ]);

  const currentTier = normalizeOperationalMembershipTier(membership?.tier);
  const contributorVisible =
    currentTier === MembershipTier.CONTRIBUTOR || Boolean(contributorOffer);

  return plans
    .filter((plan) => plan.tier === MembershipTier.CONTRIBUTOR && contributorVisible)
    .map((plan) => {
      const policy = getTierPolicy(plan.tier);
      const stripePriceId = plan.stripePriceId ?? stripePriceIdForTier(plan.tier);
      const betaOffer = contributorOffer ?? null;
      const eligibility = resolveContributorPlanEligibility({
        currentTier,
        selfServiceEnabled: plan.selfServiceEnabled,
        upgradeMode: plan.upgradeMode,
        offerCanAccept: betaOffer?.canAccept ?? false,
        stripePriceConfigured: Boolean(stripePriceId)
      });

      return {
        tier: plan.tier,
        displayName: plan.displayName,
        summary: policy.summary,
        standardPriceCents: plan.standardPriceCents,
        stripePriceId,
        monthlyCreditBudget: plan.monthlyCreditBudget,
        eligible: eligibility.eligible,
        hiddenUntilEligible: true,
        current: eligibility.current,
        checkoutReady: eligibility.checkoutReady,
        upgradeMode: plan.upgradeMode,
        offerId: betaOffer?.id ?? null,
        currentPriceCents: betaOffer?.currentPriceCents ?? plan.standardPriceCents,
        futureMonthlyPriceCents: betaOffer?.futureMonthlyPriceCents ?? plan.futurePriceCents,
        betaMessage: betaOffer?.message ?? null,
        canAcceptOffer: eligibility.canAcceptOffer
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

  if (!isOperationalMembershipTier(input.targetTier) || input.targetTier !== MembershipTier.CONTRIBUTOR) {
    return { ok: false as const, error: "This membership tier is not available." };
  }

  const currentMembership = await prisma.membership.findUnique({
    where: { userId: input.userId },
    select: { tier: true }
  });
  if (normalizeOperationalMembershipTier(currentMembership?.tier) === input.targetTier) {
    return { ok: false as const, error: `This account already has ${input.targetTier} membership.` };
  }

  const availablePlans = await listAvailableSubscriptionUpgradePlans(input.userId);
  const targetPlan = availablePlans.find((plan) => plan.tier === input.targetTier);

  if (!targetPlan?.eligible) {
    return { ok: false as const, error: "This upgrade is not available for this account." };
  }

  if (targetPlan.upgradeMode === MembershipUpgradeMode.BETA_FREE) {
    return { ok: false as const, error: "Accept the Contributor beta offer instead of starting checkout." };
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
  if (user.deactivatedAt) {
    return { ok: false as const, error: "Subscription checkout is unavailable for a deactivated account." };
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

  const checkoutUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { deactivatedAt: true }
  });
  if (!checkoutUser || checkoutUser.deactivatedAt) {
    await prisma.billingCheckoutIntent.updateMany({
      where: { id: intentResult.intent.id, status: BillingCheckoutIntentStatus.PENDING },
      data: { status: BillingCheckoutIntentStatus.CANCELED, canceledAt: new Date() }
    });
    return { ok: false as const, error: "Subscription checkout is unavailable for a deactivated account." };
  }

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

  const [currentUser, deletionRequest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { deactivatedAt: true }
    }),
    prisma.destructiveActionRequest.findFirst({
      where: {
        kind: DestructiveActionKind.DELETE_ACCOUNT,
        targetType: "User",
        targetId: user.id,
        status: {
          in: [
            DestructiveActionStatus.CONFIRMED,
            DestructiveActionStatus.QUEUED,
            DestructiveActionStatus.RUNNING,
            DestructiveActionStatus.SUCCEEDED
          ]
        }
      },
      select: { id: true }
    })
  ]);
  if (!currentUser || currentUser.deactivatedAt || deletionRequest) {
    const blockedSession = await expireStripeCheckoutSessionForAccountDeletion({
      stripe,
      stripeCheckoutSessionId: session.id,
      idempotencyKey: deletionRequest
        ? accountDeletionStripeIdempotencyKey(deletionRequest.id, "checkout-session", session.id)
        : `deactivated-account:${user.id}:checkout-session:${session.id}`
    });
    if (blockedSession.status === "expired") {
      await prisma.billingCheckoutIntent.updateMany({
        where: {
          id: intentResult.intent.id,
          status: { in: [BillingCheckoutIntentStatus.PENDING, BillingCheckoutIntentStatus.SESSION_CREATED] }
        },
        data: {
          status: BillingCheckoutIntentStatus.CANCELED,
          canceledAt: new Date()
        }
      });
    } else if (blockedSession.status === "complete") {
      const stripeSubscriptionId =
        typeof blockedSession.subscription === "string"
          ? blockedSession.subscription
          : blockedSession.subscription?.id;
      if (!stripeSubscriptionId || !currentUser) {
        throw new Error("Blocked Stripe checkout completed without a reconcilable subscription.");
      }
      await applyStripeSubscription({
        userId: user.id,
        targetTier: input.targetTier,
        stripeCustomerId: customerId,
        subscription: await stripe.subscriptions.retrieve(stripeSubscriptionId),
        checkoutIntentId: intentResult.intent.id
      });
    } else {
      throw new Error("Stripe checkout remained open for a deactivated account.");
    }
    return { ok: false as const, error: "Subscription checkout was stopped because the account is deactivated." };
  }

  await diagnostics.info(MODULE_KEY, "Stripe checkout session created.", {
    userId: user.id,
    targetTier: input.targetTier,
    checkoutSessionId: session.id
  });

  return { ok: true as const, url: session.url };
}

async function ensureCustomerPortalConfiguration(origin: string) {
  const stripe = await getStripeClient();
  const config = await getStripeRuntimeConfig();
  const activePlans = (await listAvailablePortalPlans()).filter((plan) => plan.stripePriceId);
  const prices = await Promise.all(
    activePlans.map(async (plan) => {
      const price = await stripe.prices.retrieve(plan.stripePriceId as string);
      return {
        priceId: price.id,
        productId: typeof price.product === "string" ? price.product : price.product.id
      };
    })
  );
  const products = Array.from(
    prices.reduce<Map<string, string[]>>((acc, price) => {
      acc.set(price.productId, [...(acc.get(price.productId) ?? []), price.priceId]);
      return acc;
    }, new Map())
  ).map(([product, priceIds]) => ({
    product,
    prices: priceIds,
    adjustable_quantity: { enabled: false }
  }));
  const portalName = `Theta-Space membership portal (${config.mode.toLowerCase()})`;
  const existing = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const portalConfig = existing.data.find(
    (item) =>
      item.metadata?.app === "theta-space" &&
      item.metadata?.purpose === "membership-portal" &&
      item.metadata?.mode === config.mode
  );
  const termsOfServiceUrl = origin.startsWith("https:") ? `${origin}/terms` : undefined;
  const params = {
    name: portalName,
    default_return_url: `${origin}/settings/subscription?portal=return`,
    business_profile: {
      headline: "Manage your Theta-Space billing.",
      terms_of_service_url: termsOfServiceUrl
    },
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "name", "address", "phone"] as Array<"email" | "name" | "address" | "phone">
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end" as const,
        cancellation_reason: {
          enabled: true,
          options: ["too_expensive", "missing_features", "unused", "other"] as Array<"too_expensive" | "missing_features" | "unused" | "other">
        }
      },
      subscription_update: {
        enabled: products.length > 0,
        default_allowed_updates: ["price"] as Array<"price">,
        products,
        proration_behavior: "create_prorations" as const
      }
    },
    metadata: {
      app: "theta-space",
      purpose: "membership-portal",
      mode: config.mode
    }
  };

  if (portalConfig) {
    const updated = await stripe.billingPortal.configurations.update(portalConfig.id, params);
    return updated.id;
  }

  const created = await stripe.billingPortal.configurations.create(params, {
    idempotencyKey: `theta-membership-portal-${config.mode.toLowerCase()}`
  });
  return created.id;
}

async function listAvailablePortalPlans() {
  await ensureLaunchDefaults();
  return prisma.subscriptionPlanRule.findMany({
    where: {
      active: true,
      tier: { not: MembershipTier.FREE },
      stripePriceId: { not: null }
    },
    orderBy: { standardPriceCents: "asc" },
    select: {
      stripePriceId: true
    }
  });
}

export async function createCustomerPortalSession(input: {
  userId: string;
  origin: string;
}) {
  const config = await getStripeRuntimeConfig();

  if (!config.secretKey) {
    return { ok: false as const, error: "Stripe billing is not configured." };
  }

  const membership = await prisma.membership.findUnique({
    where: { userId: input.userId },
    select: {
      stripeCustomerId: true
    }
  });

  if (!membership?.stripeCustomerId) {
    return { ok: false as const, error: "No Stripe customer is attached to this account yet." };
  }

  const stripe = await getStripeClient();
  const origin = resolveCheckoutOrigin(input.origin);
  const configuration = await ensureCustomerPortalConfiguration(origin);
  const session = await stripe.billingPortal.sessions.create({
    customer: membership.stripeCustomerId,
    configuration,
    return_url: `${origin}/settings/subscription?portal=return`
  });

  await diagnostics.info(MODULE_KEY, "Stripe customer portal session created.", {
    userId: input.userId,
    stripeCustomerId: membership.stripeCustomerId
  });

  return { ok: true as const, url: session.url };
}

async function persistStripeSubscription(input: {
  userId: string;
  targetTier: MembershipTier;
  stripeCustomerId: string | null;
  subscription: Stripe.Subscription;
  checkoutIntentId?: string;
}) {
  const status = statusFromStripe(input.subscription.status);
  return prisma.$transaction(async (tx) => {
    const [user, deletionRequest] = await Promise.all([
      tx.user.findUnique({
        where: { id: input.userId },
        select: { deactivatedAt: true }
      }),
      tx.destructiveActionRequest.findFirst({
        where: {
          kind: DestructiveActionKind.DELETE_ACCOUNT,
          targetType: "User",
          targetId: input.userId,
          status: {
            in: [
              DestructiveActionStatus.CONFIRMED,
              DestructiveActionStatus.QUEUED,
              DestructiveActionStatus.RUNNING,
              DestructiveActionStatus.SUCCEEDED
            ]
          }
        },
        select: { id: true }
      })
    ]);
    if (!user) throw new Error("Stripe subscription user no longer exists.");
    const application = resolveStripeMembershipApplicationState({
      subscriptionStatus: status,
      targetTier: input.targetTier,
      accountBlocked: Boolean(user.deactivatedAt || deletionRequest)
    });
    const activeTier = application.activeTier;
    const updatedMembership = deletionRequest
      ? null
      : await tx.membership.upsert({
          where: { userId: input.userId },
          update: {
            tier: activeTier,
            storageLimitBytes: BigInt(application.storageLimitBytes),
            stripeCustomerId: input.stripeCustomerId,
            stripeSubscriptionId: input.subscription.id,
            subscriptionStatus: status,
            subscriptionCurrentPeriodEnd: stripePeriodEnd(input.subscription),
            subscriptionCancelAtPeriodEnd: Boolean(input.subscription.cancel_at_period_end)
          },
          create: {
            userId: input.userId,
            tier: activeTier,
            storageLimitBytes: BigInt(application.storageLimitBytes),
            stripeCustomerId: input.stripeCustomerId,
            stripeSubscriptionId: input.subscription.id,
            subscriptionStatus: status,
            subscriptionCurrentPeriodEnd: stripePeriodEnd(input.subscription),
            subscriptionCancelAtPeriodEnd: Boolean(input.subscription.cancel_at_period_end)
          }
        });

    if (activeTier === MembershipTier.ORG) {
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
        if (
          deletionRequest &&
          intent?.status === BillingCheckoutIntentStatus.CANCELED &&
          (!intent.stripeSubscriptionId || intent.stripeSubscriptionId === input.subscription.id)
        ) {
          await tx.billingCheckoutIntent.update({
            where: { id: intent.id },
            data: { stripeSubscriptionId: input.subscription.id }
          });
        } else if (intent?.status !== BillingCheckoutIntentStatus.COMPLETED) {
          throw new Error("Subscription checkout intent could not be completed atomically.");
        }
      }
    }

    return {
      updatedMembership,
      activeTier,
      accountBlocked: Boolean(user.deactivatedAt || deletionRequest),
      deletionRequestId: deletionRequest?.id ?? null
    };
  });
}

async function applyStripeSubscription(input: {
  userId: string;
  targetTier: MembershipTier;
  stripeCustomerId: string | null;
  subscription: Stripe.Subscription;
  checkoutIntentId?: string;
}) {
  let subscription = input.subscription;
  const targetPolicy = getTierPolicy(input.targetTier);
  const membership = await persistStripeSubscription(input);

  if (membership.deletionRequestId) {
    const cancellation = await cancelStripeSubscriptionForAccountDeletion({
      stripe: await getStripeClient(),
      subscription,
      destructiveActionRequestId: membership.deletionRequestId
    });
    subscription = cancellation.subscription;
    await recordAccountDeletionSubscriptionEvidence({
      userId: input.userId,
      destructiveActionRequestId: membership.deletionRequestId,
      stripeCustomerId: input.stripeCustomerId,
      subscription,
      cancellationPerformed: cancellation.cancellationPerformed,
      source: "webhook"
    });
  }

  const status = statusFromStripe(subscription.status);
  await writeAuditLog({
    module: MODULE_KEY,
    action: "stripe.subscription.synced",
    targetType: "User",
    targetId: input.userId,
    severity: canActivateStatus(status) ? "info" : "warning",
    metadata: {
      targetTier: input.targetTier,
      activeTier: membership.activeTier,
      targetTierName: targetPolicy.displayName,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: status,
      accountBlocked: membership.accountBlocked,
      deletionBound: Boolean(membership.deletionRequestId)
    } as Prisma.InputJsonObject
  });

  return membership.updatedMembership;
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
      const eventSubscription = event.data.object as Stripe.Subscription;
      const subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
      const userId = await userIdForSubscription(subscription);
      const targetTier = await tierForSubscription(subscription);

      if (!userId) throw new Error("Stripe subscription event could not be matched to a user.");

      const checkoutIntentId = subscription.metadata?.checkoutIntentId;
      if (checkoutIntentId) {
        const intent = await prisma.billingCheckoutIntent.findUnique({ where: { id: checkoutIntentId } });
        const deletionBound = intent?.userId === null
          ? Boolean(await prisma.destructiveActionRequest.findFirst({
              where: {
                kind: DestructiveActionKind.DELETE_ACCOUNT,
                targetType: "User",
                targetId: userId,
                status: {
                  in: [
                    DestructiveActionStatus.CONFIRMED,
                    DestructiveActionStatus.QUEUED,
                    DestructiveActionStatus.RUNNING,
                    DestructiveActionStatus.SUCCEEDED
                  ]
                }
              },
              select: { id: true }
            }))
          : false;
        if (
          !intent ||
          intent.kind !== StripeCheckoutKind.SUBSCRIPTION ||
          !stripeCheckoutIntentMatchesUser({
            intentUserId: intent.userId,
            eventUserId: userId,
            deletionBound
          }) ||
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
