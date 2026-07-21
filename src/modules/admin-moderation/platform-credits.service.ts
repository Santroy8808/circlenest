import { AuditSeverity, PlatformCreditEntryType, Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { evaluateAdminActorTarget, isAdminRole } from "@/lib/platform/roles";

const MODULE_KEY = "admin-platform-credits";

export const platformCreditAdjustmentSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  userIdentifier: z.string().trim().min(1).max(160),
  amount: z.coerce.number().int().min(-100000).max(100000).refine((value) => value !== 0, "Credit adjustment cannot be zero."),
  reason: z.string().trim().min(5).max(500),
  confirmation: z.string().trim().min(1).max(180)
});

export function platformCreditAdjustmentConfirmation(username: string, amount: number) {
  return `ADJUST ${username} ${amount > 0 ? "+" : ""}${amount}`;
}

async function isAdminUser(userId?: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return isAdminRole(user?.role);
}

function normalizeIdentifier(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export async function findCreditAccount(identifier: string) {
  const normalized = normalizeIdentifier(identifier);

  if (!normalized) return null;

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalized }, { username: normalized }]
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      profile: {
        select: {
          displayName: true
        }
      },
      membership: {
        select: {
          tier: true,
          platformCredits: true
        }
      }
    }
  });

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    displayName: user.profile?.displayName ?? user.username,
    tier: user.membership?.tier ?? "FREE",
    platformCredits: user.membership?.platformCredits ?? 0
  };
}

export function wouldPlatformCreditAdjustmentBeNegative(balance: number, amount: number) {
  return balance + amount < 0;
}

export async function getPlatformCreditsAdminView() {
  const recentLedger = await prisma.adCreditLedgerEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      user: {
        select: {
          email: true,
          username: true,
          profile: {
            select: {
              displayName: true
            }
          }
        }
      }
    }
  });

  return {
    recentLedger: recentLedger.map((entry) => ({
      id: entry.id,
      userLabel: entry.user.profile?.displayName ?? entry.user.username ?? entry.user.email,
      amount: entry.amount,
      reason: entry.reason,
      sourceType: entry.sourceType,
      idempotencyKey: entry.idempotencyKey,
      balanceAfter: entry.balanceAfter,
      createdAt: entry.createdAt.toISOString()
    }))
  };
}

export async function adjustPlatformCredits(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = platformCreditAdjustmentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid credit adjustment." };
  }

  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorUserId }, select: { id: true, role: true, deactivatedAt: true } }),
    findCreditAccount(parsed.data.userIdentifier)
  ]);

  if (!target) {
    return { ok: false as const, error: "User was not found." };
  }
  if (!actor || actor.deactivatedAt || !isAdminRole(actor.role)) {
    return { ok: false as const, error: "Admin access required." };
  }
  const authorization = evaluateAdminActorTarget({
    actorUserId: actor.id,
    actorRole: actor.role,
    targetUserId: target.id,
    targetRole: target.role
  });
  if (!authorization.allowed) {
    return { ok: false as const, error: "That account is protected from this administrator action." };
  }
  const expectedConfirmation = platformCreditAdjustmentConfirmation(target.username, parsed.data.amount);
  if (parsed.data.confirmation !== expectedConfirmation) {
    return {
      ok: false as const,
      error: `Type ${expectedConfirmation} exactly to confirm this financial adjustment.`
    };
  }

  const ledgerReason = `Admin platform credit adjustment: ${parsed.data.reason}`;
  const replayResult = async () => {
    const existing = await prisma.adCreditLedgerEntry.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey } });
    if (!existing) return null;
    if (
      existing.userId !== target.id ||
      existing.actorUserId !== actorUserId ||
      existing.amount !== parsed.data.amount ||
      existing.reason !== ledgerReason
    ) {
      return { ok: false as const, error: "That credit idempotency key has already been used for another adjustment." };
    }
    return {
      ok: true as const,
      account: {
        ...target,
        platformCredits: existing.balanceAfter ?? target.platformCredits
      },
      ledgerEntryId: existing.id,
      replayed: true as const
    };
  };

  const replay = await replayResult();
  if (replay) return replay;

  let updated: { tier: typeof target.tier; platformCredits: number; ledgerEntryId: string };
  try {
    updated = await prisma.$transaction(async (tx) => {
      if (parsed.data.amount < 0) {
        const changed = await tx.membership.updateMany({
          where: {
            userId: target.id,
            platformCredits: { gte: -parsed.data.amount }
          },
          data: { platformCredits: { increment: parsed.data.amount } }
        });
        if (changed.count !== 1) {
          throw new Error("INSUFFICIENT_PLATFORM_CREDITS");
        }
      } else {
        await tx.membership.upsert({
          where: { userId: target.id },
          update: { platformCredits: { increment: parsed.data.amount } },
          create: { userId: target.id, platformCredits: parsed.data.amount }
        });
      }

      const membership = await tx.membership.findUniqueOrThrow({
        where: { userId: target.id },
        select: { tier: true, platformCredits: true }
      });
      const balanceBefore = membership.platformCredits - parsed.data.amount;
      const ledgerEntry = await tx.adCreditLedgerEntry.create({
        data: {
          idempotencyKey: parsed.data.idempotencyKey,
          userId: target.id,
          accountReference: target.username,
          entryType: PlatformCreditEntryType.ADJUSTMENT,
          amount: parsed.data.amount,
          balanceAfter: membership.platformCredits,
          reason: ledgerReason,
          sourceType: "AdminCreditAdjustment",
          sourceId: parsed.data.idempotencyKey,
          actorUserId,
          metadata: {
            reason: parsed.data.reason,
            typedConfirmationValidated: true
          } as Prisma.InputJsonObject
        }
      });

      await writeAuditLog({
        operationId: parsed.data.idempotencyKey,
        requestId: parsed.data.idempotencyKey,
        actorUserId,
        module: MODULE_KEY,
        action: "platform-credits.adjusted",
        targetType: "User",
        targetId: target.id,
        severity: AuditSeverity.warning,
        before: { platformCredits: balanceBefore },
        after: { platformCredits: membership.platformCredits },
        metadata: {
          ledgerEntryId: ledgerEntry.id,
          amount: parsed.data.amount,
          reason: parsed.data.reason,
          typedConfirmationValidated: true
        }
      }, tx);

      return { ...membership, ledgerEntryId: ledgerEntry.id };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_PLATFORM_CREDITS") {
      return { ok: false as const, error: "This adjustment would make platform credits negative." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentReplay = await replayResult();
      if (concurrentReplay) return concurrentReplay;
    }
    throw error;
  }
  await diagnostics.info(MODULE_KEY, "Admin adjusted platform credits.", {
    actorUserId,
    targetUserId: target.id,
    amount: parsed.data.amount,
    resultingBalance: updated.platformCredits,
    ledgerEntryId: updated.ledgerEntryId
  });

  return {
    ok: true as const,
    account: {
      ...target,
      tier: updated.tier,
      platformCredits: updated.platformCredits
    },
    ledgerEntryId: updated.ledgerEntryId,
    replayed: false as const
  };
}
