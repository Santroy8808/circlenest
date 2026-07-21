import assert from "node:assert/strict";
import test from "node:test";
import { MembershipTier, PlatformCreditEntryType, Prisma } from "@prisma/client";
import {
  allocateContributorMonthlyCreditsInTransaction,
  classifyContributorMonthlyCreditReplay,
  contributorMonthlyCreditAllocation,
  isActiveContributorCreditRecipient,
  processContributorMonthlyCreditRecipients,
  StaleContributorMonthlyCreditRecipientError,
  utcMonthlyCreditPeriod
} from "@/modules/membership-policy/monthly-credits.service";

test("monthly credit periods use stable UTC boundaries", () => {
  const period = utcMonthlyCreditPeriod(new Date("2026-07-31T23:59:59.999-07:00"));
  assert.equal(period.key, "2026-08");
  assert.equal(period.start.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(period.end.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("only an active Contributor account receives monthly credits", () => {
  assert.equal(
    isActiveContributorCreditRecipient({ tier: MembershipTier.CONTRIBUTOR, deactivatedAt: null }),
    true
  );
  assert.equal(
    isActiveContributorCreditRecipient({ tier: MembershipTier.FREE, deactivatedAt: null }),
    false
  );
  assert.equal(
    isActiveContributorCreditRecipient({ tier: MembershipTier.CONTRIBUTOR, deactivatedAt: new Date() }),
    false
  );
});

test("Contributor acceptance and scheduler share one canonical monthly allocation", () => {
  const allocation = contributorMonthlyCreditAllocation(
    "member-1",
    new Date("2026-07-21T12:00:00.000Z")
  );
  assert.equal(allocation.amount, 10);
  assert.equal(allocation.period.key, "2026-07");
  assert.equal(allocation.idempotencyKey, "monthly-contributor:2026-07:member-1");
  assert.deepEqual(
    classifyContributorMonthlyCreditReplay({ existing: null, allocation }),
    { state: "allocate" }
  );

  const canonicalEntry = {
    id: "ledger-1",
    userId: "member-1",
    entryType: PlatformCreditEntryType.MONTHLY_ALLOCATION,
    amount: 10,
    sourceType: "MembershipMonthlyAllocation",
    sourceId: "2026-07",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-08-01T00:00:00.000Z"),
    balanceAfter: 10
  };
  assert.deepEqual(
    classifyContributorMonthlyCreditReplay({ existing: canonicalEntry, allocation }),
    { state: "replay", ledgerEntryId: "ledger-1" }
  );
  assert.deepEqual(
    classifyContributorMonthlyCreditReplay({
      existing: { ...canonicalEntry, amount: 5 },
      allocation
    }),
    { state: "conflict" }
  );
});

test("a new monthly credit allocation writes its ledger and durable audit atomically", async () => {
  let platformCredits = 5;
  let ledgerData: Record<string, unknown> | null = null;
  let auditData: Record<string, unknown> | null = null;
  const transaction = {
    membership: {
      findUnique: async () => ({
        tier: MembershipTier.CONTRIBUTOR,
        user: { username: "member", deactivatedAt: null }
      }),
      update: async (args: { data: { platformCredits: { increment: number } } }) => {
        platformCredits += args.data.platformCredits.increment;
        return { platformCredits };
      }
    },
    adCreditLedgerEntry: {
      findUnique: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        ledgerData = args.data;
        return { id: "ledger-1", ...args.data };
      }
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        auditData = args.data;
        return { id: "audit-1", ...args.data };
      }
    }
  } as unknown as Prisma.TransactionClient;

  const result = await allocateContributorMonthlyCreditsInTransaction(transaction, {
    userId: "member-1",
    now: new Date("2026-07-21T12:00:00.000Z")
  });

  const recordedLedger = ledgerData as Record<string, unknown> | null;
  const recordedAudit = auditData as Record<string, unknown> | null;
  assert.ok(recordedLedger);
  assert.ok(recordedAudit);
  assert.equal(result.allocated, true);
  assert.equal(platformCredits, 15);
  assert.equal(recordedLedger.idempotencyKey, "monthly-contributor:2026-07:member-1");
  assert.equal(recordedAudit.operationId, "monthly-contributor:2026-07:member-1");
  assert.equal(recordedAudit.requestId, "monthly-contributor:2026-07:member-1");
  assert.equal(recordedAudit.action, "credits.allocated");
  assert.deepEqual(recordedAudit.before, { platformCredits: 5 });
  assert.deepEqual(recordedAudit.after, { platformCredits: 15 });
});

test("the allocator reports a typed stale recipient when snapshot eligibility changed", async () => {
  const transactionFor = (
    tier: MembershipTier,
    deactivatedAt: Date | null
  ) => ({
    membership: {
      findUnique: async () => ({
        tier,
        user: { username: "member", deactivatedAt }
      })
    }
  }) as unknown as Prisma.TransactionClient;

  await assert.rejects(
    allocateContributorMonthlyCreditsInTransaction(
      transactionFor(MembershipTier.FREE, null),
      {
        userId: "member-1",
        now: new Date("2026-07-21T12:00:00.000Z")
      }
    ),
    (error: unknown) =>
      error instanceof StaleContributorMonthlyCreditRecipientError &&
      error.userId === "member-1" &&
      error.reason === "TIER_CHANGED"
  );
  await assert.rejects(
    allocateContributorMonthlyCreditsInTransaction(
      transactionFor(MembershipTier.CONTRIBUTOR, new Date("2026-07-21T11:59:00.000Z")),
      {
      userId: "member-1",
      now: new Date("2026-07-21T12:00:00.000Z")
      }
    ),
    (error: unknown) =>
      error instanceof StaleContributorMonthlyCreditRecipientError &&
      error.userId === "member-1" &&
      error.reason === "ACCOUNT_DEACTIVATED"
  );
});

test("monthly batch skips concurrently stale recipients and continues to later recipients", async () => {
  const attempted: string[] = [];
  const result = await processContributorMonthlyCreditRecipients(
    [
      { userId: "downgraded" },
      { userId: "deactivated" },
      { userId: "still-contributor" }
    ],
    async (userId) => {
      attempted.push(userId);
      if (userId === "downgraded") {
        throw new StaleContributorMonthlyCreditRecipientError(userId, "TIER_CHANGED");
      }
      if (userId === "deactivated") {
        throw new StaleContributorMonthlyCreditRecipientError(userId, "ACCOUNT_DEACTIVATED");
      }
      return { allocated: true };
    }
  );

  assert.deepEqual(attempted, ["downgraded", "deactivated", "still-contributor"]);
  assert.deepEqual(result, { allocated: 1, skipped: 2 });
});

test("monthly batch preserves unexpected failures and aborts remaining recipients", async () => {
  const attempted: string[] = [];
  const unexpected = new Error("database unavailable");

  await assert.rejects(
    processContributorMonthlyCreditRecipients(
      [{ userId: "first" }, { userId: "broken" }, { userId: "must-not-run" }],
      async (userId) => {
        attempted.push(userId);
        if (userId === "broken") throw unexpected;
        return { allocated: true };
      }
    ),
    (error: unknown) => error === unexpected
  );
  assert.deepEqual(attempted, ["first", "broken"]);
});
