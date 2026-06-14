import { canCreateAds, type TierPolicy } from "@/lib/policy/tier-policy";

export const AD_CAMPAIGN_TARGET_TYPES = ["MARKET_LISTING", "EVENT_LISTING", "JOB_LISTING", "FUNDRAISER_LISTING", "BUSINESS_PROFILE"] as const;
export type AdCampaignTargetType = (typeof AD_CAMPAIGN_TARGET_TYPES)[number];

export const AD_CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number];

export type AdCampaignSummary = Readonly<{
  id: string;
  title: string;
  status: string;
  budgetAmountCents: number;
  currency: string;
  platformCreditBudget: number;
  startsAt: string | null;
  endsAt: string | null;
  dailyBudgetCents: number | null;
  targetType: string;
  targetId: string | null;
  imageUrl: string | null;
  boostFactor: number;
  manualAdminBoost: number;
  manualAdminDemotion: number;
  finalRankScore: number;
  createdAt: string;
  updatedAt: string;
  businessProfile: Readonly<{
    id: string;
    businessName: string;
    storefrontSlug: string | null;
  }> | null;
  landingArticle: Readonly<{
    id: string;
    title: string;
    body: string;
    heroImageUrl: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    status: string;
  }> | null;
  metrics: Readonly<{
    impressions: number;
    clicks: number;
    engagements: number;
  }>;
}>;

type AdCampaignSource = {
  id: string;
  title: string;
  status: string;
  budgetAmountCents: number;
  currency: string;
  platformCreditBudget: number;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  dailyBudgetCents: number | null;
  targetType: string;
  targetId: string | null;
  imageUrl: string | null;
  boostFactor?: number | null;
  manualAdminBoost?: number | null;
  manualAdminDemotion?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  businessProfile?: {
    id: string;
    businessName: string;
    storefrontSlug: string | null;
  } | null;
  landingArticle?: {
    id: string;
    title: string;
    body: string;
    heroImageUrl: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    status: string;
  } | null;
  _count?: {
    impressions?: number;
    clicks?: number;
    engagements?: number;
  };
};

function normalizeDate(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function canCreateAdCampaign(policy: TierPolicy) {
  return canCreateAds(policy);
}

export function isAdCampaignTargetType(value: string): value is AdCampaignTargetType {
  return AD_CAMPAIGN_TARGET_TYPES.includes(value as AdCampaignTargetType);
}

export function normalizeCampaignStatus(value: string | null | undefined): AdCampaignStatus {
  const normalized = value?.trim().toUpperCase();
  return AD_CAMPAIGN_STATUSES.includes(normalized as AdCampaignStatus) ? (normalized as AdCampaignStatus) : "DRAFT";
}

export function calculateAdRankScore(input: {
  budgetAmountCents: number;
  platformCreditBudget: number;
  boostFactor?: number | null;
  manualAdminBoost?: number | null;
  manualAdminDemotion?: number | null;
  impressions?: number;
  clicks?: number;
  engagements?: number;
  createdAt: Date | string;
}) {
  const spendWeight = Math.log10(Math.max(1, input.budgetAmountCents + input.platformCreditBudget * 100));
  const engagementWeight = (input.clicks ?? 0) * 2 + (input.engagements ?? 0) - Math.min(input.impressions ?? 0, 5000) / 5000;
  const ageHours = Math.max(1, (Date.now() - new Date(input.createdAt).getTime()) / 36e5);
  const recencyWeight = Math.max(0.1, 1 / Math.sqrt(ageHours));
  const boostWeight = (input.boostFactor ?? 1) + (input.manualAdminBoost ?? 0) - (input.manualAdminDemotion ?? 0);
  return Number(Math.max(0, spendWeight + engagementWeight + recencyWeight + boostWeight).toFixed(3));
}

export function serializeAdCampaign(campaign: AdCampaignSource): AdCampaignSummary {
  return {
    id: campaign.id,
    title: campaign.title,
    status: campaign.status,
    budgetAmountCents: campaign.budgetAmountCents,
    currency: campaign.currency,
    platformCreditBudget: campaign.platformCreditBudget,
    startsAt: normalizeDate(campaign.startsAt),
    endsAt: normalizeDate(campaign.endsAt),
    dailyBudgetCents: campaign.dailyBudgetCents,
    targetType: campaign.targetType,
    targetId: campaign.targetId,
    imageUrl: campaign.imageUrl,
    boostFactor: campaign.boostFactor ?? 1,
    manualAdminBoost: campaign.manualAdminBoost ?? 0,
    manualAdminDemotion: campaign.manualAdminDemotion ?? 0,
    finalRankScore: calculateAdRankScore({
      budgetAmountCents: campaign.budgetAmountCents,
      platformCreditBudget: campaign.platformCreditBudget,
      boostFactor: campaign.boostFactor,
      manualAdminBoost: campaign.manualAdminBoost,
      manualAdminDemotion: campaign.manualAdminDemotion,
      impressions: campaign._count?.impressions,
      clicks: campaign._count?.clicks,
      engagements: campaign._count?.engagements,
      createdAt: campaign.createdAt,
    }),
    createdAt: normalizeDate(campaign.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeDate(campaign.updatedAt) ?? new Date().toISOString(),
    businessProfile: campaign.businessProfile
      ? {
          id: campaign.businessProfile.id,
          businessName: campaign.businessProfile.businessName,
          storefrontSlug: campaign.businessProfile.storefrontSlug,
        }
      : null,
    landingArticle: campaign.landingArticle
      ? {
          id: campaign.landingArticle.id,
          title: campaign.landingArticle.title,
          body: campaign.landingArticle.body,
          heroImageUrl: campaign.landingArticle.heroImageUrl,
          ctaLabel: campaign.landingArticle.ctaLabel,
          ctaUrl: campaign.landingArticle.ctaUrl,
          status: campaign.landingArticle.status,
        }
      : null,
    metrics: {
      impressions: campaign._count?.impressions ?? 0,
      clicks: campaign._count?.clicks ?? 0,
      engagements: campaign._count?.engagements ?? 0,
    },
  };
}

export function serializeAdCampaigns(campaigns: AdCampaignSource[]) {
  return campaigns.map((campaign) => serializeAdCampaign(campaign));
}
