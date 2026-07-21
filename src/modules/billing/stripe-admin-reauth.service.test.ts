import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  createStripeAdminReauthenticationBinding,
  validateStripeAdminReauthenticationSnapshot
} from "@/modules/billing/stripe-admin-reauth.service";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const payload = { commandId: "stripe-command-1", mode: "TEST", currency: "usd" };
const actor = {
  id: "god-1",
  role: UserRole.GOD,
  deactivatedAt: null,
  passwordHash: "bcrypt-password-hash",
  sessionVersion: 7,
  lastPasswordChangedAt: new Date("2026-07-21T12:00:00.000Z")
};

function proofFixture() {
  const secret = "one-time-secret";
  const binding = createStripeAdminReauthenticationBinding({
    actorUserId: actor.id,
    kind: "connection",
    validatedPayload: payload
  });
  return {
    binding,
    presentedProof: { id: "proof-1", secret },
    proof: {
      id: "proof-1",
      actorUserId: actor.id,
      module: "stripe-admin-reauth",
      actionKey: "connection",
      status: "pending",
      metadata: {
        binding,
        commandId: payload.commandId,
        expiresAt: "2026-07-21T12:01:00.000Z",
        secretHash: sha256(secret),
        sessionVersion: actor.sessionVersion,
        lastPasswordChangedAt: actor.lastPasswordChangedAt.toISOString(),
        passwordHashFingerprint: sha256(actor.passwordHash)
      }
    }
  };
}

test("Stripe reauthentication is bound to actor, command kind, and validated payload", () => {
  const original = createStripeAdminReauthenticationBinding({
    actorUserId: actor.id,
    kind: "connection",
    validatedPayload: payload
  });
  assert.notEqual(original, createStripeAdminReauthenticationBinding({
    actorUserId: "other-god",
    kind: "connection",
    validatedPayload: payload
  }));
  assert.notEqual(original, createStripeAdminReauthenticationBinding({
    actorUserId: actor.id,
    kind: "credit-package",
    validatedPayload: payload
  }));
  assert.notEqual(original, createStripeAdminReauthenticationBinding({
    actorUserId: actor.id,
    kind: "connection",
    validatedPayload: { ...payload, currency: "eur" }
  }));
});

test("Stripe proof is short-lived, single-use, and invalidated by security changes", () => {
  const fixture = proofFixture();
  const base = {
    actor,
    proof: fixture.proof,
    presentedProof: fixture.presentedProof,
    kind: "connection" as const,
    binding: fixture.binding,
    now: new Date("2026-07-21T12:00:30.000Z")
  };
  assert.equal(validateStripeAdminReauthenticationSnapshot(base).ok, true);
  assert.equal(validateStripeAdminReauthenticationSnapshot({
    ...base,
    proof: { ...fixture.proof, status: "consumed" }
  }).ok, false);
  assert.equal(validateStripeAdminReauthenticationSnapshot({
    ...base,
    now: new Date("2026-07-21T12:01:00.000Z")
  }).ok, false);
  assert.equal(validateStripeAdminReauthenticationSnapshot({
    ...base,
    actor: { ...actor, sessionVersion: actor.sessionVersion + 1 }
  }).ok, false);
  assert.equal(validateStripeAdminReauthenticationSnapshot({
    ...base,
    actor: { ...actor, passwordHash: "changed-password-hash" }
  }).ok, false);
  assert.equal(validateStripeAdminReauthenticationSnapshot({
    ...base,
    actor: { ...actor, lastPasswordChangedAt: new Date("2026-07-21T12:00:10.000Z") }
  }).ok, false);
});
