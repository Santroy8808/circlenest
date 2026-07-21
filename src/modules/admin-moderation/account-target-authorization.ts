import { Prisma, type UserRole } from "@prisma/client";
import { evaluateAdminActorTarget, isAdminRole } from "@/lib/platform/roles";

type LockedAdminTargetUser = {
  id: string;
  role: UserRole;
  deactivatedAt: Date | null;
};

export type AdminTargetAuthorizationErrorCode =
  | "ACTOR_UNAVAILABLE"
  | "TARGET_UNAVAILABLE"
  | "TARGET_PROTECTED";

export class AdminTargetAuthorizationError extends Error {
  constructor(readonly code: AdminTargetAuthorizationErrorCode, message: string) {
    super(message);
    this.name = "AdminTargetAuthorizationError";
  }
}

export function orderedAdminActorTargetIds(actorUserId: string, targetUserId: string) {
  return [...new Set([actorUserId.trim(), targetUserId.trim()].filter(Boolean))].sort();
}

export function authorizeLockedAdminActor(input: {
  actorUserId: string;
  users: readonly LockedAdminTargetUser[];
}) {
  const actor = input.users.find((user) => user.id === input.actorUserId);
  if (!actor || actor.deactivatedAt || !isAdminRole(actor.role)) {
    throw new AdminTargetAuthorizationError("ACTOR_UNAVAILABLE", "Admin access required.");
  }
  return actor;
}

export function authorizeLockedAdminActorTarget(input: {
  actorUserId: string;
  targetUserId: string;
  users: readonly LockedAdminTargetUser[];
}) {
  const usersById = new Map(input.users.map((user) => [user.id, user]));
  const actor = authorizeLockedAdminActor({ actorUserId: input.actorUserId, users: input.users });
  const target = usersById.get(input.targetUserId);

  if (!target || target.deactivatedAt) {
    throw new AdminTargetAuthorizationError("TARGET_UNAVAILABLE", "The target account is unavailable.");
  }

  const authorization = evaluateAdminActorTarget({
    actorUserId: actor.id,
    actorRole: actor.role,
    targetUserId: target.id,
    targetRole: target.role
  });
  if (!authorization.allowed) {
    throw new AdminTargetAuthorizationError(
      "TARGET_PROTECTED",
      "That account is protected from this administrator action."
    );
  }

  return { actor, target };
}

export async function lockAndAuthorizeAdminActor(
  transaction: Prisma.TransactionClient,
  actorUserId: string
) {
  const users = await transaction.$queryRaw<LockedAdminTargetUser[]>(Prisma.sql`
    SELECT "id", "role", "deactivatedAt"
    FROM "User"
    WHERE "id" = ${actorUserId}
    FOR UPDATE
  `);
  return authorizeLockedAdminActor({ actorUserId, users });
}

/**
 * Locks actor and target in a stable order, then evaluates the current rows.
 * Role/deactivation changes therefore cannot race an account-targeted write.
 */
export async function lockAndAuthorizeAdminActorTarget(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  targetUserId: string
) {
  const userIds = orderedAdminActorTargetIds(actorUserId, targetUserId);
  const users = userIds.length === 0
    ? []
    : await transaction.$queryRaw<LockedAdminTargetUser[]>(Prisma.sql`
        SELECT "id", "role", "deactivatedAt"
        FROM "User"
        WHERE "id" IN (${Prisma.join(userIds)})
        ORDER BY "id"
        FOR UPDATE
      `);

  return authorizeLockedAdminActorTarget({ actorUserId, targetUserId, users });
}
