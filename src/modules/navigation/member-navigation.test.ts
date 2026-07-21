import assert from "node:assert/strict";
import test from "node:test";
import { MembershipTier } from "@prisma/client";
import { buildMemberNavigation } from "@/modules/navigation/member-navigation";
import { getTierPolicy } from "@/modules/membership-policy/policy";

const platformFeatures = {
  "community.groups": true,
  "communication.direct_messages": true,
  "directory.auditor_directory": true,
  "marketplace.member_market": true,
  "media.personal_gallery": true,
  "publishing.writers_corner": true,
  "support.feedback_center": true
};

function navigation(tier: MembershipTier, isAdmin = false) {
  return buildMemberNavigation({
    features: getTierPolicy(tier).features,
    isAdmin,
    isSignedIn: true,
    mailEnabled: false,
    platformFeatures
  });
}

function links(tier: MembershipTier, isAdmin = false) {
  return navigation(tier, isAdmin).flatMap((section) => section.items.map((item) => item.href).filter(Boolean));
}

test("Free navigation hides Contributor and disabled business creation surfaces", () => {
  const hrefs = links(MembershipTier.FREE);
  assert.equal(hrefs.includes("/writers-corner"), false);
  assert.equal(hrefs.includes("/settings/feedback"), false);
  assert.equal(hrefs.includes("/business-center"), false);
  assert.equal(hrefs.includes("/ads"), false);
  assert.equal(hrefs.includes("/fundraisers"), false);
  assert.equal(hrefs.includes("/events"), false);
});

test("Contributor navigation exposes Writers and support but not business tools", () => {
  const hrefs = links(MembershipTier.CONTRIBUTOR);
  assert.equal(hrefs.includes("/writers-corner"), true);
  assert.equal(hrefs.includes("/settings/feedback"), true);
  assert.equal(hrefs.includes("/business-center"), false);
  assert.equal(hrefs.includes("/ads"), false);
  assert.equal(hrefs.includes("/fundraisers"), false);
});

test("administrator role adds administration without leaking disabled member tools", () => {
  const sections = navigation(MembershipTier.FREE, true);
  const hrefs = sections.flatMap((section) => section.items.map((item) => item.href).filter(Boolean));
  assert.equal(sections.some((section) => section.label === "Admin"), true);
  assert.equal(hrefs.includes("/business-center"), false);
  assert.equal(hrefs.includes("/ads"), false);
  assert.equal(hrefs.includes("/fundraisers"), false);
});
