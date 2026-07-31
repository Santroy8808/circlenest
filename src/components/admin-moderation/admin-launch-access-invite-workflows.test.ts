import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExistingUserGrantPayload,
  buildInviteNewUserPayload,
  canGrantExistingUserAccess,
  inviteNewUserButtonLabel
} from "./admin-launch-access-invite-workflows";

test("new-user invite workflow builds only invite-recipient payload fields", () => {
  assert.equal(inviteNewUserButtonLabel(true), "Generate and Send Invite");
  assert.equal(inviteNewUserButtonLabel(false), "Generate Invite Code");

  const payload = buildInviteNewUserPayload({
    recipientEmail: " person@example.com ",
    expiresInDays: 14,
    sendEmailImmediately: true
  });

  assert.deepEqual(payload, {
    action: "generate",
    recipientEmail: "person@example.com",
    expiresInDays: 14,
    sendEmail: true
  });
  assert.equal("userIdentifier" in payload, false);
  assert.equal("assignedUserIdentifier" in payload, false);
});

test("existing-user invite workflow requires a selected account and omits recipient email", () => {
  assert.equal(canGrantExistingUserAccess(null), false);
  assert.equal(canGrantExistingUserAccess({ id: "user_1", email: "jules@example.com", username: "jules" }), true);
  assert.equal(canGrantExistingUserAccess({ id: "user_1", email: "jules@example.com", username: "jules" }, true), false);

  const payload = buildExistingUserGrantPayload({
    account: { id: "user_1", email: "jules@example.com", username: "jules" },
    expiresInDays: 30
  });

  assert.deepEqual(payload, {
    action: "grant-existing",
    userIdentifier: "jules",
    expiresInDays: 30
  });
  assert.equal("recipientEmail" in payload, false);
  assert.equal("sendEmail" in payload, false);
});
