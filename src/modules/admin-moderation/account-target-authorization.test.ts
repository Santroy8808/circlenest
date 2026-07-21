import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  AdminTargetAuthorizationError,
  authorizeLockedAdminActor,
  authorizeLockedAdminActorTarget,
  orderedAdminActorTargetIds
} from "@/modules/admin-moderation/account-target-authorization";

test("account-target authorization uses one deterministic lock order", () => {
  assert.deepEqual(orderedAdminActorTargetIds("user-z", "user-a"), ["user-a", "user-z"]);
  assert.deepEqual(orderedAdminActorTargetIds("same", "same"), ["same"]);
});

test("transaction-local hierarchy rejects a target promoted before the lock", () => {
  assert.throws(
    () => authorizeLockedAdminActorTarget({
      actorUserId: "admin",
      targetUserId: "target",
      users: [
        { id: "admin", role: UserRole.ADMIN, deactivatedAt: null },
        { id: "target", role: UserRole.GOD, deactivatedAt: null }
      ]
    }),
    (error) => error instanceof AdminTargetAuthorizationError && error.code === "TARGET_PROTECTED"
  );
});

test("privileged account creation accepts only a currently active locked administrator", () => {
  assert.equal(authorizeLockedAdminActor({
    actorUserId: "admin",
    users: [{ id: "admin", role: UserRole.ADMIN, deactivatedAt: null }]
  }).id, "admin");
  assert.throws(
    () => authorizeLockedAdminActor({
      actorUserId: "former-admin",
      users: [{ id: "former-admin", role: UserRole.MEMBER, deactivatedAt: null }]
    }),
    (error) => error instanceof AdminTargetAuthorizationError && error.code === "ACTOR_UNAVAILABLE"
  );
  assert.throws(
    () => authorizeLockedAdminActor({
      actorUserId: "disabled-admin",
      users: [{ id: "disabled-admin", role: UserRole.ADMIN, deactivatedAt: new Date() }]
    }),
    (error) => error instanceof AdminTargetAuthorizationError && error.code === "ACTOR_UNAVAILABLE"
  );
});

test("transaction-local hierarchy rejects a concurrently deactivated actor or target", () => {
  assert.throws(
    () => authorizeLockedAdminActorTarget({
      actorUserId: "admin",
      targetUserId: "member",
      users: [
        { id: "admin", role: UserRole.ADMIN, deactivatedAt: new Date() },
        { id: "member", role: UserRole.MEMBER, deactivatedAt: null }
      ]
    }),
    (error) => error instanceof AdminTargetAuthorizationError && error.code === "ACTOR_UNAVAILABLE"
  );
  assert.throws(
    () => authorizeLockedAdminActorTarget({
      actorUserId: "admin",
      targetUserId: "member",
      users: [
        { id: "admin", role: UserRole.ADMIN, deactivatedAt: null },
        { id: "member", role: UserRole.MEMBER, deactivatedAt: new Date() }
      ]
    }),
    (error) => error instanceof AdminTargetAuthorizationError && error.code === "TARGET_UNAVAILABLE"
  );
});

test("transaction-local hierarchy permits the current downward role relationship", () => {
  const result = authorizeLockedAdminActorTarget({
    actorUserId: "admin",
    targetUserId: "member",
    users: [
      { id: "member", role: UserRole.MEMBER, deactivatedAt: null },
      { id: "admin", role: UserRole.ADMIN, deactivatedAt: null }
    ]
  });
  assert.equal(result.actor.id, "admin");
  assert.equal(result.target.id, "member");
});
