import assert from "node:assert/strict";
import test from "node:test";
import { MembershipTier, UserRole } from "@prisma/client";
import { viewerCanCreateAuditorProfile } from "@/modules/auditors/auditors.service";
import { getBusinessProfileManagementAccess } from "@/modules/business-storefront/business-storefront.service";
import {
  evaluateFeatureAccess,
  resolvePolicy,
  type canUserAccessFeature
} from "@/modules/membership-policy/membership-policy.service";
import type { MembershipFeatureKey } from "@/modules/membership-policy/policy";
import { storefrontManagementRelationshipAllows } from "@/modules/storefront-forum/storefront-forum.service";

type AccessResolver = typeof canUserAccessFeature;

function policyAccessResolver(tier: MembershipTier, role: UserRole): AccessResolver {
  const policy = resolvePolicy({ tier, role });
  return async (_userId, featureKey) =>
    evaluateFeatureAccess(policy, featureKey as MembershipFeatureKey);
}

test("business and auditor services deny every release-ineligible membership and role-only admin", async () => {
  const identities = [
    [MembershipTier.FREE, UserRole.MEMBER],
    [MembershipTier.CONTRIBUTOR, UserRole.MEMBER],
    [MembershipTier.PROFESSIONAL, UserRole.MEMBER],
    [MembershipTier.AUDITOR, UserRole.MEMBER],
    [MembershipTier.ORG, UserRole.MEMBER],
    [MembershipTier.FREE, UserRole.ADMIN]
  ] as const;

  for (const [tier, role] of identities) {
    const resolveAccess = policyAccessResolver(tier, role);
    assert.equal((await getBusinessProfileManagementAccess("user-1", resolveAccess)).allowed, false);
    assert.equal((await viewerCanCreateAuditorProfile("user-1", resolveAccess)).allowed, false);
  }
});

test("service access follows an explicit canonical capability instead of tier or role shortcuts", async () => {
  const allowBusiness: AccessResolver = async (_userId, featureKey) => ({
    allowed: featureKey === "market.storefront",
    reason: "Explicit capability test."
  });
  const allowAuditor: AccessResolver = async (_userId, featureKey) => ({
    allowed: featureKey === "auditors.createProfile",
    reason: "Explicit capability test."
  });

  assert.equal((await getBusinessProfileManagementAccess("user-1", allowBusiness)).allowed, true);
  assert.equal((await viewerCanCreateAuditorProfile("user-1", allowAuditor)).allowed, true);
});

test("storefront ownership never substitutes for the storefront management capability", () => {
  assert.equal(
    storefrontManagementRelationshipAllows({
      viewerUserId: "owner-1",
      ownerUserId: "owner-1",
      viewerActive: true,
      capabilityAllowed: false
    }),
    false
  );
  assert.equal(
    storefrontManagementRelationshipAllows({
      viewerUserId: "personal-1",
      ownerUserId: "business-1",
      linkedBusinessUserId: "business-1",
      viewerActive: true,
      capabilityAllowed: false
    }),
    false
  );
  assert.equal(
    storefrontManagementRelationshipAllows({
      viewerUserId: "owner-1",
      ownerUserId: "owner-1",
      viewerActive: true,
      capabilityAllowed: true
    }),
    true
  );
  assert.equal(
    storefrontManagementRelationshipAllows({
      viewerUserId: "owner-1",
      ownerUserId: "owner-1",
      viewerActive: false,
      capabilityAllowed: true
    }),
    false
  );
});
