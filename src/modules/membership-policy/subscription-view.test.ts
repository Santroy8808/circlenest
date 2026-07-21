import assert from "node:assert/strict";
import test from "node:test";
import {
  MembershipSubscriptionStatus,
  MembershipTier,
  MembershipUpgradeMode,
  UserRole
} from "@prisma/client";
import { classifyContributorOfferApiError } from "@/modules/membership-policy/contributor-upgrade.api";
import { CONTRIBUTOR_BETA_OFFER_MESSAGE } from "@/modules/membership-policy/contributor-upgrade";
import type { EffectivePolicy } from "@/modules/membership-policy/membership-policy.service";
import { getTierPolicy } from "@/modules/membership-policy/policy";
import {
  buildMembershipSubscriptionView,
  visibleContributorUpgradeOffer
} from "@/modules/membership-policy/subscription-view";
import type {
  SubscriptionBillingSummary,
  SubscriptionUpgradePlanView
} from "@/modules/membership-policy/subscriptions.service";

const contributorOffer = {
  id: "offer-1",
  status: "OFFERED" as const,
  currentPriceCents: 0 as const,
  futureMonthlyPriceCents: 499 as const,
  message: CONTRIBUTOR_BETA_OFFER_MESSAGE,
  expiresAt: "2026-08-01T00:00:00.000Z",
  canAccept: true
};

function plan(tier: MembershipTier): SubscriptionUpgradePlanView {
  return {
    tier,
    displayName: tier === MembershipTier.CONTRIBUTOR ? "Contributor" : "Professional",
    summary: "Plan summary",
    standardPriceCents: 499,
    stripePriceId: "price_internal",
    monthlyCreditBudget: 10,
    eligible: tier === MembershipTier.CONTRIBUTOR,
    hiddenUntilEligible: true,
    current: false,
    checkoutReady: false,
    upgradeMode: MembershipUpgradeMode.BETA_FREE,
    offerId: tier === MembershipTier.CONTRIBUTOR ? contributorOffer.id : null,
    currentPriceCents: tier === MembershipTier.CONTRIBUTOR ? 0 : 499,
    futureMonthlyPriceCents: 499,
    betaMessage: tier === MembershipTier.CONTRIBUTOR ? contributorOffer.message : null,
    canAcceptOffer: tier === MembershipTier.CONTRIBUTOR
  };
}

test("membership subscription DTO exposes the canonical offer and operational tiers only", () => {
  const base = getTierPolicy(MembershipTier.FREE);
  const policy: EffectivePolicy = {
    ...base,
    role: UserRole.MEMBER,
    actualTier: MembershipTier.FREE,
    overrides: {},
    contributorOffer
  };
  const billing: SubscriptionBillingSummary = {
    stripeCustomerId: "cus_private",
    stripeSubscriptionId: null,
    subscriptionStatus: MembershipSubscriptionStatus.NONE,
    subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAtPeriodEnd: false,
    canManageBilling: true
  };

  const view = buildMembershipSubscriptionView({
    policy,
    billing,
    plans: [plan(MembershipTier.CONTRIBUTOR), plan(MembershipTier.PROFESSIONAL)]
  });

  assert.equal(view.currentMembership.tier, MembershipTier.FREE);
  assert.deepEqual(view.contributorOffer, contributorOffer);
  assert.deepEqual(view.availablePlans.map((item) => item.tier), [MembershipTier.CONTRIBUTOR]);
  assert.equal(view.availablePlans[0]?.currentPriceCents, 0);
  assert.equal(view.availablePlans[0]?.futureMonthlyPriceCents, 499);
  assert.equal("stripePriceId" in (view.availablePlans[0] ?? {}), false);
  assert.equal("stripeCustomerId" in view.billing, false);
});

test("Contributor API failures provide stable status codes and recovery actions", () => {
  assert.deepEqual(classifyContributorOfferApiError("This offer belongs to a different account."), {
    code: "OFFER_NOT_OWNED",
    status: 403,
    recovery: "Refresh Membership to load the offer assigned to this account."
  });
  assert.deepEqual(
    classifyContributorOfferApiError("That administrator command id has already been used."),
    {
      code: "COMMAND_ID_CONFLICT",
      status: 409,
      recovery: "Create a new command id before submitting a different change."
    }
  );
  assert.equal(classifyContributorOfferApiError("This Contributor offer has expired.").status, 409);
});

test("only a Free member with an active targeted offer sees the Contributor upgrade", () => {
  assert.equal(
    visibleContributorUpgradeOffer({
      currentTier: MembershipTier.FREE,
      offer: contributorOffer
    }),
    contributorOffer
  );
  assert.equal(
    visibleContributorUpgradeOffer({
      currentTier: MembershipTier.FREE,
      offer: null
    }),
    null
  );
  assert.equal(
    visibleContributorUpgradeOffer({
      currentTier: MembershipTier.CONTRIBUTOR,
      offer: { ...contributorOffer, status: "ACCEPTED", canAccept: false }
    }),
    null
  );
});

test("non-accepting and non-operational Contributor offers stay hidden", () => {
  assert.equal(
    visibleContributorUpgradeOffer({
      currentTier: MembershipTier.FREE,
      offer: { ...contributorOffer, canAccept: false }
    }),
    null
  );
  assert.equal(
    visibleContributorUpgradeOffer({
      currentTier: MembershipTier.PROFESSIONAL,
      offer: contributorOffer
    }),
    null
  );
});
