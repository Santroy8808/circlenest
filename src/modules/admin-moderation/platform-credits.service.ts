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

function normalizeIdentifier(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

const creditAccountSelect = {
  id: true,
  email: true,
  username: true,
  role: true,
  deactivatedAt: true,
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
} satisfies Prisma.UserSelect;

type CreditAccountRecord = Prisma.UserGetPayload<{ select: typeof creditAccountSelect }>;

function toCreditAccount(user: CreditAccountRecord) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    deactivatedAt: user.deactivatedAt,
    displayName: user.profile?.displayName ?? user.username,
    tier: user.membership?.tier ?? "FREE" as const,
    platformCredits: user.membership?.platformCredits ?? 0
  };
}

export async function findCreditAccount(identifier: string) {
  const normalized = normalizeIdentifier(identifier);

  if (!normalized) return null;

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalized }, { username: normalized }]
    },
    select: creditAccountSelect
  });

  if (!user) return null;

  const { deactivatedAt: _deactivatedAt, ...account } = toCreditAccount(user);
  return account;
}

export function wouldPlatformCreditAdjustmentBeNegative(balance: number, amount: number) {
  return balance + amount < 0;
}

export function validateLockedPlatformCreditActors(input: {
  actor: { id: string; role: CreditAccountRecord["role"]; deactivatedAt: Date | null } | null;
  target: ReturnType<typeof toCreditAccount> | null;
  amount: number;
  confirmation: string;
}) {
  if (!input.actor || input.actor.deactivatedAt || !isAdminRole(input.actor.role)) {
    return { ok: false as const, error: "Admin access required." };
  }
  if (!input.target) {
    return { ok: false as const, error: "User was not found." };
  }
  if (input.target.deactivatedAt) {
    return { ok: false as const, error: "That account is deactivated and cannot receive a credit adjustment." };
  }
  const authorization = evaluateAdminActorTarget({
    actorUserId: input.actor.id,
    actorRole: input.actor.role,
    targetUserId: input.target.id,
    targetRole: input.target.role
  });
  if (!authorization.allowed) {
    return { ok: false as const, error: "That account is protected from this administrator action." };
  }
  const expectedConfirmation = platformCreditAdjustmentConfirmation(input.target.username, input.amount);
  if (input.confirmation !== expectedConfirmation) {
    return {
      ok: false as const,
      error: `Type ${expectedConfirmation} exactly to confirm this financial adjustment.`
    };
  }
  return { ok: true as const };
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
  const parsed = platformCreditAdjustmentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid credit adjustment." };
  }

  const preliminaryActor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { role: true, deactivatedAt: true }
  });
  if (!preliminaryActor || preliminaryActor.deactivatedAt || !isAdminRole(preliminaryActor.role)) {
    return { ok: false as const, error: "Admin access required." };
  }

  const initialTarget = await findCreditAccount(parsed.data.userIdentifier);
  if (!initialTarget) {
    return { ok: false as const, error: "User was not found." };
  }

  const ledgerReason = `Admin platform credit adjustment: ${parsed.data.reason}`;
  type TransactionResult = {
    account: Omit<ReturnType<typeof toCreditAccount>, "deactivatedAt">;
    ledgerEntryId: string;
    replayed: boolean;
  };
  let updated: TransactionResult | null = null;
  for (let attempt = 0; attempt < 3 && !updated; attempt += 1) {
    try {
      updated = await prisma.$transaction(async (tx): Promise<TransactionResult> => {
        const lockedUserIds = [...new Set([actorUserId, initialTarget.id])].sort();
        await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(lockedUserIds)}) ORDER BY "id" FOR UPDATE`
        );
        const [lockedActor, lockedTargetRecord] = await Promise.all([
          tx.user.findUnique({
            where: { id: actorUserId },
            select: { id: true, role: true, deactivatedAt: true }
          }),
          tx.user.findUnique({ where: { id: initialTarget.id }, select: creditAccountSelect })
        ]);
        const lockedTarget = lockedTargetRecord ? toCreditAccount(lockedTargetRecord) : null;
        const authorization = validateLockedPlatformCreditActors({
          actor: lockedActor,
          target: lockedTarget,
          amount: parsed.data.amount,
          confirmation: parsed.data.confirmation
        });
        if (!authorization.ok) throw new Error(`PLATFORM_CREDIT_REJECTED:${authorization.error}`);
        const target = lockedTarget!;

        const existing = await tx.adCreditLedgerEntry.findUnique({
          where: { idempotencyKey: parsed.data.idempotencyKey }
        });
        if (existing) {
          if (
            existing.userId !== target.id ||
            existing.actorUserId !== actorUserId ||
            existing.amount !== parsed.data.amount ||
            existing.reason !== ledgerReason
          ) {
            throw new Error("PLATFORM_CREDIT_REJECTED:That credit idempotency key has already been used for another adjustment.");
          }
          const { deactivatedAt: _deactivatedAt, ...account } = target;
          return {
            account: {
              ...account,
              platformCredits: existing.balanceAfter ?? target.platformCredits
            },
            ledgerEntryId: existing.id,
            replayed: true
          };
        }

      if (parsed.data.amount < 0) {
        const changed = await tx.membership.updateMany({
          where: {
            userId: target.id,
            platformCredits: { gte: -parsed.data.amount }
          },
          data: { platformCredits: { increment: parsed.data.amount } }
        });
        if (changed.count !== 1) {
          throw new Error("PLATFORM_CREDIT_REJECTED:This adjustment would make platform credits negative.");
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

        const { deactivatedAt: _deactivatedAt, ...account } = target;
        return {
          account: {
            ...account,
            tier: membership.tier,
            platformCredits: membership.platformCredits
          },
          ledgerEntryId: ledgerEntry.id,
          replayed: false
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("PLATFORM_CREDIT_REJECTED:")) {
        return { ok: false as const, error: error.message.slice("PLATFORM_CREDIT_REJECTED:".length) };
      }
      const retryableConcurrencyFailure =
        error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034");
      if (retryableConcurrencyFailure && attempt < 2) continue;
      throw error;
    }
  }
  if (!updated) throw new Error("Platform credit adjustment did not produce a transaction result.");
  await diagnostics.info(MODULE_KEY, "Admin adjusted platform credits.", {
    actorUserId,
    targetUserId: updated.account.id,
    amount: parsed.data.amount,
    resultingBalance: updated.account.platformCredits,
    ledgerEntryId: updated.ledgerEntryId
  });

  return {
    ok: true as const,
    account: updated.account,
    ledgerEntryId: updated.ledgerEntryId,
    replayed: updated.replayed
  };
}
