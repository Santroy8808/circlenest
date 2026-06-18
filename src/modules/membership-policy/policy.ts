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
  "writers.access",
  "fundraisers.create",
  "invites.send",
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
  "writers.access": false,
  "fundraisers.create": false,
  "invites.send": false,
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
    summary: "Core social access with limited creation and no paid creator tools.",
    features: withFeatures({
      "groups.create": true
    }),
    limits: {
      groupMemberCap: 10,
      marketListingsPer14Days: 0,
      marketListingPhotoCap: 0,
      fundraiserPerMonth: 0,
      storageLimitBytes: 100 * 1024 * 1024
    }
  },
  [MembershipTier.CONTRIBUTOR]: {
    tier: MembershipTier.CONTRIBUTOR,
    displayName: "Contributor",
    summary: "Creator access for community contributors with capped marketplace and fundraiser tools.",
    features: withFeatures({
      "feed.changeType": true,
      "groups.create": true,
      "groups.assignModerators": true,
      "groups.unlimitedSize": true,
      "events.create": true,
      "market.createListing": true,
      "market.createAd": true,
      "writers.access": true,
      "fundraisers.create": true,
      "invites.send": true,
      "moderation.siteEligible": true
    }),
    limits: {
      groupMemberCap: null,
      marketListingsPer14Days: 6,
      marketListingPhotoCap: 3,
      fundraiserPerMonth: 1,
      storageLimitBytes: 1024 * 1024 * 1024
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
    summary: "Auditor directory access with professional profile tools and selected creator features.",
    features: withFeatures({
      "feed.changeType": true,
      "groups.create": true,
      "groups.assignModerators": true,
      "groups.unlimitedSize": true,
      "events.create": true,
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
