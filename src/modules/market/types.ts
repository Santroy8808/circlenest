import { MarketListingCategory, MarketListingStatus } from "@prisma/client";
import { z } from "zod";

export const MAX_MARKET_PHOTO_BYTES = 10 * 1024 * 1024;
export const PROFESSIONAL_MARKET_PHOTO_CAP = 12;

export const marketCategoryLabels: Record<MarketListingCategory, string> = {
  [MarketListingCategory.BOOKS_MATERIALS]: "Books & Materials",
  [MarketListingCategory.COURSE_SUPPLIES]: "Course Supplies",
  [MarketListingCategory.AUDITING_SUPPLIES]: "Auditing Supplies",
  [MarketListingCategory.E_METERS]: "E-Meters",
  [MarketListingCategory.FURNITURE_EQUIPMENT]: "Furniture & Equipment",
  [MarketListingCategory.SERVICES]: "Services",
  [MarketListingCategory.BUSINESS_SERVICES]: "Business Services",
  [MarketListingCategory.EVENTS_SUPPLIES]: "Event Supplies",
  [MarketListingCategory.OTHER]: "Other"
};

export const marketCategoryOptions = Object.entries(marketCategoryLabels).map(([value, label]) => ({
  value: value as MarketListingCategory,
  label
}));

export const createMarketPhotoUploadIntentSchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string().regex(/^image\/(jpeg|png|gif|webp)$/),
  sizeBytes: z.number().int().positive().max(MAX_MARKET_PHOTO_BYTES)
});

export const completeMarketPhotoUploadSchema = createMarketPhotoUploadIntentSchema.extend({
  storageKey: z.string().min(1).max(600)
});

export const createMarketListingSchema = z.object({
  title: z.string().min(2, "Name the listing.").max(120),
  description: z.string().min(5, "Describe the listing.").max(3000),
  category: z.nativeEnum(MarketListingCategory),
  location: z.string().max(180).optional().or(z.literal("")),
  priceCents: z.number().int().min(0).max(100000000).optional().nullable(),
  photoMediaAssetIds: z.array(z.string().min(1)).max(PROFESSIONAL_MARKET_PHOTO_CAP).default([])
});

export type MarketListingCardView = {
  id: string;
  slug: string;
  title: string;
  category: MarketListingCategory;
  categoryLabel: string;
  location?: string | null;
  priceCents?: number | null;
  currency: string;
  status: MarketListingStatus;
  expiresAt?: string | null;
  createdAt: string;
  thumbnailUrl?: string | null;
  seller: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
};

export type MarketListingDetailView = MarketListingCardView & {
  description: string;
  photos: Array<{
    id: string;
    publicUrl: string | null;
    originalName: string | null;
  }>;
  viewerCanManage: boolean;
  viewerCanPromote: boolean;
};

export type MarketCreateState = {
  viewerCanCreate: boolean;
  reason?: string;
  listingsRemaining: number | null;
  listingLimit: number | null;
  photoCap: number;
  storefrontEligible: boolean;
};
