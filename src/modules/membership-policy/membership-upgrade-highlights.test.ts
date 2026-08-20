import assert from "node:assert/strict";
import test from "node:test";
import { MembershipTier } from "@prisma/client";
import {
  hasActiveMembershipUpgradeHighlight,
  MEMBERSHIP_UPGRADE_HIGHLIGHT_DAYS
} from "@/modules/membership-policy/membership-upgrade-highlights";

const now = new Date("2026-08-14T12:00:00.000Z");

test("membership navigation highlight is active for the first 30 days after an upgrade", () => {
  assert.equal(hasActiveMembershipUpgradeHighlight({
    tier: MembershipTier.CONTRIBUTOR,
    tierActivatedAt: new Date(now.getTime() - (MEMBERSHIP_UPGRADE_HIGHLIGHT_DAYS - 1) * 24 * 60 * 60 * 1000),
    now
  }), true);
  assert.equal(hasActiveMembershipUpgradeHighlight({
    tier: MembershipTier.CONTRIBUTOR,
    tierActivatedAt: new Date(now.getTime() - MEMBERSHIP_UPGRADE_HIGHLIGHT_DAYS * 24 * 60 * 60 * 1000),
    now
  }), false);
});

test("Free membership and unknown activation dates do not receive an upgrade highlight", () => {
  assert.equal(hasActiveMembershipUpgradeHighlight({
    tier: MembershipTier.FREE,
    tierActivatedAt: now,
    now
  }), false);
  assert.equal(hasActiveMembershipUpgradeHighlight({
    tier: MembershipTier.CONTRIBUTOR,
    tierActivatedAt: null,
    now
  }), false);
});
