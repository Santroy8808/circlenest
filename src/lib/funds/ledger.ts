import "server-only";

import { prisma } from "@/lib/db/prisma";

export const REAL_MONEY_ENTRY_TYPES = [
  "PROCESSOR_DEPOSIT",
  "MARKETPLACE_PAYMENT",
  "EVENT_PAYMENT",
  "FUNDRAISER_DONATION",
  "PLATFORM_FEE",
  "SELLER_CREDIT",
  "WITHDRAWAL_REQUEST",
  "WITHDRAWAL_SENT_TO_PROCESSOR",
  "WITHDRAWAL_FAILED",
  "WITHDRAWAL_COMPLETED",
  "REFUND",
  "CHARGEBACK",
  "ADJUSTMENT_FROM_PROCESSOR",
] as const;

export const WITHDRAWAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "QUEUED_FOR_BATCH",
  "SENT_TO_PROCESSOR",
  "COMPLETED",
  "FAILED",
  "CANCELED",
  "HOLD",
] as const;

const PROCESSOR_REAL_CREDIT_TYPES = new Set(["PROCESSOR_DEPOSIT", "MARKETPLACE_PAYMENT", "EVENT_PAYMENT", "FUNDRAISER_DONATION", "SELLER_CREDIT", "ADJUSTMENT_FROM_PROCESSOR"]);
const TEST_MONEY_ENABLED = process.env.THETA_ENABLE_TEST_MONEY === "true" && process.env.NODE_ENV !== "production";

export type WalletSummary = Readonly<{
  realMoneyBalanceCents: number;
  withdrawableBalanceCents: number;
  platformCreditBalance: number;
  testMoneyBalanceCents: number;
  testMoneyEnabled: boolean;
  pendingWithdrawalCents: number;
  currency: string;
}>;

export function formatMoneyCents(amountCents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
}

export function resolveNextWithdrawalBatchDate(now = new Date()) {
  const batchDays = new Set([2, 4, 6]);
  const candidate = new Date(now);
  candidate.setHours(12, 0, 0, 0);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = candidate.getDay();
    if (batchDays.has(day) && candidate > now) return candidate;
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

export async function getWalletSummary(userId: string): Promise<WalletSummary> {
  const [realMoney, platformCredits, testMoney, pendingWithdrawals] = await Promise.all([
    prisma.realMoneyLedgerEntry.aggregate({ where: { userId }, _sum: { amountCents: true } }),
    prisma.platformCreditLedgerEntry.aggregate({ where: { userId }, _sum: { credits: true } }),
    TEST_MONEY_ENABLED ? prisma.testMoneyLedgerEntry.aggregate({ where: { userId }, _sum: { amountCents: true } }) : Promise.resolve({ _sum: { amountCents: 0 } }),
    prisma.withdrawalRequest.aggregate({
      where: { userId, status: { in: ["PENDING", "APPROVED", "QUEUED_FOR_BATCH", "SENT_TO_PROCESSOR", "HOLD"] } },
      _sum: { amountCents: true },
    }),
  ]);

  const realMoneyBalanceCents = realMoney._sum.amountCents ?? 0;
  const pendingWithdrawalCents = pendingWithdrawals._sum.amountCents ?? 0;
  return {
    realMoneyBalanceCents,
    withdrawableBalanceCents: Math.max(0, realMoneyBalanceCents - pendingWithdrawalCents),
    platformCreditBalance: platformCredits._sum.credits ?? 0,
    testMoneyBalanceCents: testMoney._sum.amountCents ?? 0,
    testMoneyEnabled: TEST_MONEY_ENABLED,
    pendingWithdrawalCents,
    currency: "USD",
  };
}

export async function appendProcessorRealMoneyEntry(input: {
  userId: string;
  entryType: (typeof REAL_MONEY_ENTRY_TYPES)[number];
  amountCents: number;
  sourceProvider: string;
  sourceProviderEventId: string;
  sourceType?: string | null;
  sourceId?: string | null;
  metadataJson?: string | null;
}) {
  if (input.amountCents > 0 && !PROCESSOR_REAL_CREDIT_TYPES.has(input.entryType)) {
    throw new Error("Real-money credits must originate from a payment processor event.");
  }

  return prisma.realMoneyLedgerEntry.create({
    data: {
      ledgerKey: `REAL:${input.sourceProvider}:${input.sourceProviderEventId}:${input.entryType}:${input.userId}`,
      userId: input.userId,
      entryType: input.entryType,
      amountCents: input.amountCents,
      sourceProvider: input.sourceProvider,
      sourceProviderEventId: input.sourceProviderEventId,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      metadataJson: input.metadataJson ?? null,
    },
  });
}

export async function appendPlatformCreditEntry(input: {
  userId: string;
  entryType: string;
  credits: number;
  sourceType?: string | null;
  sourceId?: string | null;
  note?: string | null;
}) {
  return prisma.platformCreditLedgerEntry.create({
    data: {
      ledgerKey: `PLATFORM:${input.entryType}:${input.userId}:${input.sourceType ?? "manual"}:${input.sourceId ?? crypto.randomUUID()}`,
      userId: input.userId,
      entryType: input.entryType,
      credits: input.credits,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      note: input.note ?? null,
    },
  });
}

export async function requestWithdrawal(userId: string, amountCents: number, currency = "USD") {
  if (amountCents <= 0) throw new Error("Withdrawal amount must be greater than zero.");
  const wallet = await getWalletSummary(userId);
  if (amountCents > wallet.withdrawableBalanceCents) {
    throw new Error("Withdrawal exceeds available withdrawable balance.");
  }

  const scheduledFor = resolveNextWithdrawalBatchDate();
  const batchKey = `WITHDRAWAL-BATCH:${scheduledFor.toISOString().slice(0, 10)}`;

  return prisma.$transaction(async (tx) => {
    const batch = await tx.withdrawalBatch.upsert({
      where: { batchKey },
      create: { batchKey, scheduledFor, status: "OPEN" },
      update: {},
    });
    const withdrawal = await tx.withdrawalRequest.create({
      data: {
        userId,
        amountCents,
        currency,
        status: "PENDING",
        batchId: batch.id,
      },
    });
    await tx.realMoneyLedgerEntry.create({
      data: {
        ledgerKey: `REAL:WITHDRAWAL_REQUEST:${withdrawal.id}`,
        userId,
        entryType: "WITHDRAWAL_REQUEST",
        amountCents: -amountCents,
        currency,
        sourceType: "WITHDRAWAL_REQUEST",
        sourceId: withdrawal.id,
        withdrawalRequestId: withdrawal.id,
      },
    });
    return withdrawal;
  });
}
