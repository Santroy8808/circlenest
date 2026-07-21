import assert from "node:assert/strict";
import test from "node:test";
import { MembershipSubscriptionStatus, MembershipTier, MembershipUpgradeMode } from "@prisma/client";
import {
  accountDeletionStripeIdempotencyKey,
  resolveContributorPlanEligibility,
  resolveStripeMembershipApplicationState,
  resolveStripeSubscriptionPeriodEnd,
  stripeCheckoutIntentMatchesUser,
  stripeSubscriptionRequiresAccountDeletionCancellation
} from "@/modules/membership-policy/subscriptions.service";

test("current Contributor membership is never represented as an eligible upgrade", () => {
  assert.deepEqual(
    resolveContributorPlanEligibility({
      currentTier: MembershipTier.CONTRIBUTOR,
      selfServiceEnabled: true,
      upgradeMode: MembershipUpgradeMode.BETA_FREE,
      offerCanAccept: true,
      stripePriceConfigured: true
    }),
    { current: true, eligible: false, checkoutReady: false, canAcceptOffer: false }
  );
});

test("a targeted Free member can accept the beta offer but cannot enter Stripe checkout", () => {
  assert.deepEqual(
    resolveContributorPlanEligibility({
      currentTier: MembershipTier.FREE,
      selfServiceEnabled: true,
      upgradeMode: MembershipUpgradeMode.BETA_FREE,
      offerCanAccept: true,
      stripePriceConfigured: true
    }),
    { current: false, eligible: true, checkoutReady: false, canAcceptOffer: true }
  );
});

test("Contributor is unavailable without administrator-granted eligibility", () => {
  assert.equal(
    resolveContributorPlanEligibility({
      currentTier: MembershipTier.FREE,
      selfServiceEnabled: true,
      upgradeMode: MembershipUpgradeMode.BETA_FREE,
      offerCanAccept: false,
      stripePriceConfigured: true
    }).eligible,
    false
  );
});

test("Stripe cannot reactivate a suspended or deletion-bound account", () => {
  assert.equal(
    resolveStripeMembershipApplicationState({
      subscriptionStatus: MembershipSubscriptionStatus.ACTIVE,
      targetTier: MembershipTier.CONTRIBUTOR,
      accountBlocked: true
    }).activeTier,
    MembershipTier.FREE
  );
});

test("an active operational subscription still applies to an active account", () => {
  assert.equal(
    resolveStripeMembershipApplicationState({
      subscriptionStatus: MembershipSubscriptionStatus.ACTIVE,
      targetTier: MembershipTier.CONTRIBUTOR,
      accountBlocked: false
    }).activeTier,
    MembershipTier.CONTRIBUTOR
  );
});

test("current Stripe item periods determine the next subscription period end", () => {
  const periodEnd = resolveStripeSubscriptionPeriodEnd({
    itemCurrentPeriodEnds: [1_800_000_000, 1_700_000_000],
    legacyCurrentPeriodEnd: 1_600_000_000
  });

  assert.equal(periodEnd?.toISOString(), new Date(1_700_000_000 * 1000).toISOString());
});

test("legacy Stripe subscription period remains a safe fallback", () => {
  const periodEnd = resolveStripeSubscriptionPeriodEnd({
    itemCurrentPeriodEnds: [],
    legacyCurrentPeriodEnd: 1_700_000_000
  });

  assert.equal(periodEnd?.toISOString(), new Date(1_700_000_000 * 1000).toISOString());
});

test("account deletion cancels every non-terminal Stripe subscription state", () => {
  assert.equal(stripeSubscriptionRequiresAccountDeletionCancellation("active"), true);
  assert.equal(stripeSubscriptionRequiresAccountDeletionCancellation("past_due"), true);
  assert.equal(stripeSubscriptionRequiresAccountDeletionCancellation("paused"), true);
  assert.equal(stripeSubscriptionRequiresAccountDeletionCancellation("canceled"), false);
  assert.equal(stripeSubscriptionRequiresAccountDeletionCancellation("incomplete_expired"), false);
});

test("account deletion uses a distinct retry key for each Stripe resource", () => {
  assert.equal(
    accountDeletionStripeIdempotencyKey("delete-request", "subscription", "sub_one"),
    "account-delete:delete-request:subscription:sub_one"
  );
  assert.notEqual(
    accountDeletionStripeIdempotencyKey("delete-request", "subscription", "sub_one"),
    accountDeletionStripeIdempotencyKey("delete-request", "subscription", "sub_two")
  );
  assert.notEqual(
    accountDeletionStripeIdempotencyKey("delete-request", "subscription", "sub_one"),
    accountDeletionStripeIdempotencyKey("delete-request", "checkout-session", "sub_one")
  );
});

test("retained checkout evidence matches its deleted user only while deletion-bound", () => {
  assert.equal(
    stripeCheckoutIntentMatchesUser({
      intentUserId: null,
      eventUserId: "deleted-user",
      deletionBound: true
    }),
    true
  );
  assert.equal(
    stripeCheckoutIntentMatchesUser({
      intentUserId: null,
      eventUserId: "active-user",
      deletionBound: false
    }),
    false
  );
  assert.equal(
    stripeCheckoutIntentMatchesUser({
      intentUserId: "other-user",
      eventUserId: "deleted-user",
      deletionBound: true
    }),
    false
  );
});
