import { UserRole } from "@prisma/client";

export function isAdminRole(role?: UserRole | null) {
  return role === UserRole.ADMIN || role === UserRole.GOD;
}

export function isGodRole(role?: UserRole | null) {
  return role === UserRole.GOD;
}

export type AdminActorTargetInput = {
  actorUserId: string;
  actorRole?: UserRole | null;
  targetUserId: string;
  targetRole?: UserRole | null;
};

export type AdminActorTargetDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "ACTOR_NOT_ADMIN" | "SELF_TARGET" | "GOD_TARGET_PROTECTED" | "TARGET_ROLE_NOT_ALLOWED";
    };

/**
 * Enforces the existing administrator hierarchy for account-targeted commands:
 * ADMIN may act on MEMBER, GOD may act on MEMBER or ADMIN, and no ordinary
 * administrator command may target GOD or the actor's own account.
 */
export function evaluateAdminActorTarget(input: AdminActorTargetInput): AdminActorTargetDecision {
  if (!isAdminRole(input.actorRole)) {
    return { allowed: false, reason: "ACTOR_NOT_ADMIN" };
  }

  if (input.actorUserId === input.targetUserId) {
    return { allowed: false, reason: "SELF_TARGET" };
  }

  if (input.targetRole === UserRole.GOD) {
    return { allowed: false, reason: "GOD_TARGET_PROTECTED" };
  }

  if (input.actorRole === UserRole.ADMIN && input.targetRole === UserRole.MEMBER) {
    return { allowed: true };
  }

  if (
    input.actorRole === UserRole.GOD &&
    (input.targetRole === UserRole.MEMBER || input.targetRole === UserRole.ADMIN)
  ) {
    return { allowed: true };
  }

  return { allowed: false, reason: "TARGET_ROLE_NOT_ALLOWED" };
}

export function canAdminActorTarget(input: AdminActorTargetInput) {
  return evaluateAdminActorTarget(input).allowed;
}
