import { resolveUserAccessPolicy } from "@/lib/policy/tier-policy";
import { prisma } from "@/lib/db/prisma";
import { sha256 } from "@/lib/security/tokens";

export const INVITATION_EXPIRY_DAYS = 7;
export const NORMAL_MEMBER_INVITE_LIMIT = 5;
export const SIGNUP_VALID_INVITATION_STATUSES = ["PENDING"] as const;
const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 183;

const FINAL_INVITATION_STATUSES = new Set(["ACCEPTED", "EXPIRED", "REVOKED", "REJECTED"]);

export type InvitationCreatorPolicySource = {
  createdAt?: Date | string | null;
  role?: string | null;
  subscriptionTier?: string | null;
  inviteLimitException?: boolean | null;
} | null | undefined;

export type InvitationCreatorAccess = Readonly<{
  canInvite: boolean;
  inviteLimit: number | null;
  hasInviteLimitException: boolean;
  reason: string | null;
}>;

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isAtLeastSixMonthsOld(createdAt: Date | string | null | undefined) {
  const created = toDate(createdAt);
  if (!created) return false;
  return Date.now() - created.getTime() >= SIX_MONTHS_MS;
}

export function resolveInvitationCreatorAccess(user: InvitationCreatorPolicySource): InvitationCreatorAccess {
  const policy = resolveUserAccessPolicy(user);
  const hasInviteLimitException = Boolean(user?.inviteLimitException);

  if (policy.isAdmin) {
    return {
      canInvite: true,
      inviteLimit: null,
      hasInviteLimitException,
      reason: null,
    };
  }

  if (policy.tier === "FREE") {
    return {
      canInvite: false,
      inviteLimit: NORMAL_MEMBER_INVITE_LIMIT,
      hasInviteLimitException,
      reason: "Free members cannot invite.",
    };
  }

  if (policy.tier === "PLUS" || policy.tier === "PRO" || policy.tier === "AUDITOR") {
    if (!isAtLeastSixMonthsOld(user?.createdAt)) {
      return {
        canInvite: false,
        inviteLimit: NORMAL_MEMBER_INVITE_LIMIT,
        hasInviteLimitException,
        reason: "Invite access unlocks after 6 months.",
      };
    }

    return {
      canInvite: true,
      inviteLimit: NORMAL_MEMBER_INVITE_LIMIT,
      hasInviteLimitException,
      reason: null,
    };
  }

  return {
    canInvite: false,
    inviteLimit: NORMAL_MEMBER_INVITE_LIMIT,
    hasInviteLimitException,
    reason: "Invite access unavailable.",
  };
}

export function normalizeInvitationStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "PENDING" || normalized === "ACCEPTED" || normalized === "EXPIRED" || normalized === "REVOKED" || normalized === "REJECTED" || normalized === "RESUBMITTED" || normalized === "PENDING_REVIEW") {
    return normalized;
  }
  return "PENDING";
}

export function normalizeInvitationReviewStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "NOT_REQUIRED" || normalized === "PENDING" || normalized === "APPROVED" || normalized === "REJECTED") {
    return normalized;
  }
  return "NOT_REQUIRED";
}

export function isInvitationLimitReached(currentCount: number, access: InvitationCreatorAccess) {
  if (access.canInvite && !access.hasInviteLimitException && access.inviteLimit !== null) {
    return currentCount >= access.inviteLimit;
  }
  return false;
}

export function isInvitationFinalStatus(value: string | null | undefined) {
  return FINAL_INVITATION_STATUSES.has(String(value ?? "").trim().toUpperCase());
}

export async function findSignupInvitationByCode(input: {
  inviteCode: string;
  inviteeEmail: string;
}) {
  const tokenHash = sha256(input.inviteCode);
  return prisma.membershipInvitation.findFirst({
    where: {
      tokenHash,
      inviteeEmail: input.inviteeEmail,
      status: { in: Array.from(SIGNUP_VALID_INVITATION_STATUSES) },
      reviewStatus: "APPROVED",
      expiresAt: { gt: new Date() },
      revokedAt: null,
      rejectedAt: null,
      acceptedAt: null,
    },
  });
}
