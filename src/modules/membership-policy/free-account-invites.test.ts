import assert from "node:assert/strict";
import test from "node:test";
import { buildFreeAccountInviteEmail, parseBulkInviteEmails } from "@/modules/membership-policy/free-account-invites.service";

test("every invitation includes the beta desktop and mobile-app notice", () => {
  const message = buildFreeAccountInviteEmail("TS-FREE-ABC123", new Date("2026-08-15T00:00:00.000Z"), {
    recipientEmail: "member@example.com"
  });

  assert.match(message.text, /best tested on a desktop or laptop/i);
  assert.match(message.text, /Android app is being built/i);
  assert.match(message.text, /iOS app will follow soon after/i);
  assert.match(message.html, /Beta testing works best on a PC/i);
  assert.match(message.html, /Android app is being built/i);
  assert.match(message.html, /iOS app will follow soon after/i);
  assert.match(message.text, /unsubscribe/i);
  assert.match(message.html, /Unsubscribe/i);
});

test("member invitation emails can include an escaped personal message", () => {
  const message = buildFreeAccountInviteEmail("TS-FREE-ABC123", new Date("2026-08-15T00:00:00.000Z"), {
    personalMessage: "Hey <script>alert(1)</script>\nTry out this site!",
    recipientEmail: "member@example.com"
  });

  assert.match(message.text, /A NOTE FROM THE MEMBER WHO INVITED YOU/);
  assert.match(message.text, /Hey <script>alert\(1\)<\/script>/);
  assert.match(message.html, /A note from the member who invited you/);
  assert.match(message.html, /Hey &lt;script&gt;alert\(1\)&lt;\/script&gt;<br>Try out this site!/);
  assert.doesNotMatch(message.html, /<script>/);
});

test("invite recipient parsing handles comma and semicolon separated addresses", () => {
  const parsed = parseBulkInviteEmails("Invitee@email.com, invitee2@email.com; Invitee@email.com");

  assert.deepEqual(parsed.emails, ["invitee@email.com", "invitee2@email.com"]);
  assert.equal(parsed.extractedCount, 2);
  assert.equal(parsed.duplicateCount, 1);
});
