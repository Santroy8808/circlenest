import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, UserRole, type AuditLog } from "@prisma/client";
import {
  adminPasswordResetCommandFingerprint,
  adminPasswordResetPasswordDigest,
  isMatchingAdminPasswordResetReplay,
  resetAccountPasswordInTransaction
} from "@/modules/admin-moderation/account-support.service";

const secret = "test-password-reset-command-secret";
const password = "A genuinely strong password 91!";

function fingerprint(overrides: Partial<{
  actorUserId: string;
  targetUserId: string;
  reason: string;
  password: string;
}> = {}) {
  return adminPasswordResetCommandFingerprint({
    actorUserId: overrides.actorUserId ?? "admin-1",
    targetUserId: overrides.targetUserId ?? "member-1",
    reason: overrides.reason ?? "Member verified the reset request.",
    passwordDigest: adminPasswordResetPasswordDigest(overrides.password ?? password, secret)
  });
}

test("password-reset command fingerprint binds the complete security-sensitive request", () => {
  const expected = fingerprint();

  assert.equal(fingerprint(), expected);
  assert.notEqual(fingerprint({ targetUserId: "member-2" }), expected);
  assert.notEqual(fingerprint({ reason: "A different administrator reason." }), expected);
  assert.notEqual(fingerprint({ password: "A different strong password 92!" }), expected);
  assert.notEqual(fingerprint({ actorUserId: "admin-2" }), expected);
});

test("password reset fingerprint and audit metadata do not expose password material", () => {
  const digest = adminPasswordResetPasswordDigest(password, secret);
  const commandFingerprint = fingerprint();

  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.match(commandFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(digest.includes(password), false);
  assert.equal(commandFingerprint.includes(password), false);
  assert.notEqual(digest, commandFingerprint);
});

test("password-reset replay succeeds only for the exact bound command", () => {
  const commandFingerprint = fingerprint();
  const replay = {
    actorUserId: "admin-1",
    action: "password.reset",
    targetType: "User",
    targetId: "member-1",
    metadata: { commandFingerprint }
  } as Pick<AuditLog, "actorUserId" | "action" | "targetType" | "targetId" | "metadata">;

  assert.equal(
    isMatchingAdminPasswordResetReplay(replay, "admin-1", "member-1", commandFingerprint),
    true
  );
  assert.equal(
    isMatchingAdminPasswordResetReplay(replay, "admin-1", "member-1", fingerprint({ password: "Changed 93!" })),
    false
  );
  assert.equal(
    isMatchingAdminPasswordResetReplay(replay, "admin-1", "member-2", commandFingerprint),
    false
  );
});

test("password reset locks authorization, rereads before-state, then mutates and audits", async () => {
  const events: string[] = [];
  let auditData: Record<string, unknown> | undefined;
  const previousPasswordChange = new Date("2026-07-01T12:00:00.000Z");
  const changedAt = new Date("2026-07-21T12:00:00.000Z");
  const transaction = {
    $queryRaw: async () => {
      events.push("lock-actor-target");
      return [
        { id: "admin-1", role: UserRole.ADMIN, deactivatedAt: null },
        { id: "member-1", role: UserRole.MEMBER, deactivatedAt: null }
      ];
    },
    user: {
      findUniqueOrThrow: async () => {
        events.push("read-current-before-state");
        return { sessionVersion: 9, lastPasswordChangedAt: previousPasswordChange };
      },
      update: async () => {
        events.push("update-password");
        return { sessionVersion: 10, lastPasswordChangedAt: changedAt };
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push("write-audit");
        auditData = data;
        return { id: "audit-1", ...data };
      }
    }
  } as unknown as Prisma.TransactionClient;

  await resetAccountPasswordInTransaction(transaction, {
    actorUserId: "admin-1",
    target: {
      id: "member-1",
      email: "member@example.com",
      username: "member",
      profile: { displayName: "Member" }
    },
    passwordHash: "opaque-password-hash",
    commandId: "reset-command-001",
    commandFingerprint: fingerprint(),
    reason: " Member verified the reset request. ",
    changedAt
  });

  assert.deepEqual(events, [
    "lock-actor-target",
    "read-current-before-state",
    "update-password",
    "write-audit"
  ]);
  assert.deepEqual(auditData?.before, {
    sessionVersion: 9,
    lastPasswordChangedAt: previousPasswordChange.toISOString()
  });
  assert.equal(JSON.stringify(auditData).includes("opaque-password-hash"), false);
});
