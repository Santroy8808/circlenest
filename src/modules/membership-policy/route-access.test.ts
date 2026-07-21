import assert from "node:assert/strict";
import test from "node:test";
import { MembershipTier, UserRole } from "@prisma/client";
import {
  membershipRouteAccessDecision,
  membershipRouteCapabilityMap,
  type MembershipRouteGate
} from "@/modules/membership-policy/route-access";
import {
  evaluateFeatureAccess,
  resolvePolicy
} from "@/modules/membership-policy/membership-policy.service";

function tierCanUseRoute(
  tier: MembershipTier,
  gate: MembershipRouteGate,
  role: UserRole = UserRole.MEMBER
) {
  const policy = resolvePolicy({ tier, role });
  return evaluateFeatureAccess(policy, membershipRouteCapabilityMap[gate]).allowed;
}

test("Free and Contributor direct-route capability matrix matches the release contract", () => {
  assert.equal(tierCanUseRoute(MembershipTier.FREE, "writersCreate"), false);
  assert.equal(tierCanUseRoute(MembershipTier.FREE, "supportCreate"), false);
  assert.equal(tierCanUseRoute(MembershipTier.FREE, "businessManage"), false);

  assert.equal(tierCanUseRoute(MembershipTier.CONTRIBUTOR, "writersCreate"), true);
  assert.equal(tierCanUseRoute(MembershipTier.CONTRIBUTOR, "supportCreate"), true);
  assert.equal(tierCanUseRoute(MembershipTier.CONTRIBUTOR, "businessManage"), false);
  assert.equal(tierCanUseRoute(MembershipTier.CONTRIBUTOR, "writersStorefrontPublish"), false);
  assert.equal(tierCanUseRoute(MembershipTier.CONTRIBUTOR, "businessAdsManage"), false);
});

test("disabled-tier creation routes stay unavailable after operational normalization", () => {
  for (const tier of [MembershipTier.PROFESSIONAL, MembershipTier.AUDITOR, MembershipTier.ORG]) {
    assert.equal(tierCanUseRoute(tier, "businessManage"), false);
    assert.equal(tierCanUseRoute(tier, "businessAdsManage"), false);
    assert.equal(tierCanUseRoute(tier, "auditorProfileCreate"), false);
  }
});

test("administrator status does not silently enable disabled member creation products", () => {
  assert.equal(tierCanUseRoute(MembershipTier.FREE, "writersCreate", UserRole.ADMIN), false);
  assert.equal(tierCanUseRoute(MembershipTier.FREE, "businessManage", UserRole.ADMIN), false);
  assert.equal(tierCanUseRoute(MembershipTier.FREE, "businessAdsManage", UserRole.ADMIN), false);
  assert.equal(tierCanUseRoute(MembershipTier.FREE, "auditorProfileCreate", UserRole.ADMIN), false);
  assert.equal(tierCanUseRoute(MembershipTier.FREE, "supportCreate", UserRole.ADMIN), true);

  const adminPolicy = resolvePolicy({ tier: MembershipTier.FREE, role: UserRole.ADMIN });
  assert.equal(adminPolicy.features["support.createRequest"], true);
  assert.equal(adminPolicy.features["invites.send"], true);
  assert.equal(adminPolicy.features["invites.bulkSend"], true);
  assert.equal(adminPolicy.features["jobs.createListing"], false);
  assert.equal(adminPolicy.features["ads.createGeneral"], false);
});

test("page and API denials use stable 404 and 403 semantics", () => {
  assert.deepEqual(membershipRouteAccessDecision("businessManage", "page", false), {
    allowed: false,
    capability: "market.storefront",
    error: "Not found.",
    status: 404
  });
  assert.deepEqual(membershipRouteAccessDecision("businessManage", "api", false), {
    allowed: false,
    capability: "market.storefront",
    error: "This action is not available for this membership.",
    status: 403
  });
});
