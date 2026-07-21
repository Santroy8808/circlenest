import { AuditSeverity, MembershipTier, PlatformCreditEntryType, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";

const MODULE_KEY = "membership-monthly-credits";
const CONTRIBUTOR_MONTHLY_CREDITS = 10;
const CREDIT_TRANSACTION_RETRIES = 3;

async function runSerializableCreditTransaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; attempt <= CREDIT_TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === CREDIT_TRANSACTION_RETRIES) throw error;
    }
  }

  throw new Error("Monthly credit transaction retry limit reached.");
}

export function utcMonthlyCreditPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, key };
}

export function isActiveContributorCreditRecipient(input: {
  tier: MembershipTier;
  deactivatedAt: Date | null;
}) {
  return input.tier === MembershipTier.CONTRIBUTOR && input.deactivatedAt === null;
}

export async function allocateContributorMonthlyCredits(now = new Date()) {
  const [plan, memberships] = await Promise.all([
    prisma.subscriptionPlanRule.findUnique({
      where: { tier: MembershipTier.CONTRIBUTOR },
      select: { active: true, monthlyCreditBudget: true }
    }),
    prisma.membership.findMany({
      where: {
        tier: MembershipTier.CONTRIBUTOR,
        user: { deactivatedAt: null }
      },
      select: {
        userId: true
      }
    })
  ]);

  if (plan && !plan.active) return { allocated: 0, skipped: memberships.length, amountPerMember: 0 };

  const amount = Math.max(0, plan?.monthlyCreditBudget ?? CONTRIBUTOR_MONTHLY_CREDITS);
  if (amount === 0) return { allocated: 0, skipped: memberships.length, amountPerMember: 0 };

  const period = utcMonthlyCreditPeriod(now);
  let allocated = 0;
  let skipped = 0;

  for (const membership of memberships) {
    const idempotencyKey = `monthly-contributor:${period.key}:${membership.userId}`;
    try {
      const result = await runSerializableCreditTransaction(async (transaction) => {
        const current = await transaction.membership.findUnique({
          where: { userId: membership.userId },
          select: {
            tier: true,
            user: { select: { username: true, deactivatedAt: true } }
          }
        });
        if (
          !current ||
          !isActiveContributorCreditRecipient({
            tier: current.tier,
            deactivatedAt: current.user.deactivatedAt
          })
        ) {
          return false;
        }

        const existing = await transaction.adCreditLedgerEntry.findUnique({
          where: { idempotencyKey },
          select: { id: true }
        });
        if (existing) return false;

        const updated = await transaction.membership.update({
          where: { userId: membership.userId },
          data: { platformCredits: { increment: amount } },
          select: { platformCredits: true }
        });
        const before = updated.platformCredits - amount;
        const ledger = await transaction.adCreditLedgerEntry.create({
          data: {
            idempotencyKey,
            userId: membership.userId,
            accountReference: current.user.username,
            entryType: PlatformCreditEntryType.MONTHLY_ALLOCATION,
            amount,
            balanceAfter: updated.platformCredits,
            reason: `Contributor monthly allocation for ${period.key}`,
            sourceType: "MembershipMonthlyAllocation",
            sourceId: period.key,
            periodStart: period.start,
            periodEnd: period.end,
            metadata: { tier: MembershipTier.CONTRIBUTOR } satisfies Prisma.InputJsonObject
          }
        });

        await writeAuditLog(
          {
            operationId: idempotencyKey,
            requestId: idempotencyKey,
            module: MODULE_KEY,
            action: "credits.allocated",
            targetType: "User",
            targetId: membership.userId,
            severity: AuditSeverity.info,
            before: { platformCredits: before },
            after: { platformCredits: updated.platformCredits },
            metadata: { ledgerEntryId: ledger.id, period: period.key, amount }
          },
          transaction
        );

        return true;
      });
      if (result) allocated += 1;
      else skipped += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { allocated, skipped, amountPerMember: amount };
}
