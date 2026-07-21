import assert from "node:assert/strict";
import test from "node:test";
import { MembershipTier, UserRole } from "@prisma/client";
import {
  platformCreditAdjustmentConfirmation,
  validateLockedPlatformCreditActors
} from "@/modules/admin-moderation/platform-credits.service";

const member = {
  id: "member-1",
  email: "member@example.test",
  username: "member",
  role: UserRole.MEMBER,
  deactivatedAt: null,
  displayName: "Member",
  tier: MembershipTier.FREE,
  platformCredits: 0
};

test("credit authorization is re-evaluated from locked rows after an initial lookup race", () => {
  const confirmation = platformCreditAdjustmentConfirmation(member.username, 10);
  const initiallyAllowed = validateLockedPlatformCreditActors({
    actor: { id: "admin-1", role: UserRole.ADMIN, deactivatedAt: null },
    target: member,
    amount: 10,
    confirmation
  });
  assert.equal(initiallyAllowed.ok, true);

  const actorDeactivatedBeforeLock = validateLockedPlatformCreditActors({
    actor: { id: "admin-1", role: UserRole.ADMIN, deactivatedAt: new Date() },
    target: member,
    amount: 10,
    confirmation
  });
  assert.equal(actorDeactivatedBeforeLock.ok, false);
  assert.match(actorDeactivatedBeforeLock.error ?? "", /Admin access required/);

  const targetPromotedBeforeLock = validateLockedPlatformCreditActors({
    actor: { id: "admin-1", role: UserRole.ADMIN, deactivatedAt: null },
    target: { ...member, role: UserRole.GOD },
    amount: 10,
    confirmation
  });
  assert.equal(targetPromotedBeforeLock.ok, false);
  assert.match(targetPromotedBeforeLock.error ?? "", /protected/);

  const targetDeactivatedBeforeLock = validateLockedPlatformCreditActors({
    actor: { id: "god-1", role: UserRole.GOD, deactivatedAt: null },
    target: { ...member, deactivatedAt: new Date() },
    amount: 10,
    confirmation
  });
  assert.equal(targetDeactivatedBeforeLock.ok, false);
  assert.match(targetDeactivatedBeforeLock.error ?? "", /deactivated/);
});

test("typed confirmation is checked against the locked current username", () => {
  const staleConfirmation = platformCreditAdjustmentConfirmation(member.username, 10);
  const renamedBeforeLock = validateLockedPlatformCreditActors({
    actor: { id: "god-1", role: UserRole.GOD, deactivatedAt: null },
    target: { ...member, username: "renamed-member" },
    amount: 10,
    confirmation: staleConfirmation
  });
  assert.equal(renamedBeforeLock.ok, false);
  assert.match(renamedBeforeLock.error ?? "", /ADJUST renamed-member \+10/);
});
