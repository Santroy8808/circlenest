import assert from "node:assert/strict";
import test from "node:test";
import "../../../scripts/load-next-env";
import { buildInviteOrientationEmail } from "@/modules/membership-policy/invite-orientation-email";

test("invite orientation preserves the required Non-E beta guidance", () => {
  const message = buildInviteOrientationEmail("member@example.com");

  assert.equal(message.subject, "Theta-Space Non-E");
  assert.match(message.text, /private, member-focused social network for Scientologists/i);
  assert.match(message.text, /not affiliated with or operated by the Church of Scientology/i);
  assert.match(message.text, /desktop or laptop/i);
  assert.match(message.text, /Android app is being built/i);
  assert.match(message.text, /iOS app will follow/i);
  assert.match(message.text, /Feedback button on any page/i);
  assert.match(message.text, /Visit Theta-Space: https?:\/\//i);
  assert.match(message.html, /theta-send-logo\.png/i);
  assert.match(message.html, /Visit Theta-Space/i);
  assert.match(message.text, /unsubscribe/i);
  assert.match(message.html, /Unsubscribe/i);
});
