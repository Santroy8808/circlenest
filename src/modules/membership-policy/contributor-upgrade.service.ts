import {
  AuditSeverity,
  MembershipTier,
  MembershipUpgradeMode,
  MembershipUpgradeOfferStatus,
  Prisma
} from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { findAuditLogByOperationId, writeAuditLog } from "@/lib/platform/audit";
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

const MODULE_KEY = "contributor-upgrade";

export const grantContributorBetaOfferSchema = z.object({
  commandId: z.string().trim().min(8).max(160),
  targetUserId: z.string().trim().min(1),
  expiresAt: z.coerce.date().nullable().optional(),
  reason: z.string().trim().max(500).optional()
});

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

async function runSerializableTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
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

export async function getContributorUpgradeOfferForUser(
  userId: string,
  now = new Date()
): Promise<ContributorUpgradeOfferView | null> {
  const record = await prisma.membershipUpgradeOffer.findFirst({
    where: {
      userId,
      targetTier: MembershipTier.CONTRIBUTOR,
      status: {
        in: [MembershipUpgradeOfferStatus.OFFERED, MembershipUpgradeOfferStatus.ACCEPTED]
      }
    },
    include: {
      eligibility: true
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });

  if (!record) return null;

  if (record.status === MembershipUpgradeOfferStatus.OFFERED) {
    await expireContributorOfferIfNeeded(record, now);

    if (!isContributorEligibilityActive(record.eligibility, now)) return null;
  }

  return buildContributorUpgradeOfferView(record, now);
}

export async function getMembershipAccessForUser(userId: string, now = new Date()) {
  const [membership, record] = await Promise.all([
    prisma.membership.findUnique({
      where: { userId },
      select: { tier: true }
    }),
    prisma.membershipUpgradeOffer.findFirst({
      where: {
        userId,
        targetTier: MembershipTier.CONTRIBUTOR,
        status: {
          in: [MembershipUpgradeOfferStatus.OFFERED, MembershipUpgradeOfferStatus.ACCEPTED]
        }
      },
      include: { eligibility: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }]
    })
  ]);

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

  if (!target || target.deactivatedAt) {
    return { ok: false as const, error: "The target member was not found or is inactive." };
  }
  const targetAuthorization = evaluateAdminActorTarget({
    actorUserId: actor.id,
    actorRole: actor.role,
    targetUserId: target.id,
    targetRole: target.role
  });
  if (!targetAuthorization.allowed) {
    return { ok: false as const, error: "That account is protected from this administrator action." };
  }
  if ((target.membership?.tier ?? MembershipTier.FREE) !== MembershipTier.FREE) {
    return { ok: false as const, error: "Contributor beta offers can only be granted to Free members." };
  }

  const grant = await runSerializableTransaction(async (tx) => {
      const currentMembership = await tx.membership.findUnique({
        where: { userId: target.id },
        select: { tier: true }
      });
      if ((currentMembership?.tier ?? MembershipTier.FREE) !== MembershipTier.FREE) {
        throw new Error("TARGET_NOT_FREE");
      }

      const eligibility = await tx.membershipTierUpgradeEligibility.upsert({
        where: {
          userId_tier: {
            userId: target.id,
            tier: MembershipTier.CONTRIBUTOR
          }
        },
        create: {
          userId: target.id,
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
          userId: target.id,
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
          userId: target.id,
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
            userId: target.id,
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

export async function acceptContributorBetaOffer(userId: string, offerId: string) {
  const now = new Date();
  const contributorStorage = BigInt(
    getOperationalTierContract(MembershipTier.CONTRIBUTOR).quotas.personalStorageBytes
  );

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
        return {
          ok: true as const,
          idempotent: true,
          offer: buildContributorUpgradeOfferView(offer, now)
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
        const current = await tx.membershipUpgradeOffer.findUnique({ where: { id: offer.id } });
        if (current?.status === MembershipUpgradeOfferStatus.ACCEPTED) {
          return {
            ok: true as const,
            idempotent: true,
            offer: buildContributorUpgradeOfferView(current, now)
          };
        }
        return { ok: false as const, error: "Contributor offer changed before it could be accepted." };
      }

      await tx.membership.upsert({
        where: { userId },
        create: {
          userId,
          tier: MembershipTier.CONTRIBUTOR,
          storageLimitBytes: contributorStorage
        },
        update: {
          tier: MembershipTier.CONTRIBUTOR,
          storageLimitBytes: contributorStorage
        }
      });
      await tx.membershipTierUpgradeEligibility.update({
        where: { id: offer.eligibilityId },
        data: { active: false }
      });

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
            futurePriceCents: CONTRIBUTOR_FUTURE_MONTHLY_PRICE_CENTS
          } as Prisma.InputJsonObject
        },
        tx
      );
      return {
        ok: true as const,
        idempotent: false,
        offer: buildContributorUpgradeOfferView(accepted, now)
      };
  });

  if (result.ok && !result.idempotent) {
    await diagnostics.info(MODULE_KEY, "Contributor beta offer accepted.", { userId, offerId });
  }

  return result;
}

export async function revokeContributorBetaOffer(
  actorUserId: string,
  offerId: string,
  reason = "Contributor beta offer revoked by an administrator."
) {
  const actor = await getContributorGrantActor(actorUserId);
  if (!actor || actor.deactivatedAt || !isAdminRole(actor.role)) {
    return { ok: false as const, error: "Admin access required." };
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const offer = await tx.membershipUpgradeOffer.findUnique({
      where: { id: offerId },
      include: { user: { select: { role: true } } }
    });
    if (!offer || offer.targetTier !== MembershipTier.CONTRIBUTOR) {
      return { ok: false as const, error: "Contributor offer was not found." };
    }
    const targetAuthorization = evaluateAdminActorTarget({
      actorUserId: actor.id,
      actorRole: actor.role,
      targetUserId: offer.userId,
      targetRole: offer.user.role
    });
    if (!targetAuthorization.allowed) {
      return { ok: false as const, error: "That account is protected from this administrator action." };
    }
    if (offer.status === MembershipUpgradeOfferStatus.ACCEPTED) {
      return { ok: false as const, error: "An accepted membership must be changed through account management." };
    }
    if (offer.status === MembershipUpgradeOfferStatus.REVOKED) {
      return { ok: true as const, idempotent: true };
    }

    await tx.membershipUpgradeOffer.update({
      where: { id: offer.id },
      data: {
        status: MembershipUpgradeOfferStatus.REVOKED,
        revokedAt: now,
        revokedByUserId: actorUserId,
        revocationReason: reason
      }
    });
    await tx.membershipTierUpgradeEligibility.update({
      where: { id: offer.eligibilityId },
      data: {
        active: false,
        revokedAt: now,
        revokedByUserId: actorUserId,
        revocationReason: reason
      }
    });

    await writeAuditLog(
      {
        actorUserId,
        module: MODULE_KEY,
        action: "contributor.offer.revoked",
        targetType: "MembershipUpgradeOffer",
        targetId: offerId,
        severity: AuditSeverity.warning,
        metadata: { reason } as Prisma.InputJsonObject
      },
      tx
    );

    return { ok: true as const, idempotent: false };
  });

  return result;
}
