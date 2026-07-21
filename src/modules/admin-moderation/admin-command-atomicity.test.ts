import assert from "node:assert/strict";
import test from "node:test";
import { MembershipTier, Prisma, UserRole } from "@prisma/client";
import { createCommandFingerprint } from "@/lib/platform/command-fingerprint";
import {
  adminAccountCreationRequestId,
  adminCreateUserSchema,
  isMatchingAdminAccountCreationReplay
} from "@/modules/admin-moderation/account-support.service";
import { setMembershipPolicyOverride } from "@/modules/membership-policy/membership-policy.service";
import {
  canChangeStripePricing,
  isMatchingStripePricingReplay,
  stripeCreditPackageRequestId,
  stripeSubscriptionPriceRequestId
} from "@/modules/billing/stripe-admin.service";

const accountRequest = {
  commandId: "create-account-command-001",
  email: "Member@Example.com",
  username: "New_Member",
  displayName: "New Member",
  password: "A-valid-password-123!",
  tier: MembershipTier.FREE,
  inviteCode: "",
  reason: "Create a beta test account."
};

test("administrator provisioning accepts only operational membership tiers", () => {
  assert.equal(adminCreateUserSchema.safeParse(accountRequest).success, true);
  assert.equal(adminCreateUserSchema.safeParse({ ...accountRequest, tier: MembershipTier.CONTRIBUTOR }).success, true);
  assert.equal(adminCreateUserSchema.safeParse({ ...accountRequest, tier: MembershipTier.PROFESSIONAL }).success, false);
  assert.equal(adminCreateUserSchema.safeParse({ ...accountRequest, tier: MembershipTier.AUDITOR }).success, false);
  assert.equal(adminCreateUserSchema.safeParse({ ...accountRequest, tier: MembershipTier.ORG }).success, false);
});

test("account-provisioning replay is bound to actor, action, and canonical request identity", () => {
  const parsed = adminCreateUserSchema.parse(accountRequest);
  const requestId = adminAccountCreationRequestId(parsed);
  const normalizedRequestId = adminAccountCreationRequestId({
    ...parsed,
    email: "member@example.com",
    username: "new_member"
  });
  assert.equal(requestId, normalizedRequestId);
  assert.notEqual(requestId, adminAccountCreationRequestId({ ...parsed, tier: MembershipTier.CONTRIBUTOR }));

  const replay = {
    actorUserId: "god-user",
    action: "user.created",
    requestId,
    targetId: "created-user"
  };
  assert.equal(isMatchingAdminAccountCreationReplay(replay, "god-user", requestId), true);
  assert.equal(isMatchingAdminAccountCreationReplay(replay, "other-god", requestId), false);
  assert.equal(isMatchingAdminAccountCreationReplay({ ...replay, action: "password.reset" }, "god-user", requestId), false);
  assert.equal(isMatchingAdminAccountCreationReplay(replay, "god-user", `${requestId}:other`), false);
});

test("policy overrides can share the command transaction without writing a duplicate generic audit", async () => {
  let overrideWrites = 0;
  let auditWrites = 0;
  const writer = {
    membershipPolicyOverride: {
      upsert: async () => {
        overrideWrites += 1;
        return { id: "override-1" };
      }
    },
    auditLog: {
      create: async () => {
        auditWrites += 1;
        return { id: "audit-1" };
      }
    }
  } as unknown as Pick<Prisma.TransactionClient, "membershipPolicyOverride" | "auditLog">;

  const result = await setMembershipPolicyOverride(
    {
      actorUserId: "god-user",
      targetUserId: "member-user",
      featureKey: "invites.send",
      allowed: true,
      reason: "Grant controlled invitation access."
    },
    { writer, writeGenericAudit: false }
  );

  assert.equal(result.ok, true);
  assert.equal(overrideWrites, 1);
  assert.equal(auditWrites, 0);
});

test("Stripe pricing commands require GOD and bind replay to the tier or package key", () => {
  assert.equal(canChangeStripePricing(UserRole.MEMBER), false);
  assert.equal(canChangeStripePricing(UserRole.ADMIN), false);
  assert.equal(canChangeStripePricing(UserRole.GOD), true);

  const tierRequestId = stripeSubscriptionPriceRequestId(MembershipTier.CONTRIBUTOR);
  const tierTarget = { type: "SubscriptionPlanRule", id: tierRequestId };
  const tierFingerprint = createCommandFingerprint({
    actorUserId: "god-user",
    action: "stripe.subscription_price.updated",
    target: tierTarget,
    payload: { tier: MembershipTier.CONTRIBUTOR, stripePriceId: "price_contributor" }
  });
  const tierReplay = {
    actorUserId: "god-user",
    action: "stripe.subscription_price.updated",
    requestId: tierRequestId,
    targetType: tierTarget.type,
    targetId: tierTarget.id,
    metadata: { commandFingerprint: tierFingerprint }
  };
  assert.equal(
    isMatchingStripePricingReplay(tierReplay, "god-user", "stripe.subscription_price.updated", tierRequestId, tierFingerprint),
    true
  );
  assert.equal(
    isMatchingStripePricingReplay(
      tierReplay,
      "god-user",
      "stripe.subscription_price.updated",
      stripeSubscriptionPriceRequestId(MembershipTier.FREE),
      tierFingerprint
    ),
    false
  );
  assert.equal(
    isMatchingStripePricingReplay(
      tierReplay,
      "god-user",
      "stripe.subscription_price.updated",
      tierRequestId,
      createCommandFingerprint({
        actorUserId: "god-user",
        action: "stripe.subscription_price.updated",
        target: tierTarget,
        payload: { tier: MembershipTier.CONTRIBUTOR, stripePriceId: "price_changed" }
      })
    ),
    false
  );

  const packageRequestId = stripeCreditPackageRequestId(" Beta-100 ");
  assert.equal(packageRequestId, "stripe-credit-package:beta-100");
  const packageTarget = { type: "StripeCreditPackage", id: packageRequestId };
  const packageFingerprint = createCommandFingerprint({
    actorUserId: "god-user",
    action: "stripe.credit_package.saved",
    target: packageTarget,
    payload: { key: "beta-100", creditAmount: 100, priceCents: 500 }
  });
  assert.equal(
    isMatchingStripePricingReplay(
      {
        actorUserId: "god-user",
        action: "stripe.credit_package.saved",
        requestId: packageRequestId,
        targetType: packageTarget.type,
        targetId: packageTarget.id,
        metadata: { commandFingerprint: packageFingerprint }
      },
      "god-user",
      "stripe.credit_package.saved",
      packageRequestId,
      packageFingerprint
    ),
    true
  );
});
