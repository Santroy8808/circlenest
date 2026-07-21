import {
  MembershipTier,
  MembershipUpgradeOfferStatus,
  Prisma
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { getOperationalTierContract } from "@/modules/membership-policy/membership-access";
import {
  allocateContributorMonthlyCreditsInTransaction,
  CONTRIBUTOR_MONTHLY_CREDITS
} from "@/modules/membership-policy/monthly-credits.service";
import {
  contributorEligibilityDispositionForTransition,
  evaluateOperationalMembershipTransitionExpectation,
  type OperationalMembershipSnapshot,
  type OperationalMembershipTransitionInput,
  type OperationalMembershipTransitionResult
} from "@/modules/membership-policy/operational-membership-transition";

const TRANSACTION_RETRIES = 3;

type LockedMembershipRow = {
  tier: MembershipTier;
  storageLimitBytes: bigint;
  platformCredits: number;
  updatedAt: Date;
};

export class OperationalMembershipTransitionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationalMembershipTransitionConflictError";
  }
}

function snapshotFromLockedMembership(
  membership: LockedMembershipRow | null
): OperationalMembershipSnapshot {
  return membership
    ? {
        exists: true,
        tier: membership.tier,
        storageLimitBytes: membership.storageLimitBytes,
        platformCredits: membership.platformCredits,
        updatedAt: membership.updatedAt
      }
    : {
        exists: false,
        tier: MembershipTier.FREE,
        storageLimitBytes: null,
        platformCredits: 0,
        updatedAt: null
      };
}

async function lockCurrentMembership(
  transaction: Prisma.TransactionClient,
  userId: string
) {
  const rows = await transaction.$queryRaw<LockedMembershipRow[]>(Prisma.sql`
    SELECT "tier", "storageLimitBytes", "platformCredits", "updatedAt"
    FROM "Membership"
    WHERE "userId" = ${userId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

function contributorReconciliationReason(input: OperationalMembershipTransitionInput) {
  if (input.reason?.trim()) return input.reason.trim();
  if (input.source === "CONTRIBUTOR_ACCEPTANCE") {
    return "Superseded by accepted Contributor membership.";
  }
  if (input.source === "STRIPE_SUBSCRIPTION") {
    return "Contributor eligibility reconciled with Stripe subscription status.";
  }
  if (input.source === "PRIVILEGED_PROVISIONING") {
    return "Contributor eligibility reconciled during privileged account provisioning.";
  }
  return "Contributor eligibility reconciled by an administrator membership correction.";
}

export async function transitionOperationalMembershipInTransaction(
  transaction: Prisma.TransactionClient,
  input: OperationalMembershipTransitionInput
): Promise<OperationalMembershipTransitionResult> {
  const now = input.now ?? new Date();
  const lockedMembership = await lockCurrentMembership(transaction, input.userId);
  const before = snapshotFromLockedMembership(lockedMembership);
  const expectation = evaluateOperationalMembershipTransitionExpectation({
    currentTier: before.tier,
    currentUpdatedAt: before.updatedAt,
    expectedCurrentTier: input.expectedCurrentTier,
    expectedCurrentUpdatedAt: input.expectedCurrentUpdatedAt
  });
  if (!expectation.allowed) {
    throw new OperationalMembershipTransitionConflictError(expectation.error);
  }

  const contract = getOperationalTierContract(input.targetTier);
  await transaction.membership.upsert({
    where: { userId: input.userId },
    update: {
      tier: input.targetTier,
      storageLimitBytes: BigInt(contract.quotas.personalStorageBytes)
    },
    create: {
      userId: input.userId,
      tier: input.targetTier,
      storageLimitBytes: BigInt(contract.quotas.personalStorageBytes)
    }
  });

  const reconciliationReason = contributorReconciliationReason(input);
  const revokedOffers = await transaction.membershipUpgradeOffer.updateMany({
    where: {
      userId: input.userId,
      targetTier: MembershipTier.CONTRIBUTOR,
      status: MembershipUpgradeOfferStatus.OFFERED
    },
    data: {
      status: MembershipUpgradeOfferStatus.REVOKED,
      revokedAt: now,
      revokedByUserId: input.actorUserId ?? null,
      revocationReason: reconciliationReason
    }
  });
  const terminatedAcceptedOffers = input.source === "CONTRIBUTOR_ACCEPTANCE"
    ? { count: 0 }
    : await transaction.membershipUpgradeOffer.updateMany({
        where: {
          userId: input.userId,
          targetTier: MembershipTier.CONTRIBUTOR,
          status: MembershipUpgradeOfferStatus.ACCEPTED,
          revokedAt: null
        },
        data: {
          revokedAt: now,
          revokedByUserId: input.actorUserId ?? null,
          revocationReason: reconciliationReason
        }
      });

  const disposition = contributorEligibilityDispositionForTransition(input.source);
  const deactivatedEligibility = await transaction.membershipTierUpgradeEligibility.updateMany({
    where: {
      userId: input.userId,
      tier: MembershipTier.CONTRIBUTOR,
      active: true
    },
    data: disposition === "CONSUMED"
      ? { active: false }
      : {
          active: false,
          revokedAt: now,
          revokedByUserId: input.actorUserId ?? null,
          revocationReason: reconciliationReason
        }
  });

  const monthlyCredits = input.targetTier === MembershipTier.CONTRIBUTOR
    ? await allocateContributorMonthlyCreditsInTransaction(transaction, {
        userId: input.userId,
        now,
        amount: CONTRIBUTOR_MONTHLY_CREDITS
      })
    : null;

  const current = await transaction.membership.findUniqueOrThrow({
    where: { userId: input.userId },
    select: {
      tier: true,
      storageLimitBytes: true,
      platformCredits: true,
      updatedAt: true
    }
  });

  return {
    before,
    after: {
      exists: true,
      tier: current.tier,
      storageLimitBytes: current.storageLimitBytes,
      platformCredits: current.platformCredits,
      updatedAt: current.updatedAt
    },
    tierChanged: before.tier !== current.tier,
    revokedContributorOfferCount: revokedOffers.count,
    terminatedAcceptedContributorOfferCount: terminatedAcceptedOffers.count,
    deactivatedContributorEligibilityCount: deactivatedEligibility.count,
    monthlyCredits
  };
}

export async function runSerializableOperationalMembershipTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
) {
  for (let attempt = 1; attempt <= TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === TRANSACTION_RETRIES) throw error;
    }
  }

  throw new Error("Operational membership transaction retry limit reached.");
}
