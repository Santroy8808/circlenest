import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  "membership.bulk_invites": true,
  "membership.single_invites": true,
  "publishing.writers_corner": true,
  "support.feedback_center": true
};

function navigation(tier: MembershipTier, isAdmin = false, featureOverrides: Record<string, boolean> = {}, defaultHomeHref?: string) {
  return buildMemberNavigation({
    defaultHomeHref,
    features: { ...getTierPolicy(tier).features, ...featureOverrides },
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
  assert.equal(hrefs.includes("/jobs"), true);
});

test("Contributor navigation exposes Writers but keeps Feedback submission in the global control", () => {
  const hrefs = links(MembershipTier.CONTRIBUTOR);
  assert.equal(hrefs.includes("/writers-corner"), true);
  assert.equal(hrefs.includes("/settings/feedback"), false);
  assert.equal(hrefs.includes("/business-center"), false);
  assert.equal(hrefs.includes("/ads"), false);
  assert.equal(hrefs.includes("/fundraisers"), false);
  assert.equal(hrefs.includes("/jobs"), true);
});

test("Comm Center keeps Chat, People, and Groups as submenu items while Jobs is linked from Market", () => {
  for (const tier of [MembershipTier.FREE, MembershipTier.CONTRIBUTOR]) {
    const sections = navigation(tier);
    const commCenter = sections.find((section) => section.label === "Comm Center");
    const market = sections.find((section) => section.label === "Market");

    assert.equal(commCenter?.href, "/comm-center");
    assert.deepEqual(
      commCenter?.items.map((item) => [item.label, item.href]),
      [
        ["Chat", "/messages"],
        ["People", "/people"],
        ["Groups", "/groups"]
      ]
    );
    assert.equal(sections.some((section) => section.label === "People"), false);
    assert.equal(sections.some((section) => section.label === "Groups"), false);
    assert.equal(market?.items.some((item) => item.href === "/jobs"), true);
  }
});

test("control panel exposes Market submenu items including Jobs", () => {
  const controlPanel = readFileSync(resolve("src/components/platform/control-panel-nav.tsx"), "utf8");

  assert.match(controlPanel, /popupMenuSectionLabels = new Set\(\["Comm Center", "Market"\]\)/);
  assert.match(controlPanel, /Open \$\{section\.label\} menu\./);
});

test("every signed-in member tier receives a top-level Tutorial section with the Users Manual", () => {
  for (const tier of [MembershipTier.FREE, MembershipTier.CONTRIBUTOR]) {
    const tutorial = navigation(tier).find((section) => section.label === "Tutorial");
    assert.equal(tutorial?.href, "/settings/tutorial");
    assert.deepEqual(
      tutorial?.items.map((item) => item.href),
      ["/settings/tutorial", "/settings/users-manual"]
    );
  }
});

test("gifted Free invite permission adds Invite Someone under Settings", () => {
  assert.equal(links(MembershipTier.FREE).includes("/settings/invite"), false);

  const settings = navigation(MembershipTier.FREE, false, { "invites.send": true }).find((section) => section.label === "Settings");
  assert.equal(settings?.items.some((item) => item.label === "Invite Someone!" && item.href === "/settings/invite"), true);
});

test("Android downloads are not advertised while mobile builds are paused", () => {
  const settings = navigation(MembershipTier.FREE).find((section) => section.label === "Settings");
  assert.equal(settings?.items.some((item) => item.label === "Android Apps" && item.href === "/android"), false);
});

test("Home section can point to the selected default while keeping My Stream", () => {
  const home = navigation(MembershipTier.FREE, false, {}, "/jobs").find((section) => section.label === "Home");

  assert.equal(home?.href, "/jobs");
  assert.equal(home?.items.some((item) => item.label === "My Stream" && item.href === "/home"), true);
});

test("administrator role adds administration without leaking disabled member tools", () => {
  const sections = navigation(MembershipTier.FREE, true);
  const hrefs = sections.flatMap((section) => section.items.map((item) => item.href).filter(Boolean));
  assert.equal(sections.some((section) => section.label === "Admin"), true);
  assert.equal(hrefs.includes("/business-center"), false);
  assert.equal(hrefs.includes("/ads"), false);
  assert.equal(hrefs.includes("/fundraisers"), false);
});
