import assert from "node:assert/strict";
import test from "node:test";
import {
  MembershipTier,
  MembershipUpgradeOfferStatus
} from "@prisma/client";
import {
  buildContributorUpgradeOfferView,
  CONTRIBUTOR_BETA_OFFER_MESSAGE,
  evaluateContributorOfferAcceptance,
  type ContributorUpgradeOfferRecord
} from "@/modules/membership-policy/contributor-upgrade";
import {
  classifyContributorGrantCommand,
  contributorGrantCommandFingerprint,
  grantContributorBetaOfferSchema
} from "@/modules/membership-policy/contributor-upgrade.service";
import {
  getOperationalTierContract,
  normalizeOperationalTier,
  resolveMembershipAccess
} from "@/modules/membership-policy/membership-access";
import { launchAccessGrantSchema } from "@/modules/membership-policy/launch-access.service";

const now = new Date("2026-07-21T12:00:00.000Z");

function offer(
  overrides: Partial<ContributorUpgradeOfferRecord> = {}
): ContributorUpgradeOfferRecord {
  return {
    id: "offer-1",
    userId: "target-user",
    targetTier: MembershipTier.CONTRIBUTOR,
    status: MembershipUpgradeOfferStatus.OFFERED,
    currentPriceCents: 0,
    futurePriceCents: 499,
    validFrom: new Date("2026-07-20T12:00:00.000Z"),
    expiresAt: new Date("2026-07-22T12:00:00.000Z"),
    acceptedAt: null,
    revokedAt: null,
    createdByUserId: "admin-user",
    createdAt: new Date("2026-07-20T12:00:00.000Z"),
    ...overrides
  };
}

const activeEligibility = {
  userId: "target-user",
  tier: MembershipTier.CONTRIBUTOR,
  active: true,
  expiresAt: new Date("2026-07-22T12:00:00.000Z"),
  revokedAt: null
};

test("only Free and Contributor resolve operationally", () => {
  assert.equal(normalizeOperationalTier(MembershipTier.FREE), MembershipTier.FREE);
  assert.equal(normalizeOperationalTier(MembershipTier.CONTRIBUTOR), MembershipTier.CONTRIBUTOR);
  assert.equal(normalizeOperationalTier(MembershipTier.PROFESSIONAL), MembershipTier.FREE);
  assert.equal(normalizeOperationalTier(MembershipTier.AUDITOR), MembershipTier.FREE);
  assert.equal(normalizeOperationalTier(MembershipTier.ORG), MembershipTier.FREE);
  assert.equal(getOperationalTierContract(MembershipTier.FREE).capabilities.includes("market.promoteListing"), false);
  assert.equal(getOperationalTierContract(MembershipTier.CONTRIBUTOR).capabilities.includes("market.promoteListing"), true);
});

test("Contributor admin grants require a durable command id", () => {
  assert.equal(
    grantContributorBetaOfferSchema.safeParse({ targetUserId: "member-1" }).success,
    false
  );
  assert.equal(
    grantContributorBetaOfferSchema.safeParse({
      commandId: "grant-command-1",
      targetUserId: "member-1"
    }).success,
    true
  );
});

test("Contributor grant replay fingerprint binds the full command payload", () => {
  const base = contributorGrantCommandFingerprint({
    targetUserId: "member-1",
    expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    reason: "Beta cohort"
  });
  assert.equal(
    base,
    contributorGrantCommandFingerprint({
      targetUserId: "member-1",
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      reason: "Beta cohort"
    })
  );
  assert.notEqual(
    base,
    contributorGrantCommandFingerprint({
      targetUserId: "member-1",
      expiresAt: new Date("2026-08-02T00:00:00.000Z"),
      reason: "Beta cohort"
    })
  );
});

test("Contributor grant command ids replay only the identical administrator command", () => {
  const audit = {
    actorUserId: "admin-1",
    action: "contributor.offer.granted",
    metadata: {
      commandFingerprint: "fingerprint-1",
      offerId: "offer-1",
      result: {
        id: "offer-1",
        status: "OFFERED",
        currentPriceCents: 0,
        futureMonthlyPriceCents: 499,
        message: CONTRIBUTOR_BETA_OFFER_MESSAGE,
        expiresAt: null,
        canAccept: true
      }
    }
  };
  assert.deepEqual(
    classifyContributorGrantCommand({ audit, actorUserId: "admin-1", fingerprint: "fingerprint-1" }),
    {
      state: "replay",
      offer: {
        id: "offer-1",
        status: "OFFERED",
        currentPriceCents: 0,
        futureMonthlyPriceCents: 499,
        message: CONTRIBUTOR_BETA_OFFER_MESSAGE,
        expiresAt: null,
        canAccept: true
      }
    }
  );
  assert.deepEqual(
    classifyContributorGrantCommand({ audit, actorUserId: "admin-1", fingerprint: "changed" }),
    { state: "conflict" }
  );
  assert.deepEqual(
    classifyContributorGrantCommand({ audit, actorUserId: "admin-2", fingerprint: "fingerprint-1" }),
    { state: "conflict" }
  );
});

test("an offered upgrade is visible but never grants effective Contributor access", () => {
  const record = offer();
  const access = resolveMembershipAccess({
    persistedTier: MembershipTier.FREE,
    contributorOffer: {
      id: record.id,
      status: "OFFERED",
      grantedByAdminId: record.createdByUserId,
      grantedAt: record.createdAt,
      validFrom: record.validFrom,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: record.expiresAt,
      betaPriceCents: 0,
      futureMonthlyPriceCents: 499
    },
    now
  });

  assert.equal(access.operationalTier, MembershipTier.FREE);
  assert.equal(access.contributorOffer?.status, "OFFERED");
});

test("only the targeted eligible Free member may accept", () => {
  assert.deepEqual(
    evaluateContributorOfferAcceptance({
      actorUserId: "target-user",
      persistedTier: MembershipTier.FREE,
      offer: offer(),
      eligibility: activeEligibility,
      now
    }),
    { allowed: true, idempotent: false }
  );

  assert.deepEqual(
    evaluateContributorOfferAcceptance({
      actorUserId: "different-user",
      persistedTier: MembershipTier.FREE,
      offer: offer(),
      eligibility: activeEligibility,
      now
    }),
    { allowed: false, reason: "NOT_TARGET" }
  );

  assert.deepEqual(
    evaluateContributorOfferAcceptance({
      actorUserId: "target-user",
      persistedTier: MembershipTier.PROFESSIONAL,
      offer: offer(),
      eligibility: activeEligibility,
      now
    }),
    { allowed: false, reason: "NOT_FREE" }
  );
});

test("expired and revoked offers cannot be accepted or displayed", () => {
  const expired = offer({ expiresAt: new Date("2026-07-21T11:59:59.000Z") });
  const revoked = offer({
    status: MembershipUpgradeOfferStatus.REVOKED,
    revokedAt: new Date("2026-07-21T11:00:00.000Z")
  });

  assert.equal(buildContributorUpgradeOfferView(expired, now), null);
  assert.equal(buildContributorUpgradeOfferView(revoked, now), null);
  assert.deepEqual(
    evaluateContributorOfferAcceptance({
      actorUserId: "target-user",
      persistedTier: MembershipTier.FREE,
      offer: expired,
      eligibility: activeEligibility,
      now
    }),
    { allowed: false, reason: "EXPIRED" }
  );
});

test("beta offer view states free-now and future $4.99 pricing", () => {
  const view = buildContributorUpgradeOfferView(offer(), now);

  assert.equal(view?.currentPriceCents, 0);
  assert.equal(view?.futureMonthlyPriceCents, 499);
  assert.equal(view?.message, CONTRIBUTOR_BETA_OFFER_MESSAGE);
  assert.equal(view?.canAccept, true);
});

test("accepted offers are idempotent only after membership persisted as Contributor", () => {
  const accepted = offer({
    status: MembershipUpgradeOfferStatus.ACCEPTED,
    acceptedAt: new Date("2026-07-21T11:30:00.000Z")
  });

  assert.deepEqual(
    evaluateContributorOfferAcceptance({
      actorUserId: "target-user",
      persistedTier: MembershipTier.CONTRIBUTOR,
      offer: accepted,
      eligibility: { ...activeEligibility, active: false },
      now
    }),
    { allowed: true, idempotent: true }
  );
  assert.equal(
    resolveMembershipAccess({
      persistedTier: MembershipTier.FREE,
      contributorOffer: {
        id: accepted.id,
        status: "ACCEPTED",
        grantedByAdminId: accepted.createdByUserId,
        grantedAt: accepted.createdAt,
        validFrom: accepted.validFrom,
        acceptedAt: accepted.acceptedAt,
        revokedAt: null,
        expiresAt: accepted.expiresAt,
        betaPriceCents: 0,
        futureMonthlyPriceCents: 499
      },
      now
    }).operationalTier,
    MembershipTier.FREE
  );
});

test("launch-access grants require the caller's idempotent command id", () => {
  const base = {
    scope: "USER",
    userIdentifier: "member@example.com",
    sourceTier: MembershipTier.FREE,
    targetTier: MembershipTier.CONTRIBUTOR,
    durationValue: 30,
    durationUnit: "days",
    label: "Contributor beta",
    reason: "Beta tester"
  };
  assert.equal(launchAccessGrantSchema.safeParse(base).success, false);
  assert.equal(
    launchAccessGrantSchema.safeParse({ ...base, commandId: "grant-command-001" }).success,
    true
  );
});
