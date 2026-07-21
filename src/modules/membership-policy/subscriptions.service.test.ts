import assert from "node:assert/strict";
import test from "node:test";
import { MembershipSubscriptionStatus, MembershipTier, MembershipUpgradeMode } from "@prisma/client";
import {
  accountDeletionStripeIdempotencyKey,
  classifyStripeSubscriptionSyncReplay,
  resolveContributorPlanEligibility,
  resolveStripeMembershipApplicationState,
  resolveStripeSubscriptionPeriodEnd,
  stripeCheckoutIntentMatchesUser,
  stripeSubscriptionRequiresAccountDeletionCancellation,
  stripeSubscriptionSyncFingerprint,
  stripeSubscriptionSyncOperationId
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

test("Stripe subscription sync retries use one stable provider operation identity", () => {
  const first = stripeSubscriptionSyncOperationId({
    providerEventId: "evt_subscription_updated_1",
    subscriptionId: "sub_1"
  });
  const retry = stripeSubscriptionSyncOperationId({
    providerEventId: "evt_subscription_updated_1",
    subscriptionId: "sub_1"
  });
  const nextEvent = stripeSubscriptionSyncOperationId({
    providerEventId: "evt_subscription_updated_2",
    subscriptionId: "sub_1"
  });

  assert.equal(first, retry);
  assert.notEqual(first, nextEvent);
});

test("a crash after atomic Stripe persistence recovers the exact durable audit receipt", () => {
  const identity = {
    operationId: stripeSubscriptionSyncOperationId({
      providerEventId: "evt_subscription_updated_1",
      subscriptionId: "sub_1"
    }),
    providerEventId: "evt_subscription_updated_1",
    providerEventType: "customer.subscription.updated"
  };
  const fingerprint = stripeSubscriptionSyncFingerprint({
    userId: "member-1",
    targetTier: MembershipTier.CONTRIBUTOR,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    subscriptionStatus: MembershipSubscriptionStatus.ACTIVE,
    subscriptionCurrentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    subscriptionCancelAtPeriodEnd: false,
    checkoutIntentId: "checkout-intent-1",
    identity
  });
  const audit = {
    actorUserId: null,
    module: "membership-subscriptions",
    action: "stripe.subscription.synced",
    targetType: "User",
    targetId: "member-1",
    metadata: {
      commandFingerprint: fingerprint,
      syncReceipt: {
        activeTier: MembershipTier.CONTRIBUTOR,
        accountBlocked: false,
        deletionRequestId: null
      }
    }
  };

  assert.deepEqual(classifyStripeSubscriptionSyncReplay({
    audit,
    userId: "member-1",
    commandFingerprint: fingerprint
  }), {
    state: "replay",
    receipt: {
      activeTier: MembershipTier.CONTRIBUTOR,
      accountBlocked: false,
      deletionRequestId: null
    }
  });
});

test("a provider operation id cannot replay a different subscription identity", () => {
  const identity = {
    operationId: "stripe-webhook:evt_1:subscription-sync",
    providerEventId: "evt_1",
    providerEventType: "customer.subscription.updated"
  };
  const fingerprint = stripeSubscriptionSyncFingerprint({
    userId: "member-1",
    targetTier: MembershipTier.CONTRIBUTOR,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    subscriptionStatus: MembershipSubscriptionStatus.ACTIVE,
    subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAtPeriodEnd: false,
    identity
  });
  const conflictingFingerprint = stripeSubscriptionSyncFingerprint({
    userId: "member-1",
    targetTier: MembershipTier.CONTRIBUTOR,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_2",
    subscriptionStatus: MembershipSubscriptionStatus.ACTIVE,
    subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAtPeriodEnd: false,
    identity
  });
  const audit = {
    actorUserId: null,
    module: "membership-subscriptions",
    action: "stripe.subscription.synced",
    targetType: "User",
    targetId: "member-1",
    metadata: {
      commandFingerprint: fingerprint,
      syncReceipt: {
        activeTier: MembershipTier.CONTRIBUTOR,
        accountBlocked: false,
        deletionRequestId: null
      }
    }
  };

  assert.deepEqual(classifyStripeSubscriptionSyncReplay({
    audit,
    userId: "member-1",
    commandFingerprint: conflictingFingerprint
  }), { state: "conflict" });
});

test("Stripe sync fingerprint binds every persisted subscription snapshot field", () => {
  const base = {
    userId: "member-1",
    targetTier: MembershipTier.CONTRIBUTOR,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    subscriptionStatus: MembershipSubscriptionStatus.ACTIVE,
    subscriptionCurrentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    subscriptionCancelAtPeriodEnd: false,
    identity: {
      operationId: "stripe-webhook:evt_1:subscription-sync",
      providerEventId: "evt_1",
      providerEventType: "customer.subscription.updated"
    }
  };
  const expected = stripeSubscriptionSyncFingerprint(base);
  const changedFingerprints = [
    stripeSubscriptionSyncFingerprint({
      ...base,
      subscriptionStatus: MembershipSubscriptionStatus.CANCELED
    }),
    stripeSubscriptionSyncFingerprint({
      ...base,
      subscriptionCurrentPeriodEnd: new Date("2026-09-01T00:00:00.000Z")
    }),
    stripeSubscriptionSyncFingerprint({ ...base, subscriptionCurrentPeriodEnd: null }),
    stripeSubscriptionSyncFingerprint({ ...base, subscriptionCancelAtPeriodEnd: true })
  ];
  const audit = {
    actorUserId: null,
    module: "membership-subscriptions",
    action: "stripe.subscription.synced",
    targetType: "User",
    targetId: "member-1",
    metadata: {
      commandFingerprint: expected,
      syncReceipt: {
        activeTier: MembershipTier.CONTRIBUTOR,
        accountBlocked: false,
        deletionRequestId: null
      }
    }
  };

  for (const changed of changedFingerprints) {
    assert.notEqual(changed, expected);
    assert.deepEqual(classifyStripeSubscriptionSyncReplay({
      audit,
      userId: "member-1",
      commandFingerprint: changed
    }), { state: "conflict" });
  }
});

test("fallback Stripe sync operation ids are versioned by the persisted snapshot", () => {
  const base = {
    subscriptionId: "sub_manual",
    targetTier: MembershipTier.CONTRIBUTOR,
    stripeCustomerId: "cus_1",
    subscriptionStatus: MembershipSubscriptionStatus.ACTIVE,
    subscriptionCurrentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    subscriptionCancelAtPeriodEnd: false
  };
  const first = stripeSubscriptionSyncOperationId(base);

  assert.equal(stripeSubscriptionSyncOperationId(base), first);
  assert.notEqual(
    stripeSubscriptionSyncOperationId({ ...base, subscriptionStatus: MembershipSubscriptionStatus.CANCELED }),
    first
  );
  assert.notEqual(
    stripeSubscriptionSyncOperationId({
      ...base,
      subscriptionCurrentPeriodEnd: new Date("2026-09-01T00:00:00.000Z")
    }),
    first
  );
  assert.notEqual(
    stripeSubscriptionSyncOperationId({ ...base, subscriptionCancelAtPeriodEnd: true }),
    first
  );
});
