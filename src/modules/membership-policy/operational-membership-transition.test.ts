import assert from "node:assert/strict";
import test from "node:test";
import {
  MembershipTier,
  MembershipUpgradeOfferStatus,
  PlatformCreditEntryType,
  Prisma
} from "@prisma/client";
import { visibleContributorOfferStatusForPersistedTier } from "@/modules/membership-policy/contributor-upgrade.service";
import {
  OperationalMembershipTransitionConflictError,
  transitionOperationalMembershipInTransaction
} from "@/modules/membership-policy/operational-membership-transition.service";

const MEBIBYTE = 1024 * 1024;
const now = new Date("2026-07-21T12:00:00.000Z");

type FakeMembership = {
  tier: MembershipTier;
  storageLimitBytes: bigint;
  platformCredits: number;
  updatedAt?: Date;
};

function fakeTransitionTransaction(input: {
  membership?: FakeMembership | null;
  offeredCount?: number;
  acceptedCount?: number;
  activeEligibilityCount?: number;
}) {
  let membership = input.membership
    ? {
        ...input.membership,
        updatedAt: input.membership.updatedAt ?? new Date("2026-07-21T11:59:00.000Z")
      }
    : null;
  let offeredCount = input.offeredCount ?? 0;
  let acceptedCount = input.acceptedCount ?? 0;
  let activeEligibilityCount = input.activeEligibilityCount ?? 0;
  let ledger: {
    id: string;
    userId: string;
    entryType: PlatformCreditEntryType;
    amount: number;
    sourceType: string;
    sourceId: string;
    periodStart: Date;
    periodEnd: Date;
    balanceAfter: number;
    idempotencyKey: string;
  } | null = null;
  const operations: string[] = [];
  let eligibilityUpdateData: Record<string, unknown> | null = null;
  let acceptedOfferUpdateData: Record<string, unknown> | null = null;

  const transaction = {
    $queryRaw: async () => {
      operations.push("membership.lock");
      return membership ? [{ ...membership }] : [];
    },
    membership: {
      upsert: async (args: {
        update: { tier: MembershipTier; storageLimitBytes: bigint };
        create: { tier: MembershipTier; storageLimitBytes: bigint };
      }) => {
        operations.push("membership.upsert");
        const data = membership ? args.update : args.create;
        membership = {
          tier: data.tier,
          storageLimitBytes: data.storageLimitBytes,
          platformCredits: membership?.platformCredits ?? 0,
          updatedAt: new Date((membership?.updatedAt.getTime() ?? now.getTime()) + 1)
        };
        return membership;
      },
      findUnique: async () => membership
        ? {
            ...membership,
            user: { username: "member", deactivatedAt: null }
          }
        : null,
      findUniqueOrThrow: async () => {
        if (!membership) throw new Error("missing membership");
        return { ...membership };
      },
      update: async (args: { data: { platformCredits: { increment: number } } }) => {
        if (!membership) throw new Error("missing membership");
        membership.platformCredits += args.data.platformCredits.increment;
        return { platformCredits: membership.platformCredits };
      }
    },
    membershipUpgradeOffer: {
      updateMany: async (args: {
        where: {
          status: MembershipUpgradeOfferStatus | { in: MembershipUpgradeOfferStatus[] };
        };
        data: Record<string, unknown>;
      }) => {
        const statuses = typeof args.where.status === "object"
          ? args.where.status.in
          : [args.where.status];
        const targetsOffered = statuses.includes(MembershipUpgradeOfferStatus.OFFERED);
        const targetsAccepted = statuses.includes(MembershipUpgradeOfferStatus.ACCEPTED);
        const count = (targetsOffered ? offeredCount : 0) + (targetsAccepted ? acceptedCount : 0);
        if (targetsOffered) offeredCount = 0;
        if (targetsAccepted) {
          acceptedCount = 0;
          acceptedOfferUpdateData = args.data;
        }
        return { count };
      }
    },
    membershipTierUpgradeEligibility: {
      updateMany: async (args: { data: Record<string, unknown> }) => {
        eligibilityUpdateData = args.data;
        const count = activeEligibilityCount;
        activeEligibilityCount = 0;
        return { count };
      }
    },
    adCreditLedgerEntry: {
      findUnique: async () => ledger,
      create: async (args: {
        data: {
          idempotencyKey: string;
          userId: string;
          entryType: PlatformCreditEntryType;
          amount: number;
          sourceType: string;
          sourceId: string;
          periodStart: Date;
          periodEnd: Date;
          balanceAfter: number;
        };
      }) => {
        ledger = { id: "ledger-1", ...args.data };
        return ledger;
      }
    },
    auditLog: {
      create: async () => ({ id: "audit-1" })
    }
  } as unknown as Prisma.TransactionClient;

  return {
    transaction,
    operations,
    membership: () => membership,
    eligibilityUpdateData: () => eligibilityUpdateData,
    acceptedOfferUpdateData: () => acceptedOfferUpdateData
  };
}

test("Free to Contributor transition repairs quota, reconciles access, and allocates monthly credits once", async () => {
  const fake = fakeTransitionTransaction({
    membership: {
      tier: MembershipTier.FREE,
      storageLimitBytes: BigInt(200 * MEBIBYTE),
      platformCredits: 2
    },
    offeredCount: 1,
    acceptedCount: 1,
    activeEligibilityCount: 1
  });

  const first = await transitionOperationalMembershipInTransaction(fake.transaction, {
    userId: "member-1",
    targetTier: MembershipTier.CONTRIBUTOR,
    source: "ADMIN_CORRECTION",
    actorUserId: "admin-1",
    expectedCurrentTier: MembershipTier.FREE,
    now
  });

  assert.equal(fake.operations[0], "membership.lock");
  assert.equal(first.before.tier, MembershipTier.FREE);
  assert.equal(first.after.tier, MembershipTier.CONTRIBUTOR);
  assert.equal(first.after.storageLimitBytes, BigInt(2 * 1024 * MEBIBYTE));
  assert.equal(first.after.platformCredits, 12);
  assert.equal(first.revokedContributorOfferCount, 1);
  assert.equal(first.terminatedAcceptedContributorOfferCount, 1);
  assert.equal(fake.acceptedOfferUpdateData()?.status, undefined);
  assert.equal(fake.acceptedOfferUpdateData()?.revokedAt, now);
  assert.equal(first.deactivatedContributorEligibilityCount, 1);
  assert.equal(first.monthlyCredits?.allocated, true);

  const replay = await transitionOperationalMembershipInTransaction(fake.transaction, {
    userId: "member-1",
    targetTier: MembershipTier.CONTRIBUTOR,
    source: "ADMIN_CORRECTION",
    expectedCurrentTier: MembershipTier.CONTRIBUTOR,
    now
  });

  assert.equal(replay.after.platformCredits, 12);
  assert.equal(replay.monthlyCredits?.allocated, false);
});

test("Contributor to Free transition keeps earned credits while restoring the Free quota", async () => {
  const fake = fakeTransitionTransaction({
    membership: {
      tier: MembershipTier.CONTRIBUTOR,
      storageLimitBytes: BigInt(2 * 1024 * MEBIBYTE),
      platformCredits: 10
    },
    acceptedCount: 1,
    activeEligibilityCount: 1
  });

  const result = await transitionOperationalMembershipInTransaction(fake.transaction, {
    userId: "member-1",
    targetTier: MembershipTier.FREE,
    source: "ADMIN_CORRECTION",
    actorUserId: "admin-1",
    expectedCurrentTier: MembershipTier.CONTRIBUTOR,
    now
  });

  assert.equal(result.before.tier, MembershipTier.CONTRIBUTOR);
  assert.equal(result.after.tier, MembershipTier.FREE);
  assert.equal(result.after.storageLimitBytes, BigInt(200 * MEBIBYTE));
  assert.equal(result.after.platformCredits, 10);
  assert.equal(result.monthlyCredits, null);
  assert.equal(result.revokedContributorOfferCount, 0);
  assert.equal(result.terminatedAcceptedContributorOfferCount, 1);
  assert.equal(fake.acceptedOfferUpdateData()?.status, undefined);
  assert.equal(fake.acceptedOfferUpdateData()?.revokedAt, now);
  assert.equal(result.deactivatedContributorEligibilityCount, 1);
});

test("privileged Contributor provisioning creates the full tier invariant from no membership", async () => {
  const fake = fakeTransitionTransaction({ membership: null });

  const result = await transitionOperationalMembershipInTransaction(fake.transaction, {
    userId: "new-member",
    targetTier: MembershipTier.CONTRIBUTOR,
    source: "PRIVILEGED_PROVISIONING",
    actorUserId: "admin-1",
    now
  });

  assert.equal(result.before.exists, false);
  assert.equal(result.after.tier, MembershipTier.CONTRIBUTOR);
  assert.equal(result.after.storageLimitBytes, BigInt(2 * 1024 * MEBIBYTE));
  assert.equal(result.after.platformCredits, 10);
  assert.equal(result.monthlyCredits?.allocated, true);
});

test("a stale admin command is rejected after the membership row is locked", async () => {
  const fake = fakeTransitionTransaction({
    membership: {
      tier: MembershipTier.CONTRIBUTOR,
      storageLimitBytes: BigInt(2 * 1024 * MEBIBYTE),
      platformCredits: 10
    }
  });

  await assert.rejects(
    transitionOperationalMembershipInTransaction(fake.transaction, {
      userId: "member-1",
      targetTier: MembershipTier.CONTRIBUTOR,
      source: "ADMIN_CORRECTION",
      expectedCurrentTier: MembershipTier.FREE,
      now
    }),
    OperationalMembershipTransitionConflictError
  );
  assert.deepEqual(fake.operations, ["membership.lock"]);
});

test("a stale membership row version is rejected after the row is locked", async () => {
  const persistedVersion = new Date("2026-07-21T11:59:00.000Z");
  const fake = fakeTransitionTransaction({
    membership: {
      tier: MembershipTier.CONTRIBUTOR,
      storageLimitBytes: BigInt(2 * 1024 * MEBIBYTE),
      platformCredits: 10,
      updatedAt: persistedVersion
    }
  });

  await assert.rejects(
    transitionOperationalMembershipInTransaction(fake.transaction, {
      userId: "member-1",
      targetTier: MembershipTier.CONTRIBUTOR,
      source: "CONTRIBUTOR_ACCEPTANCE",
      expectedCurrentTier: MembershipTier.CONTRIBUTOR,
      expectedCurrentUpdatedAt: new Date(persistedVersion.getTime() - 1),
      now
    }),
    OperationalMembershipTransitionConflictError
  );
  assert.deepEqual(fake.operations, ["membership.lock"]);
});

test("acceptance consumes eligibility without falsely recording an administrator revocation", async () => {
  const fake = fakeTransitionTransaction({
    membership: {
      tier: MembershipTier.FREE,
      storageLimitBytes: BigInt(200 * MEBIBYTE),
      platformCredits: 0
    },
    acceptedCount: 1,
    activeEligibilityCount: 1
  });

  const result = await transitionOperationalMembershipInTransaction(fake.transaction, {
    userId: "member-1",
    targetTier: MembershipTier.CONTRIBUTOR,
    source: "CONTRIBUTOR_ACCEPTANCE",
    actorUserId: "member-1",
    expectedCurrentTier: MembershipTier.FREE,
    now
  });

  assert.deepEqual(fake.eligibilityUpdateData(), { active: false });
  assert.equal(result.revokedContributorOfferCount, 0);
  assert.equal(result.terminatedAcceptedContributorOfferCount, 0);
  assert.equal(fake.acceptedOfferUpdateData(), null);
});

test("historical accepted offers are visible only while Contributor is the persisted tier", () => {
  assert.equal(
    visibleContributorOfferStatusForPersistedTier(MembershipTier.FREE),
    MembershipUpgradeOfferStatus.OFFERED
  );
  assert.equal(
    visibleContributorOfferStatusForPersistedTier(MembershipTier.CONTRIBUTOR),
    MembershipUpgradeOfferStatus.ACCEPTED
  );
});
