import type { MembershipTier } from "@prisma/client";
import type { EffectivePolicy } from "@/modules/membership-policy/membership-policy.service";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";
import { isOperationalTier, normalizeOperationalTier, type OperationalTier } from "@/modules/membership-policy/membership-access";
import type { ContributorUpgradeOfferView } from "@/modules/membership-policy/contributor-upgrade";
import {
  getSubscriptionBillingSummary,
  listAvailableSubscriptionUpgradePlans,
  type SubscriptionBillingSummary,
  type SubscriptionUpgradePlanView
} from "@/modules/membership-policy/subscriptions.service";

export type MembershipSubscriptionView = {
  currentMembership: {
    tier: OperationalTier;
    displayName: string;
    summary: string;
    features: EffectivePolicy["features"];
    limits: EffectivePolicy["limits"];
  };
  contributorOffer: ContributorUpgradeOfferView | null;
  availablePlans: Array<{
    tier: OperationalTier;
    displayName: string;
    summary: string;
    standardPriceCents: number;
    monthlyCreditBudget: number;
    eligible: boolean;
    current: boolean;
    checkoutReady: boolean;
    upgradeMode: SubscriptionUpgradePlanView["upgradeMode"];
    offerId: string | null;
    currentPriceCents: number;
    futureMonthlyPriceCents: number | null;
    betaMessage: string | null;
    canAcceptOffer: boolean;
  }>;
  billing: {
    status: SubscriptionBillingSummary["subscriptionStatus"];
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    canManageBilling: boolean;
    subscribed: boolean;
  };
};

export function buildMembershipSubscriptionView(input: {
  policy: EffectivePolicy;
  billing: SubscriptionBillingSummary;
  plans: SubscriptionUpgradePlanView[];
}): MembershipSubscriptionView {
  const currentTier = normalizeOperationalTier(input.policy.tier);
  const availablePlans = input.plans
    .filter((plan): plan is SubscriptionUpgradePlanView & { tier: OperationalTier } =>
      isOperationalTier(plan.tier)
    )
    .map((plan) => ({
      tier: plan.tier,
      displayName: plan.displayName,
      summary: plan.summary,
      standardPriceCents: plan.standardPriceCents,
      monthlyCreditBudget: plan.monthlyCreditBudget,
      eligible: plan.eligible,
      current: plan.current,
      checkoutReady: plan.checkoutReady,
      upgradeMode: plan.upgradeMode,
      offerId: plan.offerId,
      currentPriceCents: plan.currentPriceCents,
      futureMonthlyPriceCents: plan.futureMonthlyPriceCents,
      betaMessage: plan.betaMessage,
      canAcceptOffer: plan.canAcceptOffer
    }));

  return {
    currentMembership: {
      tier: currentTier,
      displayName: input.policy.displayName,
      summary: input.policy.summary,
      features: input.policy.features,
      limits: input.policy.limits
    },
    contributorOffer: input.policy.contributorOffer ?? null,
    availablePlans,
    billing: {
      status: input.billing.subscriptionStatus,
      currentPeriodEnd: input.billing.subscriptionCurrentPeriodEnd,
      cancelAtPeriodEnd: input.billing.subscriptionCancelAtPeriodEnd,
      canManageBilling: input.billing.canManageBilling,
      subscribed: Boolean(input.billing.stripeSubscriptionId)
    }
  };
}

export async function getMembershipSubscriptionView(userId: string) {
  const [policy, billing, plans] = await Promise.all([
    getEffectivePolicyForUser(userId),
    getSubscriptionBillingSummary(userId),
    listAvailableSubscriptionUpgradePlans(userId)
  ]);
  if (!policy) return null;

  return buildMembershipSubscriptionView({ policy, billing, plans });
}

export function isOperationalSubscriptionTier(tier: MembershipTier): tier is OperationalTier {
  return isOperationalTier(tier);
}
