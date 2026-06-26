import { MembershipTier, UserRole } from "@prisma/client";

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
  storageLimitBytes: number;
};

export type TierPolicy = {
  tier: MembershipTier;
  displayName: string;
  summary: string;
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
    summary: "Core Theta-Space access: stream posting, groups, messages, Market and job listings, business profile, and gallery.",
    features: withFeatures({
      "groups.create": true,
      "market.createListing": true,
      "market.storefront": true,
      "jobs.createListing": true
    }),
    limits: {
      groupMemberCap: 10,
      marketListingsPer14Days: 6,
      marketListingPhotoCap: 3,
      fundraiserPerMonth: 0,
      storageLimitBytes: 1024 * 1024 * 1024
    }
  },
  [MembershipTier.CONTRIBUTOR]: {
    tier: MembershipTier.CONTRIBUTOR,
    displayName: "Contributor",
    summary: "Community contributor access with expanded storage, capped marketplace tools, and Writers Corner.",
    features: withFeatures({
      "feed.changeType": true,
      "groups.create": true,
      "groups.assignModerators": true,
      "groups.unlimitedSize": true,
      "market.createListing": true,
      "market.createAd": true,
      "writers.access": true,
      "invites.send": true,
      "moderation.siteEligible": true
    }),
    limits: {
      groupMemberCap: null,
      marketListingsPer14Days: 6,
      marketListingPhotoCap: 3,
      fundraiserPerMonth: 0,
      storageLimitBytes: 2 * 1024 * 1024 * 1024
    }
  },
  [MembershipTier.PROFESSIONAL]: {
    tier: MembershipTier.PROFESSIONAL,
    displayName: "Professional",
    summary: "Business-grade tools with unlimited marketplace/job creation and storefront support.",
    features: withFeatures({
      "feed.changeType": true,
      "groups.create": true,
      "groups.assignModerators": true,
      "groups.unlimitedSize": true,
      "events.create": true,
      "market.createListing": true,
      "market.createAd": true,
      "market.storefront": true,
      "jobs.createListing": true,
      "ads.createGeneral": true,
      "writers.access": true,
      "fundraisers.create": true,
      "invites.send": true,
      "mail.massSend": true,
      "moderation.siteEligible": true
    }),
    limits: {
      groupMemberCap: null,
      marketListingsPer14Days: null,
      marketListingPhotoCap: null,
      fundraiserPerMonth: null,
      storageLimitBytes: 10 * 1024 * 1024 * 1024
    }
  },
  [MembershipTier.AUDITOR]: {
    tier: MembershipTier.AUDITOR,
    displayName: "Auditor",
    summary: "Auditor directory access with auditor profile tools and selected promotion features.",
    features: withFeatures({
      "feed.changeType": true,
      "groups.create": true,
      "groups.assignModerators": true,
      "groups.unlimitedSize": true,
      "auditors.createProfile": true,
      "ads.createGeneral": true,
      "invites.send": true,
      "moderation.siteEligible": true
    }),
    limits: {
      groupMemberCap: null,
      marketListingsPer14Days: 0,
      marketListingPhotoCap: 0,
      fundraiserPerMonth: 0,
      storageLimitBytes: 5 * 1024 * 1024 * 1024
    }
  },
  [MembershipTier.ORG]: {
    tier: MembershipTier.ORG,
    displayName: "Org",
    summary: "Admin-assigned org account for org profiles, events, fundraisers, and parishioner communications.",
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
      "org.profile": true
    }),
    limits: {
      groupMemberCap: null,
      marketListingsPer14Days: 0,
      marketListingPhotoCap: 0,
      fundraiserPerMonth: null,
      storageLimitBytes: 5 * 1024 * 1024 * 1024
    }
  }
};

export function getTierPolicy(tier: MembershipTier) {
  return tierPolicies[tier];
}

export function isMembershipFeatureKey(value: string): value is MembershipFeatureKey {
  return membershipFeatureKeys.includes(value as MembershipFeatureKey);
}

export function canRoleBypassFeature(role: UserRole, featureKey: MembershipFeatureKey) {
  if (role !== UserRole.ADMIN) return false;
  return featureKey === "admin.portal";
}
