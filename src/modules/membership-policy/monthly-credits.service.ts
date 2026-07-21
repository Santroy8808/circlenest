import { AuditSeverity, MembershipTier, PlatformCreditEntryType, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";

const MODULE_KEY = "membership-monthly-credits";
export const CONTRIBUTOR_MONTHLY_CREDITS = 10;
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

export function contributorMonthlyCreditAllocation(
  userId: string,
  now = new Date(),
  amount = CONTRIBUTOR_MONTHLY_CREDITS
) {
  const period = utcMonthlyCreditPeriod(now);
  return {
    userId,
    amount,
    period,
    idempotencyKey: `monthly-contributor:${period.key}:${userId}`,
    sourceType: "MembershipMonthlyAllocation" as const,
    reason: `Contributor monthly allocation for ${period.key}`
  };
}

type ExistingMonthlyCreditEntry = {
  id: string;
  userId: string;
  entryType: PlatformCreditEntryType;
  amount: number;
  sourceType: string | null;
  sourceId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  balanceAfter: number | null;
};

const existingMonthlyCreditEntrySelect = {
  id: true,
  userId: true,
  entryType: true,
  amount: true,
  sourceType: true,
  sourceId: true,
  periodStart: true,
  periodEnd: true,
  balanceAfter: true
} satisfies Prisma.AdCreditLedgerEntrySelect;

export type StaleContributorMonthlyCreditRecipientReason =
  | "MEMBERSHIP_MISSING"
  | "TIER_CHANGED"
  | "ACCOUNT_DEACTIVATED";

export class StaleContributorMonthlyCreditRecipientError extends Error {
  readonly code = "STALE_CONTRIBUTOR_MONTHLY_CREDIT_RECIPIENT";

  constructor(
    readonly userId: string,
    readonly reason: StaleContributorMonthlyCreditRecipientReason
  ) {
    super(`Contributor monthly credit recipient became ineligible: ${reason}.`);
    this.name = "StaleContributorMonthlyCreditRecipientError";
  }
}

export function classifyContributorMonthlyCreditReplay(input: {
  existing: ExistingMonthlyCreditEntry | null;
  allocation: ReturnType<typeof contributorMonthlyCreditAllocation>;
}) {
  if (!input.existing) return { state: "allocate" as const };
  const matches =
    input.existing.userId === input.allocation.userId &&
    input.existing.entryType === PlatformCreditEntryType.MONTHLY_ALLOCATION &&
    input.existing.amount === input.allocation.amount &&
    input.existing.sourceType === input.allocation.sourceType &&
    input.existing.sourceId === input.allocation.period.key &&
    input.existing.periodStart?.getTime() === input.allocation.period.start.getTime() &&
    input.existing.periodEnd?.getTime() === input.allocation.period.end.getTime();
  return matches
    ? { state: "replay" as const, ledgerEntryId: input.existing.id }
    : { state: "conflict" as const };
}

export async function allocateContributorMonthlyCreditsInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    now?: Date;
    amount?: number;
  }
) {
  const allocation = contributorMonthlyCreditAllocation(
    input.userId,
    input.now,
    input.amount ?? CONTRIBUTOR_MONTHLY_CREDITS
  );
  if (!Number.isSafeInteger(allocation.amount) || allocation.amount <= 0) {
    throw new Error("Contributor monthly credit allocation must be a positive whole number.");
  }

  const current = await transaction.membership.findUnique({
    where: { userId: input.userId },
    select: {
      tier: true,
      user: { select: { username: true, deactivatedAt: true } }
    }
  });
  if (!current) {
    throw new StaleContributorMonthlyCreditRecipientError(
      input.userId,
      "MEMBERSHIP_MISSING"
    );
  }
  if (current.tier !== MembershipTier.CONTRIBUTOR) {
    throw new StaleContributorMonthlyCreditRecipientError(input.userId, "TIER_CHANGED");
  }
  if (current.user.deactivatedAt !== null) {
    throw new StaleContributorMonthlyCreditRecipientError(
      input.userId,
      "ACCOUNT_DEACTIVATED"
    );
  }

  const existing = await transaction.adCreditLedgerEntry.findUnique({
    where: { idempotencyKey: allocation.idempotencyKey },
    select: existingMonthlyCreditEntrySelect
  });
  const replay = classifyContributorMonthlyCreditReplay({ existing, allocation });
  if (replay.state === "conflict") {
    throw new Error("Monthly Contributor credit idempotency record does not match the canonical allocation.");
  }
  if (replay.state === "replay") {
    return {
      allocated: false as const,
      ledgerEntryId: replay.ledgerEntryId,
      idempotencyKey: allocation.idempotencyKey,
      amount: allocation.amount,
      periodKey: allocation.period.key,
      balanceAfter: existing?.balanceAfter ?? null
    };
  }

  const updated = await transaction.membership.update({
    where: { userId: input.userId },
    data: { platformCredits: { increment: allocation.amount } },
    select: { platformCredits: true }
  });
  const before = updated.platformCredits - allocation.amount;
  const ledger = await transaction.adCreditLedgerEntry.create({
    data: {
      idempotencyKey: allocation.idempotencyKey,
      userId: input.userId,
      accountReference: current.user.username,
      entryType: PlatformCreditEntryType.MONTHLY_ALLOCATION,
      amount: allocation.amount,
      balanceAfter: updated.platformCredits,
      reason: allocation.reason,
      sourceType: allocation.sourceType,
      sourceId: allocation.period.key,
      periodStart: allocation.period.start,
      periodEnd: allocation.period.end,
      metadata: { tier: MembershipTier.CONTRIBUTOR } satisfies Prisma.InputJsonObject
    }
  });

  await writeAuditLog(
    {
      operationId: allocation.idempotencyKey,
      requestId: allocation.idempotencyKey,
      module: MODULE_KEY,
      action: "credits.allocated",
      targetType: "User",
      targetId: input.userId,
      severity: AuditSeverity.info,
      before: { platformCredits: before },
      after: { platformCredits: updated.platformCredits },
      metadata: {
        ledgerEntryId: ledger.id,
        period: allocation.period.key,
        amount: allocation.amount
      }
    },
    transaction
  );

  return {
    allocated: true as const,
    ledgerEntryId: ledger.id,
    idempotencyKey: allocation.idempotencyKey,
    amount: allocation.amount,
    periodKey: allocation.period.key,
    balanceAfter: updated.platformCredits
  };
}

export function isActiveContributorCreditRecipient(input: {
  tier: MembershipTier;
  deactivatedAt: Date | null;
}) {
  return input.tier === MembershipTier.CONTRIBUTOR && input.deactivatedAt === null;
}

export async function processContributorMonthlyCreditRecipients(
  recipients: ReadonlyArray<{ userId: string }>,
  allocate: (userId: string) => Promise<{ allocated: boolean }>
) {
  let allocated = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    try {
      const result = await allocate(recipient.userId);
      if (result.allocated) allocated += 1;
      else skipped += 1;
    } catch (error) {
      if (error instanceof StaleContributorMonthlyCreditRecipientError) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { allocated, skipped };
}

async function allocateContributorMonthlyCreditsWithRaceRecovery(input: {
  userId: string;
  now: Date;
  amount: number;
}) {
  try {
    return await runSerializableCreditTransaction(async (transaction) => {
      return allocateContributorMonthlyCreditsInTransaction(transaction, input);
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }

    const allocation = contributorMonthlyCreditAllocation(input.userId, input.now, input.amount);
    const existing = await prisma.adCreditLedgerEntry.findUnique({
      where: { idempotencyKey: allocation.idempotencyKey },
      select: existingMonthlyCreditEntrySelect
    });
    const replay = classifyContributorMonthlyCreditReplay({ existing, allocation });
    if (replay.state !== "replay") throw error;

    return {
      allocated: false as const,
      ledgerEntryId: replay.ledgerEntryId,
      idempotencyKey: allocation.idempotencyKey,
      amount: allocation.amount,
      periodKey: allocation.period.key,
      balanceAfter: existing?.balanceAfter ?? null
    };
  }
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

  const result = await processContributorMonthlyCreditRecipients(
    memberships,
    (userId) => allocateContributorMonthlyCreditsWithRaceRecovery({ userId, now, amount })
  );

  return { ...result, amountPerMember: amount };
}
