import { MarketplaceListingStatus, MarketplacePublisherKind, MarketplaceReviewStatus, Prisma } from "@prisma/client";

import { getR2PublicUrl } from "@/lib/platform/r2";
import { publicMarketplaceReviewSummary, redactMarketplaceContact } from "./marketplace-policy";

export const marketplaceListingInclude = Prisma.validator<Prisma.MarketplaceListingInclude>()({
  owner: { include: { profile: true } },
  businessProfile: true,
  auditorProfile: { include: { user: { include: { profile: true } } } },
  media: { include: { mediaAsset: true }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
  facets: { orderBy: [{ key: "asc" }, { createdAt: "asc" }] },
  reviews: { where: { status: MarketplaceReviewStatus.PUBLISHED }, select: { rating: true } },
});

export type MarketplaceListingPayload = Prisma.MarketplaceListingGetPayload<{
  include: typeof marketplaceListingInclude;
}>;

export interface MarketplacePublisherView {
  kind: MarketplacePublisherKind;
  id: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  memberSince: string;
  reviewAverage: number | null;
  reviewCount: number;
  reviewScorePublic: boolean;
}

export interface MarketplaceMediaView {
  id: string;
  mediaAssetId: string;
  url: string | null;
  mimeType: string;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export interface MarketplaceListingCardView {
  id: string;
  slug: string;
  kind: MarketplaceListingPayload["kind"];
  intent: MarketplaceListingPayload["intent"];
  status: MarketplaceListingStatus;
  title: string;
  summary: string | null;
  category: string;
  subcategory: string | null;
  condition: string | null;
  priceType: MarketplaceListingPayload["priceType"];
  priceCents: number | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  currency: string;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  remote: boolean;
  deliveryAvailable: boolean;
  attributes: Prisma.JsonValue;
  primaryMedia: MarketplaceMediaView | null;
  publisher: MarketplacePublisherView;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  saveCount: number;
  inquiryCount: number;
}

export interface MarketplaceListingDetailView extends MarketplaceListingCardView {
  description: string;
  postalArea: string | null;
  exactAddress: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactWebsite: string | null;
  contactInstructions: string | null;
  allowInAppMessages: boolean;
  media: MarketplaceMediaView[];
  facets: Array<{ key: string; valueText: string | null; valueNumber: number | null; valueBoolean: boolean | null; unit: string | null }>;
  canManage: boolean;
  moderationReason: string | null;
}

function mediaUrl(asset: { publicUrl: string | null; storageKey: string }) {
  return asset.publicUrl ?? getR2PublicUrl(asset.storageKey);
}

function publisherView(listing: MarketplaceListingPayload): MarketplacePublisherView {
  const review = publicMarketplaceReviewSummary(listing.reviews);
  if (listing.publisherKind === MarketplacePublisherKind.AUDITOR && listing.auditorProfile) {
    return {
      kind: listing.publisherKind,
      id: listing.auditorProfile.id,
      name: listing.auditorProfile.practiceName,
      handle: listing.auditorProfile.user?.username ?? null,
      avatarUrl: listing.auditorProfile.user?.profile?.avatarUrl ?? null,
      memberSince: listing.auditorProfile.createdAt.toISOString(),
      reviewAverage: review.average,
      reviewCount: review.count,
      reviewScorePublic: review.public,
    };
  }
  if (listing.publisherKind !== MarketplacePublisherKind.PERSONAL && listing.businessProfile) {
    return {
      kind: listing.publisherKind,
      id: listing.businessProfile.id,
      name: listing.businessProfile.businessName,
      handle: listing.businessProfile.slug,
      avatarUrl: listing.businessProfile.logoUrl,
      memberSince: listing.businessProfile.createdAt.toISOString(),
      reviewAverage: review.average,
      reviewCount: review.count,
      reviewScorePublic: review.public,
    };
  }
  return {
    kind: MarketplacePublisherKind.PERSONAL,
    id: listing.owner.id,
    name: listing.owner.profile?.displayName ?? listing.owner.username,
    handle: listing.owner.username,
    avatarUrl: listing.owner.profile?.avatarUrl ?? null,
    memberSince: listing.owner.createdAt.toISOString(),
    reviewAverage: review.average,
    reviewCount: review.count,
    reviewScorePublic: review.public,
  };
}

function mediaView(media: MarketplaceListingPayload["media"][number]): MarketplaceMediaView {
  return {
    id: media.id,
    mediaAssetId: media.mediaAssetId,
    url: mediaUrl(media.mediaAsset),
    mimeType: media.mediaAsset.mimeType,
    altText: media.altText,
    isPrimary: media.isPrimary,
    sortOrder: media.sortOrder,
  };
}

export function publicMarketplaceAttributes(value: Prisma.JsonValue, canManage = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const attributes = { ...(value as Record<string, Prisma.JsonValue>) };
  if (!canManage && attributes.showVin !== true) delete attributes.vin;
  for (const privateKey of ["showVin", "legalComplianceAttested", "licenseAttested", "qualificationsAttested", "resumeMediaAssetId", "seedTag", "fixtureVersion", "betaTest"]) {
    delete attributes[privateKey];
  }
  return attributes;
}

export function toMarketplaceCardView(listing: MarketplaceListingPayload): MarketplaceListingCardView {
  const media = listing.media.map(mediaView);
  return {
    id: listing.id,
    slug: listing.slug,
    kind: listing.kind,
    intent: listing.intent,
    status: listing.status,
    title: listing.title,
    summary: listing.summary,
    category: listing.category,
    subcategory: listing.subcategory,
    condition: listing.condition,
    priceType: listing.priceType,
    priceCents: listing.priceCents,
    priceMinCents: listing.priceMinCents,
    priceMaxCents: listing.priceMaxCents,
    currency: listing.currency,
    countryCode: listing.countryCode,
    region: listing.region,
    city: listing.city,
    remote: listing.remote,
    deliveryAvailable: listing.deliveryAvailable,
    attributes: publicMarketplaceAttributes(listing.attributes),
    primaryMedia: media.find((item) => item.isPrimary) ?? media[0] ?? null,
    publisher: publisherView(listing),
    publishedAt: listing.publishedAt?.toISOString() ?? null,
    expiresAt: listing.expiresAt?.toISOString() ?? null,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    viewCount: listing.viewCount,
    saveCount: listing.saveCount,
    inquiryCount: listing.inquiryCount,
  };
}

export function toMarketplaceDetailView(listing: MarketplaceListingPayload, canManage: boolean): MarketplaceListingDetailView {
  const card = toMarketplaceCardView(listing);
  const contact = redactMarketplaceContact(listing, canManage);
  return {
    ...card,
    description: listing.description,
    attributes: publicMarketplaceAttributes(listing.attributes, canManage),
    postalArea: listing.postalArea,
    exactAddress: contact.exactAddress,
    contactEmail: contact.email,
    contactPhone: contact.phone,
    contactWebsite: contact.website,
    contactInstructions: listing.contactInstructions,
    allowInAppMessages: listing.allowInAppMessages,
    media: listing.media.map(mediaView),
    facets: listing.facets.map((facet) => ({
      key: facet.key,
      valueText: facet.valueText,
      valueNumber: facet.valueNumber,
      valueBoolean: facet.valueBoolean,
      unit: facet.unit,
    })),
    canManage,
    moderationReason: canManage ? listing.moderationReason : null,
  };
}
