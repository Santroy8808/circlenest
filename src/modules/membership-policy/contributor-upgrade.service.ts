import {
  AuditSeverity,
  MembershipTier,
  MembershipUpgradeMode,
  MembershipUpgradeOfferStatus,
  Prisma,
  UserRole
} from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { findAuditLogByOperationId, writeAuditLog } from "@/lib/platform/audit";
import { createCommandFingerprint } from "@/lib/platform/command-fingerprint";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { evaluateAdminActorTarget, isAdminRole } from "@/lib/platform/roles";
import {
  buildContributorUpgradeOfferView,
  CONTRIBUTOR_BETA_CURRENT_PRICE_CENTS,
  CONTRIBUTOR_FUTURE_MONTHLY_PRICE_CENTS,
  evaluateContributorOfferAcceptance,
  isContributorEligibilityActive,
  toContributorOffer,
  type ContributorUpgradeOfferRecord,
  type ContributorUpgradeOfferView
} from "@/modules/membership-policy/contributor-upgrade";
import {
  getOperationalTierContract,
  resolveMembershipAccess
} from "@/modules/membership-policy/membership-access";
import {
  OperationalMembershipTransitionConflictError,
  transitionOperationalMembershipInTransaction
} from "@/modules/membership-policy/operational-membership-transition.service";
import { allocateContributorMonthlyCreditsInTransaction } from "@/modules/membership-policy/monthly-credits.service";

const MODULE_KEY = "contributor-upgrade";
const CONTRIBUTOR_RECONCILIATION_ACTION = "contributor.membership.reconciled";

export const grantContributorBetaOfferSchema = z.object({
  commandId: z.string().trim().min(8).max(160),
  targetUserId: z.string().trim().min(1),
  expiresAt: z.coerce.date().nullable().optional(),
  reason: z.string().trim().max(500).optional()
});

const DEFAULT_CONTRIBUTOR_REVOCATION_REASON =
  "Contributor beta offer revoked by an administrator.";

export const revokeContributorBetaOfferSchema = z.object({
  commandId: z.string().trim().min(8).max(160),
  targetUserId: z.string().trim().min(1),
  offerId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(500).optional()
});

export type ContributorOfferRevocationView = {
  offerId: string;
  status: "REVOKED";
  revokedAt: string;
  alreadyRevoked: boolean;
};

export function idempotentContributorAcceptanceNeedsReconciliation(input: {
  membershipTier: MembershipTier;
  storageLimitBytes: bigint;
  expectedStorageLimitBytes: bigint;
  eligibilityActive: boolean;
  offeredContributorOfferCount: number;
}) {
  return (
    input.membershipTier !== MembershipTier.CONTRIBUTOR ||
    input.storageLimitBytes !== input.expectedStorageLimitBytes ||
    input.eligibilityActive ||
    input.offeredContributorOfferCount > 0
  );
}

export function contributorAcceptanceReconciliationOperationId(input: {
  userId: string;
  offerId: string;
  membershipUpdatedAt: Date;
}) {
  const version = createHash("sha256")
    .update(JSON.stringify({
      userId: input.userId,
      offerId: input.offerId,
      membershipUpdatedAt: input.membershipUpdatedAt.toISOString()
    }))
    .digest("hex");
  return `contributor-acceptance-reconciliation:${version}`;
}

export function contributorGrantCommandFingerprint(input: {
  targetUserId: string;
  expiresAt: Date | null;
  reason?: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      targetUserId: input.targetUserId,
      expiresAt: input.expiresAt?.toISOString() ?? null,
      reason: input.reason ?? null
    }))
    .digest("hex");
}

export function contributorRevokeCommandFingerprint(input: {
  targetUserId: string;
  offerId: string;
  reason: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      targetUserId: input.targetUserId,
      offerId: input.offerId,
      reason: input.reason
    }))
    .digest("hex");
}

export function classifyContributorRevokeCommand(input: {
  audit: {
    actorUserId: string | null;
    action: string;
    metadata: Prisma.JsonValue;
  } | null;
  actorUserId: string;
  fingerprint: string;
}) {
  if (!input.audit) return { state: "new" as const };
  const metadata = input.audit.metadata as Prisma.JsonObject | null;
  const result = metadata?.result as Prisma.JsonObject | null;
  const revocation =
    result &&
    typeof result.offerId === "string" &&
    result.status === "REVOKED" &&
    typeof result.revokedAt === "string" &&
    typeof result.alreadyRevoked === "boolean"
      ? {
          offerId: result.offerId,
          status: "REVOKED" as const,
          revokedAt: result.revokedAt,
          alreadyRevoked: result.alreadyRevoked
        }
      : null;
  if (
    input.audit.actorUserId === input.actorUserId &&
    input.audit.action === "contributor.offer.revoked" &&
    metadata?.commandFingerprint === input.fingerprint &&
    revocation
  ) {
    return { state: "replay" as const, revocation };
  }
  return { state: "conflict" as const };
}

export function classifyContributorGrantCommand(input: {
  audit: {
    actorUserId: string | null;
    action: string;
    metadata: Prisma.JsonValue;
  } | null;
  actorUserId: string;
  fingerprint: string;
}) {
  if (!input.audit) return { state: "new" as const };
  const metadata = input.audit.metadata as Prisma.JsonObject | null;
  const result = metadata?.result as Prisma.JsonObject | null;
  const offer =
    result &&
    typeof result.id === "string" &&
    (result.status === "OFFERED" || result.status === "ACCEPTED") &&
    result.currentPriceCents === CONTRIBUTOR_BETA_CURRENT_PRICE_CENTS &&
    result.futureMonthlyPriceCents === CONTRIBUTOR_FUTURE_MONTHLY_PRICE_CENTS &&
    typeof result.message === "string" &&
    (result.expiresAt === null || typeof result.expiresAt === "string") &&
    typeof result.canAccept === "boolean"
      ? {
          id: result.id,
          status: result.status,
          currentPriceCents: CONTRIBUTOR_BETA_CURRENT_PRICE_CENTS,
          futureMonthlyPriceCents: CONTRIBUTOR_FUTURE_MONTHLY_PRICE_CENTS,
          message: result.message,
          expiresAt: result.expiresAt,
          canAccept: result.canAccept
        } satisfies ContributorUpgradeOfferView
      : null;
  if (
    input.audit.actorUserId === input.actorUserId &&
    input.audit.action === "contributor.offer.granted" &&
    metadata?.commandFingerprint === input.fingerprint &&
    typeof metadata?.offerId === "string" &&
    offer
  ) {
    return { state: "replay" as const, offer };
  }
  return { state: "conflict" as const };
}

async function resolveContributorGrantReplay(input: {
  commandId: string;
  actorUserId: string;
  fingerprint: string;
}) {
  const audit = await findAuditLogByOperationId(input.commandId);
  const command = classifyContributorGrantCommand({
    audit,
    actorUserId: input.actorUserId,
    fingerprint: input.fingerprint
  });
  if (command.state === "new") return null;
  if (command.state === "conflict") {
    return { ok: false as const, error: "That administrator command id has already been used." };
  }

  return {
    ok: true as const,
    commandId: input.commandId,
    auditLogId: audit!.id,
    replayed: true as const,
    offer: command.offer
  };
}

async function resolveContributorRevokeReplay(input: {
  commandId: string;
  actorUserId: string;
  fingerprint: string;
}) {
  const audit = await findAuditLogByOperationId(input.commandId);
  const command = classifyContributorRevokeCommand({
    audit,
    actorUserId: input.actorUserId,
    fingerprint: input.fingerprint
  });
  if (command.state === "new") return null;
  if (command.state === "conflict") {
    return { ok: false as const, error: "That administrator command id has already been used." };
  }

  return {
    ok: true as const,
    commandId: input.commandId,
    auditLogId: audit!.id,
    replayed: true as const,
    revocation: command.revocation
  };
}

function decisionError(reason: "NOT_TARGET" | "NOT_FREE" | "NOT_ELIGIBLE" | "EXPIRED" | "REVOKED") {
  if (reason === "NOT_TARGET") return "This offer belongs to a different account.";
  if (reason === "NOT_FREE") return "Only a Free member can accept this Contributor offer.";
  if (reason === "EXPIRED") return "This Contributor offer has expired.";
  if (reason === "REVOKED") return "This Contributor offer was revoked.";
  return "This account is no longer eligible for the Contributor offer.";
}

async function getContributorGrantActor(actorUserId: string) {
  return prisma.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, role: true, deactivatedAt: true }
  });
}

type ContributorAdminUserSnapshot = {
  id: string;
  role: UserRole;
  deactivatedAt: Date | null;
};

export function evaluateContributorAdminSnapshots(input: {
  actor: ContributorAdminUserSnapshot | null;
  target: ContributorAdminUserSnapshot | null;
}) {
  if (!input.actor || input.actor.deactivatedAt || !isAdminRole(input.actor.role)) {
    return { allowed: false as const, error: "Admin access required." };
  }
  if (!input.target || input.target.deactivatedAt) {
    return { allowed: false as const, error: "The target member was not found or is inactive." };
  }
  const authorization = evaluateAdminActorTarget({
    actorUserId: input.actor.id,
    actorRole: input.actor.role,
    targetUserId: input.target.id,
    targetRole: input.target.role
  });
  if (!authorization.allowed) {
    return {
      allowed: false as const,
      error: "That account is protected from this administrator action."
    };
  }
  return { allowed: true as const, actor: input.actor, target: input.target };
}

async function lockContributorAdminUsers(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  targetUserId: string
) {
  const userIds = [...new Set([actorUserId, targetUserId])].sort();
  const users = await tx.$queryRaw<ContributorAdminUserSnapshot[]>(Prisma.sql`
    SELECT "id", "role", "deactivatedAt"
    FROM "User"
    WHERE "id" IN (${Prisma.join(userIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
  return {
    actor: users.find((user) => user.id === actorUserId) ?? null,
    target: users.find((user) => user.id === targetUserId) ?? null
  };
}

export function evaluateContributorRevocationGeneration(input: {
  requestedOfferId: string;
  currentOfferId: string | null;
}) {
  return input.currentOfferId === input.requestedOfferId
    ? { allowed: true as const }
    : {
        allowed: false as const,
        error: "This Contributor offer has been superseded by a newer offer. Refresh the account before revoking."
      };
}

async function runSerializableTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const retryable =
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") ||
        error instanceof OperationalMembershipTransitionConflictError;
      if (!retryable || attempt === 2) throw error;
    }
  }

  throw new Error("Serializable transaction retry limit reached.");
}

async function expireContributorOfferIfNeeded(record: ContributorUpgradeOfferRecord, now: Date) {
  if (
    record.status === MembershipUpgradeOfferStatus.OFFERED &&
    record.expiresAt &&
    record.expiresAt.getTime() <= now.getTime()
  ) {
    await prisma.membershipUpgradeOffer.updateMany({
      where: {
        id: record.id,
        status: MembershipUpgradeOfferStatus.OFFERED
      },
      data: {
        status: MembershipUpgradeOfferStatus.EXPIRED
      }
    });
  }
}

export function visibleContributorOfferStatusForPersistedTier(tier?: MembershipTier | null) {
  return tier === MembershipTier.CONTRIBUTOR
    ? MembershipUpgradeOfferStatus.ACCEPTED
    : MembershipUpgradeOfferStatus.OFFERED;
}

export async function getContributorUpgradeOfferForUser(
  userId: string,
  now = new Date()
): Promise<ContributorUpgradeOfferView | null> {
  const membership = await prisma.membership.findUnique({
    where: { userId },
    select: { tier: true }
  });
  const record = await prisma.membershipUpgradeOffer.findFirst({
    where: {
      userId,
      targetTier: MembershipTier.CONTRIBUTOR,
      status: visibleContributorOfferStatusForPersistedTier(membership?.tier),
      revokedAt: null
    },
    include: {
      eligibility: true
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });

  if (!record) return null;

  if (record.status === MembershipUpgradeOfferStatus.OFFERED) {
    await expireContributorOfferIfNeeded(record, now);

    if (!isContributorEligibilityActive(record.eligibility, now)) return null;
  }

  return buildContributorUpgradeOfferView(record, now);
}

export async function getContributorUpgradeOfferForAdmin(
  actorUserId: string,
  targetUserId: string,
  now = new Date()
) {
  const [actor, target] = await Promise.all([
    getContributorGrantActor(actorUserId),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, deactivatedAt: true }
    })
  ]);
  const authorization = evaluateContributorAdminSnapshots({ actor, target });
  if (!authorization.allowed) return { ok: false as const, error: authorization.error };

  return {
    ok: true as const,
    contributorOffer: await getContributorUpgradeOfferForUser(targetUserId, now)
  };
}

export async function getMembershipAccessForUser(userId: string, now = new Date()) {
  const membership = await prisma.membership.findUnique({
    where: { userId },
    select: { tier: true }
  });
  const record = await prisma.membershipUpgradeOffer.findFirst({
    where: {
      userId,
      targetTier: MembershipTier.CONTRIBUTOR,
      status: visibleContributorOfferStatusForPersistedTier(membership?.tier),
      revokedAt: null
    },
    include: { eligibility: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });

  const canonicalOffer =
    record &&
    (record.status === MembershipUpgradeOfferStatus.ACCEPTED ||
      isContributorEligibilityActive(record.eligibility, now))
      ? toContributorOffer(record)
      : null;

  return resolveMembershipAccess({
    persistedTier: membership?.tier,
    contributorOffer: canonicalOffer,
    now
  });
}

export async function grantContributorBetaOffer(actorUserId: string, input: unknown) {
  const actor = await getContributorGrantActor(actorUserId);
  if (!actor || actor.deactivatedAt || !isAdminRole(actor.role)) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = grantContributorBetaOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid Contributor offer." };
  }

  const now = new Date();
  const expiresAt = parsed.data.expiresAt ?? null;
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return { ok: false as const, error: "Contributor offer expiration must be in the future." };
  }

  const commandFingerprint = contributorGrantCommandFingerprint({
    targetUserId: parsed.data.targetUserId,
    expiresAt,
    reason: parsed.data.reason
  });
  const replay = await resolveContributorGrantReplay({
    commandId: parsed.data.commandId,
    actorUserId,
    fingerprint: commandFingerprint
  });
  if (replay) return replay;

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.targetUserId },
    select: {
      id: true,
      role: true,
      deactivatedAt: true,
      membership: { select: { tier: true } }
    }
  });

  const targetAuthorization = evaluateContributorAdminSnapshots({ actor, target });
  if (!targetAuthorization.allowed) {
    return { ok: false as const, error: targetAuthorization.error };
  }
  if ((target?.membership?.tier ?? MembershipTier.FREE) !== MembershipTier.FREE) {
    return { ok: false as const, error: "Contributor beta offers can only be granted to Free members." };
  }

  const grant = await runSerializableTransaction(async (tx) => {
      const lockedUsers = await lockContributorAdminUsers(
        tx,
        actorUserId,
        parsed.data.targetUserId
      );
      const currentAuthorization = evaluateContributorAdminSnapshots(lockedUsers);
      if (!currentAuthorization.allowed) {
        return { ok: false as const, error: currentAuthorization.error };
      }

      const currentMembership = await tx.membership.findUnique({
        where: { userId: currentAuthorization.target.id },
        select: { tier: true }
      });
      if ((currentMembership?.tier ?? MembershipTier.FREE) !== MembershipTier.FREE) {
        throw new Error("TARGET_NOT_FREE");
      }

      const eligibility = await tx.membershipTierUpgradeEligibility.upsert({
        where: {
          userId_tier: {
            userId: currentAuthorization.target.id,
            tier: MembershipTier.CONTRIBUTOR
          }
        },
        create: {
          userId: currentAuthorization.target.id,
          tier: MembershipTier.CONTRIBUTOR,
          reason: parsed.data.reason || "Contributor beta eligibility granted by an administrator.",
          expiresAt,
          createdByUserId: actorUserId
        },
        update: {
          active: true,
          reason: parsed.data.reason || "Contributor beta eligibility granted by an administrator.",
          expiresAt,
          createdByUserId: actorUserId,
          revokedAt: null,
          revokedByUserId: null,
          revocationReason: null
        }
      });

      await tx.membershipUpgradeOffer.updateMany({
        where: {
          userId: currentAuthorization.target.id,
          targetTier: MembershipTier.CONTRIBUTOR,
          status: MembershipUpgradeOfferStatus.OFFERED
        },
        data: {
          status: MembershipUpgradeOfferStatus.REVOKED,
          revokedAt: now,
          revokedByUserId: actorUserId,
          revocationReason: "Replaced by a newer Contributor beta offer."
        }
      });

      const offer = await tx.membershipUpgradeOffer.create({
        data: {
          userId: currentAuthorization.target.id,
          eligibilityId: eligibility.id,
          targetTier: MembershipTier.CONTRIBUTOR,
          status: MembershipUpgradeOfferStatus.OFFERED,
          upgradeMode: MembershipUpgradeMode.BETA_FREE,
          currentPriceCents: CONTRIBUTOR_BETA_CURRENT_PRICE_CENTS,
          futurePriceCents: CONTRIBUTOR_FUTURE_MONTHLY_PRICE_CENTS,
          validFrom: now,
          expiresAt,
          createdByUserId: actorUserId,
          idempotencyKey: parsed.data.commandId
        }
      });

      const offerView = buildContributorUpgradeOfferView(offer, now);
      if (!offerView) throw new Error("CONTRIBUTOR_OFFER_VIEW_INVALID");

      const audit = await writeAuditLog(
        {
          operationId: parsed.data.commandId,
          requestId: parsed.data.commandId,
          actorUserId,
          module: MODULE_KEY,
          action: "contributor.offer.granted",
          targetType: "MembershipUpgradeOffer",
          targetId: offer.id,
          severity: AuditSeverity.warning,
          metadata: {
            userId: currentAuthorization.target.id,
            offerId: offer.id,
            commandFingerprint,
            result: offerView,
            currentPriceCents: CONTRIBUTOR_BETA_CURRENT_PRICE_CENTS,
            futurePriceCents: CONTRIBUTOR_FUTURE_MONTHLY_PRICE_CENTS,
            expiresAt: expiresAt?.toISOString() ?? null
          } as Prisma.InputJsonObject
        },
        tx
      );

      return { offerView, auditLogId: audit.id };
  }).catch(async (error: unknown) => {
    if (error instanceof Error && error.message === "TARGET_NOT_FREE") return null;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentReplay = await resolveContributorGrantReplay({
        commandId: parsed.data.commandId,
        actorUserId,
        fingerprint: commandFingerprint
      });
      if (concurrentReplay) return concurrentReplay;
    }
    throw error;
  });

  if (!grant) return { ok: false as const, error: "The target account is no longer Free." };

  if ("ok" in grant) return grant;

  return {
    ok: true as const,
    commandId: parsed.data.commandId,
    auditLogId: grant.auditLogId,
    replayed: false as const,
    offer: grant.offerView
  };
}

async function completeIdempotentContributorAcceptance(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    offerId: string;
    eligibility: { id: string; active: boolean; updatedAt: Date };
    now: Date;
  }
) {
  const [membership, offeredOffers] = await Promise.all([
    tx.membership.findUnique({
      where: { userId: input.userId },
      select: {
        tier: true,
        storageLimitBytes: true,
        platformCredits: true,
        updatedAt: true
      }
    }),
    tx.membershipUpgradeOffer.findMany({
      where: {
        userId: input.userId,
        targetTier: MembershipTier.CONTRIBUTOR,
        status: MembershipUpgradeOfferStatus.OFFERED
      },
      select: { id: true, updatedAt: true },
      orderBy: { id: "asc" }
    })
  ]);
  if (!membership || membership.tier !== MembershipTier.CONTRIBUTOR) {
    throw new OperationalMembershipTransitionConflictError(
      "Contributor membership changed before acceptance could be confirmed."
    );
  }

  const expectedStorageLimitBytes = BigInt(
    getOperationalTierContract(MembershipTier.CONTRIBUTOR).quotas.personalStorageBytes
  );
  const needsReconciliation = idempotentContributorAcceptanceNeedsReconciliation({
    membershipTier: membership.tier,
    storageLimitBytes: membership.storageLimitBytes,
    expectedStorageLimitBytes,
    eligibilityActive: input.eligibility.active,
    offeredContributorOfferCount: offeredOffers.length
  });
  if (!needsReconciliation) {
    return {
      monthlyCredits: await allocateContributorMonthlyCreditsInTransaction(tx, {
        userId: input.userId,
        now: input.now
      }),
      reconciliationAuditLogId: null
    };
  }

  const transition = await transitionOperationalMembershipInTransaction(tx, {
    userId: input.userId,
    targetTier: MembershipTier.CONTRIBUTOR,
    source: "CONTRIBUTOR_ACCEPTANCE",
    actorUserId: input.userId,
    now: input.now,
    reason: "Contributor acceptance invariant reconciled.",
    expectedCurrentTier: MembershipTier.CONTRIBUTOR,
    expectedCurrentUpdatedAt: membership.updatedAt
  });
  const operationId = contributorAcceptanceReconciliationOperationId({
    userId: input.userId,
    offerId: input.offerId,
    membershipUpdatedAt: membership.updatedAt
  });
  const commandFingerprint = createCommandFingerprint({
    actorUserId: input.userId,
    action: CONTRIBUTOR_RECONCILIATION_ACTION,
    target: { type: "MembershipUpgradeOffer", id: input.offerId },
    payload: {
      eligibilityId: input.eligibility.id,
      eligibilityActive: input.eligibility.active,
      eligibilityUpdatedAt: input.eligibility.updatedAt.toISOString(),
      offeredOffers: offeredOffers.map((offer) => ({
        id: offer.id,
        updatedAt: offer.updatedAt.toISOString()
      })),
      before: {
        tier: transition.before.tier,
        storageLimitBytes: transition.before.storageLimitBytes?.toString() ?? null,
        platformCredits: transition.before.platformCredits,
        updatedAt: transition.before.updatedAt?.toISOString() ?? null
      },
      after: {
        tier: transition.after.tier,
        storageLimitBytes: transition.after.storageLimitBytes.toString(),
        platformCredits: transition.after.platformCredits,
        updatedAt: transition.after.updatedAt.toISOString()
      },
      revokedContributorOfferCount: transition.revokedContributorOfferCount,
      terminatedAcceptedContributorOfferCount: transition.terminatedAcceptedContributorOfferCount,
      deactivatedContributorEligibilityCount: transition.deactivatedContributorEligibilityCount,
      monthlyCreditLedgerEntryId: transition.monthlyCredits?.ledgerEntryId ?? null
    }
  });
  const audit = await writeAuditLog({
    operationId,
    requestId: operationId,
    actorUserId: input.userId,
    module: MODULE_KEY,
    action: CONTRIBUTOR_RECONCILIATION_ACTION,
    targetType: "MembershipUpgradeOffer",
    targetId: input.offerId,
    severity: AuditSeverity.warning,
    before: {
      tier: transition.before.tier,
      storageLimitBytes: transition.before.storageLimitBytes?.toString() ?? null,
      platformCredits: transition.before.platformCredits,
      updatedAt: transition.before.updatedAt?.toISOString() ?? null,
      eligibilityActive: input.eligibility.active,
      offeredContributorOfferCount: offeredOffers.length
    },
    after: {
      tier: transition.after.tier,
      storageLimitBytes: transition.after.storageLimitBytes.toString(),
      platformCredits: transition.after.platformCredits,
      updatedAt: transition.after.updatedAt.toISOString(),
      eligibilityActive: false,
      offeredContributorOfferCount: 0
    },
    metadata: {
      commandFingerprint,
      eligibilityId: input.eligibility.id,
      revokedContributorOfferCount: transition.revokedContributorOfferCount,
      terminatedAcceptedContributorOfferCount: transition.terminatedAcceptedContributorOfferCount,
      deactivatedContributorEligibilityCount: transition.deactivatedContributorEligibilityCount,
      monthlyCreditLedgerEntryId: transition.monthlyCredits?.ledgerEntryId ?? null,
      monthlyCreditPeriod: transition.monthlyCredits?.periodKey ?? null,
      monthlyCreditAmount: transition.monthlyCredits?.amount ?? null
    }
  }, tx);

  return {
    monthlyCredits: transition.monthlyCredits!,
    reconciliationAuditLogId: audit.id
  };
}

export async function acceptContributorBetaOffer(userId: string, offerId: string) {
  const now = new Date();

  const result = await runSerializableTransaction(async (tx) => {
      const offer = await tx.membershipUpgradeOffer.findUnique({
        where: { id: offerId },
        include: { eligibility: true }
      });

      if (!offer) return { ok: false as const, error: "Contributor offer was not found." };

      const membership = await tx.membership.findUnique({
        where: { userId },
        select: { tier: true }
      });
      const persistedTier = membership?.tier ?? MembershipTier.FREE;
      const decision = evaluateContributorOfferAcceptance({
        actorUserId: userId,
        persistedTier,
        offer,
        eligibility: offer.eligibility,
        now
      });

      if (!decision.allowed) {
        if (
          decision.reason === "EXPIRED" &&
          offer.status === MembershipUpgradeOfferStatus.OFFERED
        ) {
          await tx.membershipUpgradeOffer.updateMany({
            where: { id: offer.id, status: MembershipUpgradeOfferStatus.OFFERED },
            data: { status: MembershipUpgradeOfferStatus.EXPIRED }
          });
        }
        return { ok: false as const, error: decisionError(decision.reason) };
      }

      if (decision.idempotent) {
        const completion = await completeIdempotentContributorAcceptance(tx, {
          userId,
          offerId: offer.id,
          eligibility: offer.eligibility,
          now
        });
        return {
          ok: true as const,
          idempotent: true,
          offer: buildContributorUpgradeOfferView(offer, now),
          monthlyCredits: completion.monthlyCredits
        };
      }

      const claimed = await tx.membershipUpgradeOffer.updateMany({
        where: {
          id: offer.id,
          userId,
          targetTier: MembershipTier.CONTRIBUTOR,
          status: MembershipUpgradeOfferStatus.OFFERED,
          revokedAt: null,
          validFrom: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
        },
        data: {
          status: MembershipUpgradeOfferStatus.ACCEPTED,
          acceptedAt: now
        }
      });

      if (claimed.count !== 1) {
        const current = await tx.membershipUpgradeOffer.findUnique({
          where: { id: offer.id },
          include: { eligibility: true }
        });
        if (current?.status === MembershipUpgradeOfferStatus.ACCEPTED) {
          const completion = await completeIdempotentContributorAcceptance(tx, {
            userId,
            offerId: current.id,
            eligibility: current.eligibility,
            now
          });
          return {
            ok: true as const,
            idempotent: true,
            offer: buildContributorUpgradeOfferView(current, now),
            monthlyCredits: completion.monthlyCredits
          };
        }
        return { ok: false as const, error: "Contributor offer changed before it could be accepted." };
      }

      const membershipTransition = await transitionOperationalMembershipInTransaction(tx, {
        userId,
        targetTier: MembershipTier.CONTRIBUTOR,
        source: "CONTRIBUTOR_ACCEPTANCE",
        actorUserId: userId,
        now,
        reason: "Contributor beta offer accepted.",
        expectedCurrentTier: MembershipTier.FREE
      });
      const monthlyCredits = membershipTransition.monthlyCredits!;

      const accepted = await tx.membershipUpgradeOffer.findUniqueOrThrow({ where: { id: offer.id } });
      await writeAuditLog(
        {
          actorUserId: userId,
          module: MODULE_KEY,
          action: "contributor.offer.accepted",
          targetType: "MembershipUpgradeOffer",
          targetId: offerId,
          severity: AuditSeverity.info,
          metadata: {
            tier: MembershipTier.CONTRIBUTOR,
            currentPriceCents: CONTRIBUTOR_BETA_CURRENT_PRICE_CENTS,
            futurePriceCents: CONTRIBUTOR_FUTURE_MONTHLY_PRICE_CENTS,
            monthlyCreditLedgerEntryId: monthlyCredits.ledgerEntryId,
            monthlyCreditAmount: monthlyCredits.amount,
            monthlyCreditPeriod: monthlyCredits.periodKey,
            revokedContributorOfferCount: membershipTransition.revokedContributorOfferCount,
            terminatedAcceptedContributorOfferCount: membershipTransition.terminatedAcceptedContributorOfferCount,
            deactivatedContributorEligibilityCount: membershipTransition.deactivatedContributorEligibilityCount
          } as Prisma.InputJsonObject
        },
        tx
      );
      return {
        ok: true as const,
        idempotent: false,
        offer: buildContributorUpgradeOfferView(accepted, now),
        monthlyCredits
      };
  });

  if (result.ok && !result.idempotent) {
    await diagnostics.info(MODULE_KEY, "Contributor beta offer accepted.", { userId, offerId });
  }

  return result;
}

export async function revokeContributorBetaOffer(actorUserId: string, input: unknown) {
  const actor = await getContributorGrantActor(actorUserId);
  if (!actor || actor.deactivatedAt || !isAdminRole(actor.role)) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = revokeContributorBetaOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid Contributor revocation." };
  }

  const reason = parsed.data.reason ?? DEFAULT_CONTRIBUTOR_REVOCATION_REASON;
  const commandFingerprint = contributorRevokeCommandFingerprint({
    targetUserId: parsed.data.targetUserId,
    offerId: parsed.data.offerId,
    reason
  });
  const replay = await resolveContributorRevokeReplay({
    commandId: parsed.data.commandId,
    actorUserId,
    fingerprint: commandFingerprint
  });
  if (replay) return replay;

  const now = new Date();
  const result = await runSerializableTransaction(async (tx) => {
    const lockedUsers = await lockContributorAdminUsers(
      tx,
      actorUserId,
      parsed.data.targetUserId
    );
    const currentAuthorization = evaluateContributorAdminSnapshots(lockedUsers);
    if (!currentAuthorization.allowed) {
      return { ok: false as const, error: currentAuthorization.error };
    }

    const offer = await tx.membershipUpgradeOffer.findUnique({
      where: { id: parsed.data.offerId },
      include: { user: { select: { role: true } } }
    });
    if (!offer || offer.targetTier !== MembershipTier.CONTRIBUTOR) {
      return { ok: false as const, error: "Contributor offer was not found." };
    }
    if (offer.userId !== parsed.data.targetUserId) {
      return { ok: false as const, error: "This Contributor offer belongs to a different account." };
    }
    if (
      offer.userId !== currentAuthorization.target.id ||
      offer.user.role !== currentAuthorization.target.role
    ) {
      return { ok: false as const, error: "That account is protected from this administrator action." };
    }
    if (offer.status === MembershipUpgradeOfferStatus.ACCEPTED) {
      return { ok: false as const, error: "An accepted membership must be changed through account management." };
    }

    const currentOffer = await tx.membershipUpgradeOffer.findFirst({
      where: { eligibilityId: offer.eligibilityId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true }
    });
    const generation = evaluateContributorRevocationGeneration({
      requestedOfferId: offer.id,
      currentOfferId: currentOffer?.id ?? null
    });
    if (!generation.allowed) {
      return { ok: false as const, error: generation.error };
    }

    const alreadyRevoked = offer.status === MembershipUpgradeOfferStatus.REVOKED;
    const revokedAt = offer.revokedAt ?? now;
    if (!alreadyRevoked) {
      await tx.membershipUpgradeOffer.update({
        where: { id: offer.id },
        data: {
          status: MembershipUpgradeOfferStatus.REVOKED,
          revokedAt,
          revokedByUserId: actorUserId,
          revocationReason: reason
        }
      });
      await tx.membershipTierUpgradeEligibility.update({
        where: { id: offer.eligibilityId },
        data: {
          active: false,
          revokedAt,
          revokedByUserId: actorUserId,
          revocationReason: reason
        }
      });
    }

    const revocation = {
      offerId: offer.id,
      status: "REVOKED" as const,
      revokedAt: revokedAt.toISOString(),
      alreadyRevoked
    } satisfies ContributorOfferRevocationView;
    const audit = await writeAuditLog(
      {
        operationId: parsed.data.commandId,
        requestId: parsed.data.commandId,
        actorUserId,
        module: MODULE_KEY,
        action: "contributor.offer.revoked",
        targetType: "MembershipUpgradeOffer",
        targetId: offer.id,
        severity: AuditSeverity.warning,
        metadata: {
          reason,
          commandFingerprint,
          result: revocation
        } as Prisma.InputJsonObject
      },
      tx
    );

    return {
      ok: true as const,
      commandId: parsed.data.commandId,
      auditLogId: audit.id,
      replayed: false as const,
      revocation
    };
  }).catch(async (error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentReplay = await resolveContributorRevokeReplay({
        commandId: parsed.data.commandId,
        actorUserId,
        fingerprint: commandFingerprint
      });
      if (concurrentReplay) return concurrentReplay;
    }
    throw error;
  });

  return result;
}
