import assert from "node:assert/strict";
import test from "node:test";
import { buildFreeAccountInviteEmail } from "@/modules/membership-policy/free-account-invites.service";

test("every invitation includes the beta desktop and mobile-app notice", () => {
  const message = buildFreeAccountInviteEmail("TS-FREE-ABC123", new Date("2026-08-15T00:00:00.000Z"));

  assert.match(message.text, /best tested on a desktop or laptop/i);
  assert.match(message.text, /Android app is being built/i);
  assert.match(message.text, /iOS app will follow soon after/i);
  assert.match(message.html, /Beta testing works best on a PC/i);
  assert.match(message.html, /Android app is being built/i);
  assert.match(message.html, /iOS app will follow soon after/i);
});
