import { MembershipTier, UserRole } from "@prisma/client";
import { isAdminRole } from "@/lib/platform/roles";

export const membershipFeatureKeys = [
  "feed.changeType",
  "groups.create",
  "groups.assignModerators",
  "groups.unlimitedSize",
  "events.create",
  "market.createListing",
  "market.createAd",
  "market.storefront",
  "jobs.browse",
  "jobs.createListing",
  "auditors.browse",
  "auditors.createProfile",
  "ads.createGeneral",
  "ads.createFundraiser",
  "writers.access",
  "fundraisers.create",
  "invites.send",
  "invites.bulkSend",
  "support.createRequest",
  "mail.massSend",
  "mail.orgMassSend",
  "org.profile",
  "moderation.siteEligible",
  "admin.portal"
] as const;

export type MembershipFeatureKey = (typeof membershipFeatureKeys)[number];

export type TierLimits = {
  groupMemberCap: number | null;
  marketListingsPer14Days: number | null;
  marketListingPhotoCap: number | null;
  fundraiserPerMonth: number | null;
  marketActiveListingCap: number | null;
  storageLimitBytes: number;
};

export type TierPolicy = {
  tier: MembershipTier;
  displayName: string;
  summary: string;
  operational: boolean;
  publiclyListed?: boolean;
  features: Record<MembershipFeatureKey, boolean>;
  limits: TierLimits;
};

const baseFeatures: Record<MembershipFeatureKey, boolean> = {
  "feed.changeType": false,
  "groups.create": false,
  "groups.assignModerators": false,
  "groups.unlimitedSize": false,
  "events.create": false,
  "market.createListing": false,
  "market.createAd": false,
  "market.storefront": false,
  "jobs.browse": true,
  "jobs.createListing": false,
  "auditors.browse": true,
  "auditors.createProfile": false,
  "ads.createGeneral": false,
  "ads.createFundraiser": false,
  "writers.access": false,
  "fundraisers.create": false,
  "invites.send": false,
  "invites.bulkSend": false,
  "support.createRequest": false,
  "mail.massSend": false,
  "mail.orgMassSend": false,
  "org.profile": false,
  "moderation.siteEligible": false,
  "admin.portal": false
};

function withFeatures(features: Partial<Record<MembershipFeatureKey, boolean>>) {
  return { ...baseFeatures, ...features };
}

export const tierPolicies: Record<MembershipTier, TierPolicy> = {
  [MembershipTier.FREE]: {
    tier: MembershipTier.FREE,
    displayName: "Free",
    summary: "Core Theta-Space access: stream posting, groups, messages, personal Market and job listings, and gallery.",
    operational: true,
    features: withFeatures({
      "groups.create": true,
      "groups.assignModerators": true,
      "market.createListing": true,
      "jobs.createListing": true,
      "moderation.siteEligible": true
    }),
    limits: {
      groupMemberCap: null,
      marketListingsPer14Days: null,
      marketListingPhotoCap: 3,
      fundraiserPerMonth: 0,
      marketActiveListingCap: 1,
      storageLimitBytes: 200 * 1024 * 1024
    }
  },
  [MembershipTier.CONTRIBUTOR]: {
    tier: MembershipTier.CONTRIBUTOR,
    displayName: "Contributor",
    summary: "Community contributor access with expanded storage, capped marketplace tools, and Writers Corner.",
    operational: true,
    features: withFeatures({
      "feed.changeType": true,
      "groups.create": true,
      "groups.assignModerators": true,
      "groups.unlimitedSize": true,
      "market.createListing": true,
      "market.createAd": true,
      "market.storefront": false,
      "jobs.browse": false,
      "jobs.createListing": false,
      "auditors.createProfile": false,
      "writers.access": true,
      "support.createRequest": true,
      "moderation.siteEligible": true
    }),
    limits: {
      groupMemberCap: null,
      marketListingsPer14Days: 6,
      marketListingPhotoCap: 3,
      fundraiserPerMonth: 0,
      marketActiveListingCap: null,
      storageLimitBytes: 2 * 1024 * 1024 * 1024
    }
  },
  [MembershipTier.PROFESSIONAL]: {
    tier: MembershipTier.PROFESSIONAL,
    displayName: "Professional",
    summary: "Business-grade tools with unlimited marketplace/job creation and storefront support.",
    operational: false,
    publiclyListed: false,
    features: withFeatures({
      "feed.changeType": true,
      "groups.create": true,
      "groups.assignModerators": true,
      "groups.unlimitedSize": true,
      "market.createListing": true,
      "market.createAd": true,
      "market.storefront": true,
      "jobs.createListing": true,
      "ads.createGeneral": true,
      "writers.access": true,
      "support.createRequest": true,
      "moderation.siteEligible": true
    }),
    limits: {
      groupMemberCap: null,
      marketListingsPer14Days: null,
      marketListingPhotoCap: null,
      fundraiserPerMonth: null,
      marketActiveListingCap: null,
      storageLimitBytes: 10 * 1024 * 1024 * 1024
    }
  },
  [MembershipTier.AUDITOR]: {
    tier: MembershipTier.AUDITOR,
    displayName: "Auditor",
    summary: "Auditor service access with storefront, creator, job, Market promotion, and general advertising tools.",
    operational: false,
    publiclyListed: false,
    features: withFeatures({
      "feed.changeType": true,
      "groups.create": true,
      "groups.assignModerators": true,
      "groups.unlimitedSize": true,
      "market.createListing": true,
      "market.createAd": true,
      "market.storefront": true,
      "jobs.createListing": true,
      "ads.createGeneral": true,
      "writers.access": true,
      "support.createRequest": true,
      "moderation.siteEligible": true
    }),
    limits: {
      groupMemberCap: null,
      marketListingsPer14Days: 6,
      marketListingPhotoCap: 3,
      fundraiserPerMonth: 0,
      marketActiveListingCap: null,
      storageLimitBytes: 5 * 1024 * 1024 * 1024
    }
  },
  [MembershipTier.ORG]: {
    tier: MembershipTier.ORG,
    displayName: "Org",
    summary: "Admin-assigned org account for org profiles, events, fundraisers, and parishioner communications.",
    operational: false,
    publiclyListed: false,
    features: withFeatures({
      "feed.changeType": true,
      "groups.create": true,
      "events.create": true,
      "auditors.createProfile": true,
      "ads.createFundraiser": true,
      "writers.access": true,
      "fundraisers.create": true,
      "mail.orgMassSend": true,
      "org.profile": true,
      "support.createRequest": true
    }),
    limits: {
      groupMemberCap: null,
      marketListingsPer14Days: 0,
      marketListingPhotoCap: 0,
      fundraiserPerMonth: null,
      marketActiveListingCap: null,
      storageLimitBytes: 5 * 1024 * 1024 * 1024
    }
  }
};

export function getTierPolicy(tier: MembershipTier) {
  return tierPolicies[tier];
}

export function isOperationalMembershipTier(tier: MembershipTier) {
  return tierPolicies[tier].operational;
}

export function normalizeOperationalMembershipTier(tier?: MembershipTier | null) {
  return tier && isOperationalMembershipTier(tier) ? tier : MembershipTier.FREE;
}

export function isMembershipFeatureKey(value: string): value is MembershipFeatureKey {
  return membershipFeatureKeys.includes(value as MembershipFeatureKey);
}

export function canRoleBypassFeature(role: UserRole, featureKey: MembershipFeatureKey) {
  if (!isAdminRole(role)) return false;
  return (
    featureKey === "admin.portal" ||
    featureKey === "invites.send" ||
    featureKey === "invites.bulkSend" ||
    featureKey === "support.createRequest"
  );
}
