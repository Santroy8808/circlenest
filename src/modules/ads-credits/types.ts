import { AdDestinationKind, AdPlacement, InterestCategory } from "@prisma/client";
import { z } from "zod";
import type { StripeCreditPackageView } from "@/modules/billing/stripe-credit-checkout.service";
import type { AdPricingPackageView } from "@/modules/platform-pricing/types";

export const adPlacementLabels: Record<AdPlacement, string> = {
  RIGHT_STREAM: "Right ad stream",
  BUSINESS_SPOTLIGHT: "Business spotlight",
  RESERVED_STREAM: "Reserved stream slot"
};

export const adPlacementOptions = Object.entries(adPlacementLabels).map(([value, label]) => ({
  value: value as AdPlacement,
  label
}));

export const interestCategoryLabels: Record<InterestCategory, string> = {
  AUDITING: "Auditing",
  TRAINING: "Training",
  EVENTS: "Events",
  MARKET: "The Market",
  JOBS: "Jobs",
  BUSINESS: "Business",
  WRITERS: "Writers",
  FUNDRAISERS: "Fundraisers",
  GROUPS: "Groups",
  FAMILY_COMMUNITY: "Family and community",
  TECH: "Tech",
  COURSE_SUPPLIES: "Course supplies"
};

export const interestCategoryOptions = Object.entries(interestCategoryLabels).map(([value, label]) => ({
  value: value as InterestCategory,
  label
}));

export const createAdCampaignSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(8).max(280),
  imageMediaAssetId: z.string().trim().optional().or(z.literal("")),
  externalImageUrl: z.string().trim().max(600).optional().or(z.literal("")),
  destinationKind: z.nativeEnum(AdDestinationKind).default(AdDestinationKind.STOREFRONT),
  marketListingId: z.string().trim().optional().or(z.literal("")),
  businessArticleId: z.string().trim().optional().or(z.literal("")),
  customDestinationUrl: z.string().trim().max(600).optional().or(z.literal("")),
  subscriberTargetManuscriptId: z.string().trim().optional().or(z.literal("")),
  placement: z.nativeEnum(AdPlacement).default(AdPlacement.RIGHT_STREAM),
  targetLocation: z.string().trim().max(120).optional(),
  targetInterestCategories: z.array(z.nativeEnum(InterestCategory)).max(6).default([]),
  pricingRuleKey: z.string().trim().min(2).max(120),
  totalBudgetCredits: z.coerce.number().int().min(1).max(100000).optional(),
  campaignDurationDays: z.coerce.number().int().min(1).max(365).optional(),
  dailyBudgetCredits: z.coerce.number().int().min(0).max(100000).optional().nullable()
});

export type AdCampaignCardView = {
  id: string;
  title: string;
  body: string;
  destinationUrl: string | null;
  imageUrl: string | null;
  destinationKind: AdDestinationKind;
  placement: AdPlacement;
  placementLabel: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED" | "ARCHIVED";
  targetLocation: string | null;
  targetInterestLabels: string[];
  subscriberTargetLabel: string | null;
  totalBudgetCredits: number;
  dailyBudgetCredits: number | null;
  spentCredits: number;
  remainingCredits: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

export type AdPlacementCardView = {
  id: string;
  title: string;
  body: string;
  destinationUrl: string | null;
  imageUrl: string | null;
  imageAlt: string;
  totalBudgetCredits: number;
  spentCredits: number;
  remainingCredits: number;
  rotationHoldMs: number;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
};

export type AdScheduleRunView = {
  id: string;
  placement: AdPlacement;
  placementLabel: string;
  scheduleDate: string;
  scheduledFrom: string;
  scheduledUntil: string;
  slotSeconds: number;
  slotCount: number;
  campaignCount: number;
  forced: boolean;
  reason: string | null;
  createdAt: string;
};

export type AdScheduleAdminView = {
  timeZone: string;
  slotSeconds: number;
  nextAutomaticRunAt: string;
  latestRuns: AdScheduleRunView[];
};

export type AdsManagerView = {
  canCreate: boolean;
  fundraiserOnly: boolean;
  reason?: string;
  platformCredits: number;
  campaigns: AdCampaignCardView[];
  destinationOptions: {
    storefronts: Array<{ id: string; label: string; href: string }>;
    marketListings: Array<{ id: string; label: string; href: string }>;
    businessArticles: Array<{ id: string; label: string; href: string }>;
    writerManuscripts: Array<{ id: string; label: string; href: string; subscriberCount: number }>;
  };
  pricingPackages: AdPricingPackageView[];
  creditPackages: StripeCreditPackageView[];
};
