export type MembershipTier = "FREE" | "PLUS" | "PRO" | "AUDITOR" | "ADMIN";

export type TierPolicy = Readonly<{
  tier: MembershipTier;
  isAdmin: boolean;
  canCreateEvent: boolean;
  canCreateBazaarListing: boolean;
  canCreateHiringPost: boolean;
  canCreateFundRaiser: boolean;
  canChangeFeedType: boolean;
  canCreateGroup: boolean;
  maxCreatedGroupMembers: number | null;
  canAssignGroupModerators: boolean;
  canBeSiteModerator: boolean;
  canCreateAds: boolean;
  monthlyAdCredits: number;
  storageLimitBytes: number;
}>;

type UserPolicySource = {
  subscriptionTier?: string | null;
  role?: string | null;
} | null | undefined;

const FREE_STORAGE_LIMIT_BYTES = 100 * 1024 * 1024;
const PLUS_STORAGE_LIMIT_BYTES = 250 * 1024 * 1024; // Placeholder until the tier quota is finalized.
const PRO_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // Placeholder until the tier quota is finalized.
const AUDITOR_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // Same as Pro until a separate quota is defined.
const ADMIN_STORAGE_LIMIT_BYTES = Number.MAX_SAFE_INTEGER;
const ACTIVIST_BAZAAR_WEEKLY_LIMIT = 3;
const ACTIVIST_BAZAAR_ROLLING_LIMIT = 6;
const ACTIVIST_BAZAAR_MAX_IMAGES = 3;
const ACTIVIST_BAZAAR_LIFETIME_DAYS = 14;
const ACTIVIST_FUNDRAISER_MONTHLY_LIMIT = 1;

const PLUS_MONTHLY_AD_CREDITS = 0;
const PRO_MONTHLY_AD_CREDITS = 25; // Placeholder until ad-credit policy is finalized.
const AUDITOR_MONTHLY_AD_CREDITS = 50; // Auditors receive a boosted monthly ad grant.
const ADMIN_MONTHLY_AD_CREDITS = Number.MAX_SAFE_INTEGER;

const TIER_POLICY_MATRIX: Record<MembershipTier, TierPolicy> = {
  FREE: {
    tier: "FREE",
    isAdmin: false,
    canCreateEvent: false,
    canCreateBazaarListing: false,
    canCreateHiringPost: false,
    canCreateFundRaiser: false,
    canChangeFeedType: false,
    canCreateGroup: true,
    maxCreatedGroupMembers: 10,
    canAssignGroupModerators: false,
    canBeSiteModerator: false,
    canCreateAds: false,
    monthlyAdCredits: 0,
    storageLimitBytes: FREE_STORAGE_LIMIT_BYTES,
  },
  PLUS: {
    tier: "PLUS",
    isAdmin: false,
    canCreateEvent: true,
    canCreateBazaarListing: true,
    canCreateHiringPost: false,
    canCreateFundRaiser: true,
    canChangeFeedType: true,
    canCreateGroup: true,
    maxCreatedGroupMembers: null,
    canAssignGroupModerators: true,
    canBeSiteModerator: true,
    canCreateAds: false,
    monthlyAdCredits: PLUS_MONTHLY_AD_CREDITS,
    storageLimitBytes: PLUS_STORAGE_LIMIT_BYTES,
  },
  PRO: {
    tier: "PRO",
    isAdmin: false,
    canCreateEvent: true,
    canCreateBazaarListing: true,
    canCreateHiringPost: true,
    canCreateFundRaiser: true,
    canChangeFeedType: true,
    canCreateGroup: true,
    maxCreatedGroupMembers: null,
    canAssignGroupModerators: true,
    canBeSiteModerator: true,
    canCreateAds: true,
    monthlyAdCredits: PRO_MONTHLY_AD_CREDITS,
    storageLimitBytes: PRO_STORAGE_LIMIT_BYTES,
  },
  AUDITOR: {
    tier: "AUDITOR",
    isAdmin: false,
    canCreateEvent: true,
    canCreateBazaarListing: true,
    canCreateHiringPost: false,
    canCreateFundRaiser: true,
    canChangeFeedType: true,
    canCreateGroup: true,
    maxCreatedGroupMembers: null,
    canAssignGroupModerators: true,
    canBeSiteModerator: true,
    canCreateAds: true,
    monthlyAdCredits: AUDITOR_MONTHLY_AD_CREDITS,
    storageLimitBytes: AUDITOR_STORAGE_LIMIT_BYTES,
  },
  ADMIN: {
    tier: "ADMIN",
    isAdmin: true,
    canCreateEvent: true,
    canCreateBazaarListing: true,
    canCreateHiringPost: true,
    canCreateFundRaiser: true,
    canChangeFeedType: true,
    canCreateGroup: true,
    maxCreatedGroupMembers: null,
    canAssignGroupModerators: true,
    canBeSiteModerator: true,
    canCreateAds: true,
    monthlyAdCredits: ADMIN_MONTHLY_AD_CREDITS,
    storageLimitBytes: ADMIN_STORAGE_LIMIT_BYTES,
  },
};

const LEGACY_TIER_ALIASES: Record<string, MembershipTier> = {
  BUSINESS: "PLUS",
  SILVER: "PLUS",
  GOLD: "PRO",
  DIAMOND: "PRO",
};

function normalizeTierKey(value: string) {
  return value.trim().toUpperCase();
}

function isAdminRole(role: string | null | undefined) {
  return normalizeTierKey(role ?? "") === "ADMIN";
}

export function normalizeMembershipTier(value: string | null | undefined): MembershipTier {
  const normalized = normalizeTierKey(value ?? "");
  if (normalized in TIER_POLICY_MATRIX) return normalized as MembershipTier;
  return LEGACY_TIER_ALIASES[normalized] ?? "FREE";
}

export function getTierPolicy(tier: MembershipTier | string | null | undefined): TierPolicy {
  return TIER_POLICY_MATRIX[normalizeMembershipTier(tier)];
}

export function resolveUserAccessPolicy(user: UserPolicySource): TierPolicy {
  if (isAdminRole(user?.role)) {
    return TIER_POLICY_MATRIX.ADMIN;
  }
  return getTierPolicy(user?.subscriptionTier);
}

export function canCreateEvent(policy: TierPolicy) {
  return policy.canCreateEvent;
}

export function canCreateBazaarListing(policy: TierPolicy) {
  return policy.canCreateBazaarListing;
}

export function canCreateHiringPost(policy: TierPolicy) {
  return policy.canCreateHiringPost;
}

export function canCreateFundRaiser(policy: TierPolicy) {
  return policy.canCreateFundRaiser;
}

export function canChangeFeedType(policy: TierPolicy) {
  return policy.canChangeFeedType;
}

export function canCreateGroup(policy: TierPolicy) {
  return policy.canCreateGroup;
}

export function getMaxCreatedGroupMembers(policy: TierPolicy) {
  return policy.maxCreatedGroupMembers;
}

export function canAssignGroupModerators(policy: TierPolicy) {
  return policy.canAssignGroupModerators;
}

export function requiresTwoFactorForTier(tier: MembershipTier | string | null | undefined) {
  const normalized = normalizeMembershipTier(tier);
  return normalized === "PLUS" || normalized === "PRO" || normalized === "AUDITOR";
}

export function canBeSiteModerator(policy: TierPolicy) {
  return policy.canBeSiteModerator;
}

export function canCreateAds(policy: TierPolicy) {
  return policy.canCreateAds;
}

export function getMonthlyAdCredits(policy: TierPolicy) {
  return policy.monthlyAdCredits;
}

export function getStorageLimitBytes(policy: TierPolicy) {
  return policy.storageLimitBytes;
}

export function getDisplayMembershipTierName(tier: MembershipTier | string | null | undefined) {
  const normalized = normalizeMembershipTier(tier);
  if (normalized === "FREE") return "Free";
  if (normalized === "PLUS") return "Activist";
  if (normalized === "PRO") return "Biz";
  if (normalized === "AUDITOR") return "Auditor";
  return "Admin";
}

export function getBazaarListingWeeklyLimit(policy: TierPolicy) {
  return policy.tier === "PLUS" ? ACTIVIST_BAZAAR_WEEKLY_LIMIT : null;
}

export function getBazaarListingRollingLimit(policy: TierPolicy) {
  return policy.tier === "PLUS" ? ACTIVIST_BAZAAR_ROLLING_LIMIT : null;
}

export function getBazaarListingMaxImageCount(policy: TierPolicy) {
  return policy.tier === "PLUS" ? ACTIVIST_BAZAAR_MAX_IMAGES : null;
}

export function getBazaarListingLifetimeDays(policy: TierPolicy) {
  return policy.tier === "PLUS" ? ACTIVIST_BAZAAR_LIFETIME_DAYS : null;
}

export function getMonthlyFundraiserLimit(policy: TierPolicy) {
  return policy.tier === "PLUS" ? ACTIVIST_FUNDRAISER_MONTHLY_LIMIT : null;
}
