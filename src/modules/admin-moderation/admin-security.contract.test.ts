import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { evaluateAdminActorTarget } from "@/lib/platform/roles";
import { lifecycleSchema } from "@/modules/admin-moderation/account-lifecycle.service";
import {
  platformCreditAdjustmentConfirmation,
  platformCreditAdjustmentSchema,
  wouldPlatformCreditAdjustmentBeNegative
} from "@/modules/admin-moderation/platform-credits.service";

test("administrator hierarchy permits only existing-role downward targets", () => {
  const decision = (actorRole: UserRole, targetRole: UserRole, sameUser = false) =>
    evaluateAdminActorTarget({
      actorUserId: "actor",
      actorRole,
      targetUserId: sameUser ? "actor" : "target",
      targetRole
    }).allowed;

  assert.equal(decision(UserRole.ADMIN, UserRole.MEMBER), true);
  assert.equal(decision(UserRole.ADMIN, UserRole.ADMIN), false);
  assert.equal(decision(UserRole.ADMIN, UserRole.GOD), false);
  assert.equal(decision(UserRole.GOD, UserRole.MEMBER), true);
  assert.equal(decision(UserRole.GOD, UserRole.ADMIN), true);
  assert.equal(decision(UserRole.GOD, UserRole.GOD), false);
  assert.equal(decision(UserRole.GOD, UserRole.MEMBER, true), false);
});

test("account deletion requires a durable request followed by confirmation", () => {
  assert.equal(lifecycleSchema.safeParse({
    action: "delete",
    commandId: "command-legacy-delete",
    userIdentifier: "member",
    reason: "legacy one-step delete",
    confirmation: "DELETE member",
    deletePassword: "DELETE"
  }).success, false);

  assert.equal(lifecycleSchema.safeParse({
    action: "request-delete",
    commandId: "command-request-delete",
    userIdentifier: "member",
    reason: "Account deletion requested by support."
  }).success, true);

  assert.equal(lifecycleSchema.safeParse({
    action: "confirm-delete",
    commandId: "command-confirm-delete",
    destructiveActionRequestId: "request-id",
    confirmation: "DELETE member",
    deletePassword: "DELETE"
  }).success, true);
});

test("platform credit adjustments require idempotency and reject negative results", () => {
  assert.equal(platformCreditAdjustmentSchema.safeParse({
    userIdentifier: "member",
    amount: 5,
    reason: "Beta allocation",
    confirmation: "ADJUST member +5"
  }).success, false);
  assert.equal(platformCreditAdjustmentSchema.safeParse({
    idempotencyKey: "credits-command-001",
    userIdentifier: "member",
    amount: 5,
    reason: "Beta allocation",
    confirmation: "ADJUST member +5"
  }).success, true);
  assert.equal(platformCreditAdjustmentConfirmation("member", 5), "ADJUST member +5");
  assert.equal(platformCreditAdjustmentConfirmation("member", -5), "ADJUST member -5");
  assert.equal(wouldPlatformCreditAdjustmentBeNegative(4, -5), true);
  assert.equal(wouldPlatformCreditAdjustmentBeNegative(5, -5), false);
});
