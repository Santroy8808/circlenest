import { AdDeliveryEventType, AdDestinationKind, AdPlacement, InterestCategory } from "@prisma/client";
import { z } from "zod";
import { cuidIdSchema, optionalHttpsUrlSchema } from "@/lib/platform/validation";
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
  COURSE_SUPPLIES: "Course supplies",
  BOOKS: "Books",
  DIANETICS: "Dianetics",
  SCIENTOLOGY: "Scientology",
  LOCAL_SERVICES: "Local services",
  HOME_SERVICES: "Home services",
  PROFESSIONAL_SERVICES: "Professional services",
  SOFTWARE: "Software",
  WEB_APPS: "Web apps",
  SECURITY: "Security",
  EDUCATION: "Education",
  WRITING: "Writing",
  MANUSCRIPTS: "Manuscripts",
  PHOTOGRAPHY: "Photography",
  GALLERY: "Gallery",
  MUSIC: "Music",
  VIDEO: "Video",
  HEALTH: "Health",
  FITNESS: "Fitness",
  FOOD: "Food",
  TRAVEL: "Travel",
  REAL_ESTATE: "Real estate",
  AUTOMOTIVE: "Automotive",
  FINANCE: "Finance",
  VOLUNTEERING: "Volunteering",
  COMMUNITY: "Community",
  NEWS: "News",
  POLITICS: "Politics",
  SPIRITUALITY: "Spirituality",
  SELF_IMPROVEMENT: "Self improvement",
  PRODUCTIVITY: "Productivity",
  ENTREPRENEURSHIP: "Entrepreneurship",
  ART: "Art",
  DESIGN: "Design",
  GAMING: "Gaming",
  PETS: "Pets",
  OUTDOORS: "Outdoors",
  SPORTS: "Sports",
  PARENTING: "Parenting",
  RELATIONSHIPS: "Relationships",
  ENTERTAINMENT: "Entertainment",
  SHOPPING: "Shopping",
  EQUIPMENT: "Equipment",
  SUPPLIES: "Supplies",
  ELECTRONICS: "Electronics"
};

export const interestCategoryOptions = Object.entries(interestCategoryLabels).map(([value, label]) => ({
  value: value as InterestCategory,
  label
}));

export const adAgeRangeOptions = [
  { value: "13-17", label: "13-17" },
  { value: "18-24", label: "18-24" },
  { value: "25-34", label: "25-34" },
  { value: "35-44", label: "35-44" },
  { value: "45-54", label: "45-54" },
  { value: "55-64", label: "55-64" },
  { value: "65+", label: "65+" }
] as const;

export const adSexOptions = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" }
] as const;

export type AdAgeRangeValue = (typeof adAgeRangeOptions)[number]["value"];
export type AdSexValue = (typeof adSexOptions)[number]["value"];

const adAgeRangeValues = adAgeRangeOptions.map((option) => option.value) as [AdAgeRangeValue, ...AdAgeRangeValue[]];
const adSexValues = adSexOptions.map((option) => option.value) as [AdSexValue, ...AdSexValue[]];

export function normalizeAdTargetHashtag(value: string) {
  return value
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);
}

const optionalEntityIdSchema = cuidIdSchema.optional().or(z.literal(""));

export const createAdCampaignSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(8).max(280),
  imageMediaAssetId: optionalEntityIdSchema,
  imageMediaAssetIds: z.array(cuidIdSchema).max(10).default([]),
  externalImageUrl: optionalHttpsUrlSchema,
  carouselEnabled: z.boolean().default(false),
  destinationKind: z.nativeEnum(AdDestinationKind).default(AdDestinationKind.STOREFRONT),
  marketListingId: optionalEntityIdSchema,
  businessArticleId: optionalEntityIdSchema,
  customDestinationUrl: optionalHttpsUrlSchema,
  subscriberTargetManuscriptId: optionalEntityIdSchema,
  placement: z.nativeEnum(AdPlacement).default(AdPlacement.RIGHT_STREAM),
  targetLocation: z.string().trim().max(120).optional(),
  targetInterestCategories: z.array(z.nativeEnum(InterestCategory)).max(12).default([]),
  targetAgeRanges: z.array(z.enum(adAgeRangeValues)).max(adAgeRangeOptions.length).default([]),
  targetSexes: z.array(z.enum(adSexValues)).max(adSexOptions.length).default([]),
  targetHashtags: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(40)
        .transform(normalizeAdTargetHashtag)
        .refine(Boolean, "Enter a hashtag containing letters, numbers, or underscores.")
    )
    .max(20)
    .default([])
    .transform((values) => [...new Set(values.filter(Boolean))]),
  pricingRuleKey: z.string().trim().min(2).max(120),
  totalBudgetCredits: z.coerce.number().int().min(1).max(100000).optional(),
  campaignDurationDays: z.coerce.number().int().min(1).max(365).optional(),
  dailyBudgetCredits: z.coerce.number().int().min(0).max(100000).optional().nullable()
}).superRefine((value, context) => {
  const ownedImageCount = new Set([value.imageMediaAssetId, ...value.imageMediaAssetIds].filter(Boolean)).size;
  const hasOwnedImage = ownedImageCount > 0;
  const hasExternalImage = Boolean(value.externalImageUrl);

  if (hasOwnedImage === hasExternalImage) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Choose exactly one ad image source.",
      path: ["imageMediaAssetId"]
    });
  }


  if (value.carouselEnabled && ownedImageCount < 2) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Choose at least two uploaded images for an ad carousel.",
      path: ["imageMediaAssetIds"]
    });
  }

  const destinationRequirements: Record<AdDestinationKind, { field?: keyof typeof value; message?: string }> = {
    [AdDestinationKind.STOREFRONT]: {},
    [AdDestinationKind.MARKET_LISTING]: { field: "marketListingId", message: "Choose a Market listing." },
    [AdDestinationKind.BUSINESS_ARTICLE]: { field: "businessArticleId", message: "Choose a storefront article." },
    [AdDestinationKind.EXTERNAL_URL]: { field: "customDestinationUrl", message: "Enter the HTTPS destination URL." }
  };
  const requirement = destinationRequirements[value.destinationKind];

  if (requirement.field && !value[requirement.field]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: requirement.message ?? "Choose a destination.",
      path: [requirement.field]
    });
  }
});

export type AdCampaignCardView = {
  id: string;
  title: string;
  body: string;
  destinationUrl: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  carouselEnabled: boolean;
  destinationKind: AdDestinationKind;
  placement: AdPlacement;
  placementLabel: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED" | "ARCHIVED";
  targetLocation: string | null;
  targetInterestLabels: string[];
  targetAgeRanges: string[];
  targetSexes: string[];
  targetHashtags: string[];
  subscriberTargetLabel: string | null;
  totalBudgetCredits: number;
  dailyBudgetCredits: number | null;
  spentCredits: number;
  remainingCredits: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

export type AdMetricEventView = {
  campaignId: string;
  eventType: AdDeliveryEventType;
  placement: AdPlacement;
  viewerLocation: string | null;
  createdAt: string;
};

export type AdPlacementCardView = {
  id: string;
  title: string;
  body: string;
  destinationUrl: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  carouselEnabled: boolean;
  minimumCarouselHoldMs: number;
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
  marketOnly: boolean;
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
  metrics: {
    generatedAt: string;
    events: AdMetricEventView[];
  };
};
