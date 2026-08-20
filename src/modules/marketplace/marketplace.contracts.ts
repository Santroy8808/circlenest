import { z } from "zod";

export const MARKETPLACE_LISTING_KINDS = [
  "GOODS",
  "VEHICLE",
  "RENTAL",
  "SERVICE",
  "JOB",
  "AUDITOR",
] as const;

export const MARKETPLACE_INTENTS = ["OFFER", "WANTED"] as const;
export const MARKETPLACE_PRICE_TYPES = [
  "FIXED",
  "NEGOTIABLE",
  "RANGE",
  "FREE",
  "TRADE",
  "QUOTE",
  "CONTACT",
] as const;
export const MARKETPLACE_PUBLISHER_KINDS = [
  "PERSONAL",
  "BUSINESS",
  "AUDITOR",
  "ORGANIZATION",
] as const;
export const MARKETPLACE_INQUIRY_KINDS = [
  "GENERAL",
  "OFFER",
  "APPLICATION",
  "QUOTE_REQUEST",
  "TOUR_REQUEST",
] as const;

export type MarketplaceListingKind = (typeof MARKETPLACE_LISTING_KINDS)[number];
export type MarketplaceIntent = (typeof MARKETPLACE_INTENTS)[number];
export type MarketplacePriceType = (typeof MARKETPLACE_PRICE_TYPES)[number];
export type MarketplacePublisherKind = (typeof MARKETPLACE_PUBLISHER_KINDS)[number];

const optionalTrimmed = (max: number) => z.string().trim().max(max).optional().nullable();

export const marketplacePublisherSchema = z
  .object({
    kind: z.enum(MARKETPLACE_PUBLISHER_KINDS).default("PERSONAL"),
    businessProfileId: z.string().cuid().optional().nullable(),
    auditorProfileId: z.string().cuid().optional().nullable(),
  })
  .superRefine((publisher, context) => {
    const hasBusiness = Boolean(publisher.businessProfileId);
    const hasAuditor = Boolean(publisher.auditorProfileId);
    if (publisher.kind === "PERSONAL" && (hasBusiness || hasAuditor)) {
      context.addIssue({ code: "custom", message: "Personal listings cannot use a managed profile." });
    }
    if (["BUSINESS", "ORGANIZATION"].includes(publisher.kind) && (!hasBusiness || hasAuditor)) {
      context.addIssue({ code: "custom", message: "Select one managed business or organization profile." });
    }
    if (publisher.kind === "AUDITOR" && (!hasAuditor || hasBusiness)) {
      context.addIssue({ code: "custom", message: "Select one managed auditor profile." });
    }
  });

export const marketplaceLocationSchema = z
  .object({
    countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional().nullable(),
    region: optionalTrimmed(100),
    city: optionalTrimmed(100),
    postalArea: optionalTrimmed(24),
    exactAddress: optionalTrimmed(300),
    remote: z.boolean().default(false),
    deliveryAvailable: z.boolean().default(false),
  })
  .superRefine((location, context) => {
    if (!location.remote && !location.countryCode) {
      context.addIssue({ code: "custom", path: ["countryCode"], message: "Choose a country or mark the listing remote." });
    }
  });

export const marketplaceContactSchema = z
  .object({
    allowInAppMessages: z.boolean().default(true),
    email: z.string().trim().email().max(254).optional().nullable(),
    phone: optionalTrimmed(40),
    website: z.string().trim().url().max(500).optional().nullable(),
    instructions: optionalTrimmed(500),
    showEmail: z.boolean().default(false),
    showPhone: z.boolean().default(false),
    showWebsite: z.boolean().default(false),
    showExactAddress: z.boolean().default(false),
  })
  .superRefine((contact, context) => {
    const disclosures: Array<[boolean, unknown, string]> = [
      [contact.showEmail, contact.email, "email"],
      [contact.showPhone, contact.phone, "phone"],
      [contact.showWebsite, contact.website, "website"],
    ];
    for (const [visible, value, path] of disclosures) {
      if (visible && !value) context.addIssue({ code: "custom", path: [path], message: "Enter this contact value before making it public." });
    }
    if (!contact.allowInAppMessages && !contact.showEmail && !contact.showPhone && !contact.showWebsite) {
      context.addIssue({ code: "custom", message: "Enable in-app messages or provide one public contact method." });
    }
  });

export const marketplaceListingInputSchema = z
  .object({
    kind: z.enum(MARKETPLACE_LISTING_KINDS),
    intent: z.enum(MARKETPLACE_INTENTS),
    title: z.string().trim().min(4).max(140),
    summary: optionalTrimmed(280),
    description: z.string().trim().min(20).max(12_000),
    category: z.string().trim().min(2).max(80),
    subcategory: optionalTrimmed(80),
    condition: optionalTrimmed(60),
    templateVersion: z.literal(1).default(1),
    attributes: z.record(z.unknown()).default({}),
    priceType: z.enum(MARKETPLACE_PRICE_TYPES).default("CONTACT"),
    priceCents: z.number().int().nonnegative().max(2_000_000_000).optional().nullable(),
    priceMinCents: z.number().int().nonnegative().max(2_000_000_000).optional().nullable(),
    priceMaxCents: z.number().int().nonnegative().max(2_000_000_000).optional().nullable(),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("USD"),
    publisher: marketplacePublisherSchema.default({ kind: "PERSONAL" }),
    location: marketplaceLocationSchema,
    contact: marketplaceContactSchema.default({ allowInAppMessages: true }),
    mediaAssetIds: z.array(z.string().cuid()).max(12).default([]),
    primaryMediaAssetId: z.string().cuid().optional().nullable(),
  })
  .superRefine((listing, context) => {
    if (["FIXED", "NEGOTIABLE"].includes(listing.priceType) && listing.priceCents == null) {
      context.addIssue({ code: "custom", path: ["priceCents"], message: "Enter a price." });
    }
    if (listing.priceType === "RANGE") {
      if (listing.priceMinCents == null || listing.priceMaxCents == null) {
        context.addIssue({ code: "custom", path: ["priceMinCents"], message: "Enter both ends of the range." });
      } else if (listing.priceMinCents > listing.priceMaxCents) {
        context.addIssue({ code: "custom", path: ["priceMaxCents"], message: "Maximum must be at least the minimum." });
      }
    }
    if (listing.contact.showExactAddress && !listing.location.exactAddress) {
      context.addIssue({ code: "custom", path: ["location", "exactAddress"], message: "Enter an address before making it public." });
    }
    if (listing.primaryMediaAssetId && !listing.mediaAssetIds.includes(listing.primaryMediaAssetId)) {
      context.addIssue({ code: "custom", path: ["primaryMediaAssetId"], message: "The primary image must be attached to the listing." });
    }
  });

export const marketplaceSearchSchema = z
  .object({
    q: z.string().trim().max(160).optional(),
    kind: z.enum(MARKETPLACE_LISTING_KINDS).optional(),
    intent: z.enum(MARKETPLACE_INTENTS).optional(),
    category: z.string().trim().max(80).optional(),
    subcategory: z.string().trim().max(80).optional(),
    countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
    region: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    remote: z.boolean().optional(),
    minPriceCents: z.number().int().nonnegative().optional(),
    maxPriceCents: z.number().int().nonnegative().optional(),
    facets: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({}),
    sort: z.enum(["relevance", "newest", "oldest", "price_asc", "price_desc"]).default("relevance"),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(48).default(24),
  })
  .superRefine((query, context) => {
    if (query.minPriceCents != null && query.maxPriceCents != null && query.minPriceCents > query.maxPriceCents) {
      context.addIssue({ code: "custom", path: ["maxPriceCents"], message: "Maximum price must be at least the minimum." });
    }
  });

export const marketplaceInquiryInputSchema = z.object({
  kind: z.enum(MARKETPLACE_INQUIRY_KINDS).default("GENERAL"),
  message: z.string().trim().min(1).max(5_000),
});

export const marketplaceReviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2_000).optional().nullable(),
});

export type MarketplaceListingInput = z.infer<typeof marketplaceListingInputSchema>;
export type MarketplaceSearchInput = z.infer<typeof marketplaceSearchSchema>;
export type MarketplaceInquiryInput = z.infer<typeof marketplaceInquiryInputSchema>;
export type MarketplaceReviewInput = z.infer<typeof marketplaceReviewInputSchema>;

export interface MarketplacePage<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}
