import { AdPlacement, PlatformCostSubject } from "@prisma/client";
import { z } from "zod";

export const platformCostSubjectLabels: Record<PlatformCostSubject, string> = {
  MARKET_PRODUCT_LISTING: "Product listing",
  MARKET_PRODUCT_EXTRA_LISTING: "Extra product listing",
  MARKET_PRODUCT_RENEW: "Renew product listing",
  MARKET_PRODUCT_BOOST: "Boost product listing",
  MARKET_SERVICE_POST: "Service post",
  MARKET_SERVICE_BOOST: "Boost service post",
  MONTHLY_SPECIAL: "Monthly special",
  MAIN_STREAM_PROMOTED_POST: "Main stream promoted post",
  MAIL_SPONSORED_INTERNAL: "Sponsored internal mail",
  AD_RIGHT_BILLBOARD_SMALL: "Right billboard, small",
  AD_RIGHT_BILLBOARD_MEDIUM: "Right billboard, medium",
  AD_RIGHT_BILLBOARD_LARGE: "Right billboard, large",
  AD_BUSINESS_SPOTLIGHT: "Business spotlight",
  AD_RESERVED_STREAM: "Reserved stream ad",
  POST_BOOST: "Boost post",
  EVENT_BOOST: "Boost event",
  STOREFRONT_SPOTLIGHT: "Storefront spotlight"
};

export const adPlacementCostSubjects: Record<AdPlacement, PlatformCostSubject[]> = {
  RIGHT_STREAM: [PlatformCostSubject.AD_RIGHT_BILLBOARD_SMALL, PlatformCostSubject.AD_RIGHT_BILLBOARD_MEDIUM, PlatformCostSubject.AD_RIGHT_BILLBOARD_LARGE],
  BUSINESS_SPOTLIGHT: [PlatformCostSubject.AD_BUSINESS_SPOTLIGHT],
  RESERVED_STREAM: [PlatformCostSubject.AD_RESERVED_STREAM]
};

export const updatePlatformCostRuleSchema = z.object({
  key: z.string().trim().min(2).max(120),
  label: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  creditCost: z.coerce.number().int().min(0).max(1_000_000),
  durationDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  includedUnits: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  unitLabel: z.string().trim().min(1).max(80).default("package"),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1_000_000).default(0)
});

export type PlatformCostRuleView = {
  id: string;
  key: string;
  subject: PlatformCostSubject;
  subjectLabel: string;
  label: string;
  description: string | null;
  creditCost: number;
  durationDays: number | null;
  includedUnits: number | null;
  unitLabel: string;
  active: boolean;
  sortOrder: number;
  updatedAt: string;
};

export type AdPricingPackageView = PlatformCostRuleView & {
  placement: AdPlacement;
  placementLabel: string;
};
