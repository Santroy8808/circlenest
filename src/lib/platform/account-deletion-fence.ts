import {
  DestructiveActionKind,
  DestructiveActionStatus,
  Prisma
} from "@prisma/client";

export const ACCOUNT_DELETION_FENCE_STATUSES = [
  DestructiveActionStatus.CONFIRMED,
  DestructiveActionStatus.QUEUED,
  DestructiveActionStatus.RUNNING,
  DestructiveActionStatus.SUCCEEDED
] as const;

type LockedFenceUser = {
  id: string;
  deactivatedAt: Date | null;
};

export class AccountDeletionFenceConflictError extends Error {
  readonly userIds: readonly string[];

  constructor(userIds: readonly string[], message: string) {
    super(message);
    this.name = "AccountDeletionFenceConflictError";
    this.userIds = userIds;
  }
}

function normalizeUserIds(userIds: readonly string[]) {
  return [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))].sort();
}

export async function lockAccountDeletionFenceUsers(
  tx: Prisma.TransactionClient,
  userIds: readonly string[]
) {
  const normalizedUserIds = normalizeUserIds(userIds);
  if (normalizedUserIds.length === 0) return [];

  return tx.$queryRaw<LockedFenceUser[]>(Prisma.sql`
    SELECT "id", "deactivatedAt"
    FROM "User"
    WHERE "id" IN (${Prisma.join(normalizedUserIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

export async function assertAccountDeletionFenceOpen(
  tx: Prisma.TransactionClient,
  userIds: readonly string[],
  message = "This operation conflicts with an account that is deactivated or already queued for deletion."
) {
  const normalizedUserIds = normalizeUserIds(userIds);
  if (normalizedUserIds.length === 0) return;

  const users = await lockAccountDeletionFenceUsers(tx, normalizedUserIds);
  const foundUserIds = new Set(users.map((user) => user.id));
  const unavailableUserIds = normalizedUserIds.filter((userId) => !foundUserIds.has(userId));
  const deactivatedUserIds = users
    .filter((user) => user.deactivatedAt !== null)
    .map((user) => user.id);
  const deletionRequests = await tx.destructiveActionRequest.findMany({
    where: {
      kind: DestructiveActionKind.DELETE_ACCOUNT,
      targetType: "User",
      targetId: { in: normalizedUserIds },
      status: { in: [...ACCOUNT_DELETION_FENCE_STATUSES] }
    },
    select: { targetId: true }
  });
  const fencedUserIds = [...new Set([
    ...unavailableUserIds,
    ...deactivatedUserIds,
    ...deletionRequests.map((request) => request.targetId)
  ])].sort();

  if (fencedUserIds.length > 0) {
    throw new AccountDeletionFenceConflictError(fencedUserIds, message);
  }
}
