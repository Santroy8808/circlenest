import { MembershipTier } from "@prisma/client";
import type { OperationalTier } from "@/modules/membership-policy/membership-access";

export const operationalMembershipTransitionSources = [
  "ADMIN_CORRECTION",
  "CONTRIBUTOR_ACCEPTANCE",
  "PRIVILEGED_PROVISIONING",
  "STRIPE_SUBSCRIPTION"
] as const;

export type OperationalMembershipTransitionSource =
  (typeof operationalMembershipTransitionSources)[number];

export type OperationalMembershipSnapshot = {
  exists: boolean;
  tier: MembershipTier;
  storageLimitBytes: bigint | null;
  platformCredits: number;
  updatedAt: Date | null;
};

export type OperationalMembershipTransitionInput = {
  userId: string;
  targetTier: OperationalTier;
  source: OperationalMembershipTransitionSource;
  now?: Date;
  actorUserId?: string | null;
  reason?: string | null;
  expectedCurrentTier?: MembershipTier;
  expectedCurrentUpdatedAt?: Date | null;
};

export type OperationalMembershipTransitionResult = {
  before: OperationalMembershipSnapshot;
  after: Omit<OperationalMembershipSnapshot, "exists" | "storageLimitBytes"> & {
    exists: true;
    storageLimitBytes: bigint;
    updatedAt: Date;
  };
  tierChanged: boolean;
  revokedContributorOfferCount: number;
  terminatedAcceptedContributorOfferCount: number;
  deactivatedContributorEligibilityCount: number;
  monthlyCredits: {
    allocated: boolean;
    ledgerEntryId: string;
    idempotencyKey: string;
    amount: number;
    periodKey: string;
    balanceAfter: number | null;
  } | null;
};

export function evaluateOperationalMembershipTransitionExpectation(input: {
  currentTier: MembershipTier;
  currentUpdatedAt?: Date | null;
  expectedCurrentTier?: MembershipTier;
  expectedCurrentUpdatedAt?: Date | null;
}) {
  if (
    input.expectedCurrentTier !== undefined &&
    input.currentTier !== input.expectedCurrentTier
  ) {
    return {
      allowed: false as const,
      error: "Membership changed before this command could be applied. Refresh the account and try again."
    };
  }
  if (
    input.expectedCurrentUpdatedAt !== undefined &&
    input.currentUpdatedAt?.getTime() !== input.expectedCurrentUpdatedAt?.getTime()
  ) {
    return {
      allowed: false as const,
      error: "Membership changed before this command could be applied. Refresh the account and try again."
    };
  }
  return { allowed: true as const };
}

export function contributorEligibilityDispositionForTransition(
  source: OperationalMembershipTransitionSource
) {
  return source === "CONTRIBUTOR_ACCEPTANCE" ? "CONSUMED" as const : "REVOKED" as const;
}
