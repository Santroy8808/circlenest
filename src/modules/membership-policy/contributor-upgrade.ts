import { MembershipTier, MembershipUpgradeOfferStatus } from "@prisma/client";
import {
  isContributorOfferEligible,
  type ContributorOffer
} from "@/modules/membership-policy/membership-access";

export const CONTRIBUTOR_BETA_CURRENT_PRICE_CENTS = 0 as const;
export const CONTRIBUTOR_FUTURE_MONTHLY_PRICE_CENTS = 499 as const;
export const CONTRIBUTOR_BETA_OFFER_MESSAGE =
  "Contributor is free for beta testers and is planned to cost $4.99/month in the future.";
export const CONTRIBUTOR_BETA_MEMBER_MESSAGE =
  "Contributor is free during beta testing and is planned to cost $4.99/month in the future.";

export type ContributorUpgradeOfferRecord = {
  id: string;
  userId: string;
  targetTier: MembershipTier;
  status: MembershipUpgradeOfferStatus;
  currentPriceCents: number;
  futurePriceCents: number | null;
  validFrom: Date;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
};

export type ContributorEligibilityRecord = {
  userId: string;
  tier: MembershipTier;
  active: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type ContributorUpgradeOfferView = {
  id: string;
  status: "OFFERED" | "ACCEPTED";
  currentPriceCents: 0;
  futureMonthlyPriceCents: 499;
  message: string;
  expiresAt: string | null;
  canAccept: boolean;
};

export function toContributorOffer(record: ContributorUpgradeOfferRecord): ContributorOffer {
  return {
    id: record.id,
    status: record.status,
    grantedByAdminId: record.createdByUserId,
    grantedAt: record.createdAt,
    validFrom: record.validFrom,
    acceptedAt: record.acceptedAt,
    revokedAt: record.revokedAt,
    expiresAt: record.expiresAt,
    betaPriceCents: CONTRIBUTOR_BETA_CURRENT_PRICE_CENTS,
    futureMonthlyPriceCents: CONTRIBUTOR_FUTURE_MONTHLY_PRICE_CENTS
  };
}

export function isContributorEligibilityActive(
  eligibility: ContributorEligibilityRecord | null | undefined,
  now = new Date()
) {
  return Boolean(
    eligibility &&
      eligibility.tier === MembershipTier.CONTRIBUTOR &&
      eligibility.active &&
      eligibility.revokedAt === null &&
      (eligibility.expiresAt === null || eligibility.expiresAt.getTime() > now.getTime())
  );
}

export type ContributorOfferAcceptanceDecision =
  | { allowed: true; idempotent: boolean }
  | { allowed: false; reason: "NOT_TARGET" | "NOT_FREE" | "NOT_ELIGIBLE" | "EXPIRED" | "REVOKED" };

export function evaluateContributorOfferAcceptance(input: {
  actorUserId: string;
  persistedTier: MembershipTier;
  offer: ContributorUpgradeOfferRecord;
  eligibility: ContributorEligibilityRecord | null;
  now?: Date;
}): ContributorOfferAcceptanceDecision {
  const now = input.now ?? new Date();

  if (input.offer.userId !== input.actorUserId) return { allowed: false, reason: "NOT_TARGET" };
  if (input.offer.status === MembershipUpgradeOfferStatus.REVOKED || input.offer.revokedAt) {
    return { allowed: false, reason: "REVOKED" };
  }
  if (input.offer.status === MembershipUpgradeOfferStatus.EXPIRED) {
    return { allowed: false, reason: "EXPIRED" };
  }
  if (input.offer.status === MembershipUpgradeOfferStatus.ACCEPTED) {
    return input.persistedTier === MembershipTier.CONTRIBUTOR
      ? { allowed: true, idempotent: true }
      : { allowed: false, reason: "NOT_FREE" };
  }
  if (input.persistedTier !== MembershipTier.FREE) return { allowed: false, reason: "NOT_FREE" };
  if (input.offer.validFrom.getTime() > now.getTime()) return { allowed: false, reason: "NOT_ELIGIBLE" };

  const offer = toContributorOffer(input.offer);
  if (!isContributorOfferEligible(offer, now)) return { allowed: false, reason: "EXPIRED" };
  if (!isContributorEligibilityActive(input.eligibility, now)) {
    return { allowed: false, reason: "NOT_ELIGIBLE" };
  }

  return { allowed: true, idempotent: false };
}

export function buildContributorUpgradeOfferView(
  record: ContributorUpgradeOfferRecord,
  now = new Date()
): ContributorUpgradeOfferView | null {
  const offer = toContributorOffer(record);

  if (record.status === MembershipUpgradeOfferStatus.OFFERED && isContributorOfferEligible(offer, now)) {
    return {
      id: record.id,
      status: "OFFERED",
      currentPriceCents: CONTRIBUTOR_BETA_CURRENT_PRICE_CENTS,
      futureMonthlyPriceCents: CONTRIBUTOR_FUTURE_MONTHLY_PRICE_CENTS,
      message: CONTRIBUTOR_BETA_OFFER_MESSAGE,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      canAccept: true
    };
  }

  if (record.status === MembershipUpgradeOfferStatus.ACCEPTED && !record.revokedAt) {
    return {
      id: record.id,
      status: "ACCEPTED",
      currentPriceCents: CONTRIBUTOR_BETA_CURRENT_PRICE_CENTS,
      futureMonthlyPriceCents: CONTRIBUTOR_FUTURE_MONTHLY_PRICE_CENTS,
      message: CONTRIBUTOR_BETA_MEMBER_MESSAGE,
      expiresAt: null,
      canAccept: false
    };
  }

  return null;
}
