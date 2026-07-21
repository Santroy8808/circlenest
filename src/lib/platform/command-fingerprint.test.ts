import assert from "node:assert/strict";
import test from "node:test";
import { createCommandFingerprint, isMatchingCommandFingerprint } from "./command-fingerprint";

const command = {
  actorUserId: "admin-1",
  action: "membership.override.updated",
  target: { type: "MembershipTier", id: "CONTRIBUTOR" },
  payload: {
    featureKey: "invites.send",
    allowed: true,
    reason: "Controlled beta access",
    expiresAt: null
  }
};

test("command fingerprints are canonical and bind the complete validated command", () => {
  const fingerprint = createCommandFingerprint(command);
  assert.equal(
    fingerprint,
    createCommandFingerprint({
      ...command,
      payload: {
        expiresAt: null,
        reason: "Controlled beta access",
        allowed: true,
        featureKey: "invites.send"
      }
    })
  );

  assert.notEqual(fingerprint, createCommandFingerprint({ ...command, actorUserId: "admin-2" }));
  assert.notEqual(fingerprint, createCommandFingerprint({ ...command, action: "membership.override.deleted" }));
  assert.notEqual(fingerprint, createCommandFingerprint({ ...command, target: { ...command.target, id: "FREE" } }));
  assert.notEqual(fingerprint, createCommandFingerprint({ ...command, payload: { ...command.payload, allowed: false } }));
  assert.notEqual(fingerprint, createCommandFingerprint({ ...command, payload: { ...command.payload, reason: "Changed" } }));
});

test("audit replay matching requires actor, action, target, and the stored fingerprint", () => {
  const fingerprint = createCommandFingerprint(command);
  const audit = {
    actorUserId: command.actorUserId,
    action: command.action,
    targetType: command.target.type,
    targetId: command.target.id,
    metadata: { commandFingerprint: fingerprint }
  };
  const expected = {
    actorUserId: command.actorUserId,
    action: command.action,
    target: command.target,
    fingerprint
  };

  assert.equal(isMatchingCommandFingerprint(audit, expected), true);
  assert.equal(isMatchingCommandFingerprint({ ...audit, actorUserId: "admin-2" }, expected), false);
  assert.equal(isMatchingCommandFingerprint({ ...audit, action: "other" }, expected), false);
  assert.equal(isMatchingCommandFingerprint({ ...audit, targetId: "FREE" }, expected), false);
  assert.equal(isMatchingCommandFingerprint({ ...audit, metadata: { commandFingerprint: "changed" } }, expected), false);
});
