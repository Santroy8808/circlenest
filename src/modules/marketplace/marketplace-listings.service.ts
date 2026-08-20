import {
  JobListingStatus,
  MarketplaceFeeAction,
  MarketplaceFeeStatus,
  MarketplaceListingEventType,
  MarketplaceListingStatus,
  MarketListingStatus,
  MediaAssetStatus,
  MediaVisibility,
  Prisma,
  UserRole,
} from "@prisma/client";

import { lockReadyMediaAssetsForReference, withMediaAssetReferenceValidation } from "@/lib/platform/media-asset-reference-fence";
import { prisma } from "@/lib/platform/db";
import { isAdminRole } from "@/lib/platform/roles";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";
import { marketplaceListingInputSchema, type MarketplaceListingInput } from "./marketplace.contracts";
import {
  MARKETPLACE_LISTING_LIFETIME_DAYS,
  canManageMarketplaceListing,
  requireMarketplaceActor,
  resolveMarketplacePublisher,
  validateMarketplacePublicationPolicy,
} from "./marketplace-policy";
import { MARKETPLACE_TEMPLATES, parseMarketplaceAttributes } from "./marketplace-templates";
import { marketplaceListingInclude, toMarketplaceDetailView } from "./marketplace-view";

type MarketplaceDatabase = typeof prisma | Prisma.TransactionClient;
type FacetCreate = {
  key: string;
  valueText?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  unit?: string;
};

const ACTIVE_STATUSES: MarketplaceListingStatus[] = [MarketplaceListingStatus.ACTIVE, MarketplaceListingStatus.RESERVED];
const MANAGEABLE_STATUSES = new Set<MarketplaceListingStatus>([
  MarketplaceListingStatus.DRAFT,
  MarketplaceListingStatus.ACTIVE,
  MarketplaceListingStatus.PAUSED,
  MarketplaceListingStatus.RESERVED,
  MarketplaceListingStatus.FULFILLED,
  MarketplaceListingStatus.EXPIRED,
]);

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function uniqueMarketplaceSlug(title: string, database: MarketplaceDatabase) {
  const base = slugify(title) || "listing";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${Math.random().toString(36).slice(2, 8)}`;
    const slug = `${base}${suffix}`;
    const exists = await database.marketplaceListing.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function unitForFacet(attributes: Record<string, unknown>, key: string) {
  const unitKey = key === "area" ? "areaUnit" : key === "mileage" ? "mileageUnit" : key === "weight" ? "weightUnit" : ["length", "width", "height"].includes(key) ? "dimensionUnit" : null;
  const unit = unitKey ? attributes[unitKey] : null;
  return typeof unit === "string" ? unit : undefined;
}

export function marketplaceFacetsFromAttributes(attributes: Record<string, unknown>): FacetCreate[] {
  const facets: FacetCreate[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null || key.endsWith("Unit") || ["vin", "showVin", "legalComplianceAttested", "licenseAttested", "qualificationsAttested", "resumeMediaAssetId"].includes(key)) continue;
    if (typeof value === "string" && value.length > 0 && value.length <= 240) {
      facets.push({ key, valueText: value, unit: unitForFacet(attributes, key) });
    } else if (typeof value === "number" && Number.isFinite(value)) {
      facets.push({ key, valueNumber: value, unit: unitForFacet(attributes, key) });
    } else if (typeof value === "boolean") {
      facets.push({ key, valueBoolean: value });
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.length > 0 && item.length <= 240) facets.push({ key, valueText: item });
      }
    }
  }
  return facets;
}

function normalizeListingInput(input: unknown) {
  const parsed = marketplaceListingInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid listing." };

  const template = MARKETPLACE_TEMPLATES[parsed.data.kind];
  const category = template.categories.find((candidate) => candidate.toLowerCase() === parsed.data.category.toLowerCase());
  if (!category) return { ok: false as const, error: `Choose a valid ${template.label.toLowerCase()} category.` };

  try {
    const attributes = parseMarketplaceAttributes(parsed.data.kind, parsed.data.attributes) as Record<string, unknown>;
    for (const field of template.fields) {
      if (!field.requiredFor?.includes(parsed.data.intent)) continue;
      const value = attributes[field.key];
      if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
        return { ok: false as const, error: `${field.label} is required.` };
      }
    }
    return { ok: true as const, listing: { ...parsed.data, category, attributes } };
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      const issues = (error as { issues?: Array<{ message?: string }> }).issues;
      return { ok: false as const, error: issues?.[0]?.message ?? "Check the listing details." };
    }
    return { ok: false as const, error: "Check the listing details." };
  }
}

async function validateListingMedia(
  transaction: Prisma.TransactionClient,
  ownerUserId: string,
  mediaAssetIds: string[],
) {
  const uniqueIds = [...new Set(mediaAssetIds)];
  if (uniqueIds.length !== mediaAssetIds.length) return { ok: false as const, error: "Choose each photo or video only once." };
  await lockReadyMediaAssetsForReference(transaction, uniqueIds, { additionalUserIds: [ownerUserId] });
  if (!uniqueIds.length) return { ok: true as const };
  const assets = await transaction.mediaAsset.findMany({
    where: {
      id: { in: uniqueIds },
      ownerUserId,
      status: MediaAssetStatus.READY,
      visibility: MediaVisibility.PUBLIC,
      OR: [{ mimeType: { startsWith: "image/", mode: "insensitive" } }, { mimeType: { startsWith: "video/", mode: "insensitive" } }],
    },
    select: { id: true },
  });
  return assets.length === uniqueIds.length
    ? { ok: true as const }
    : { ok: false as const, error: "One or more listing photos or videos are unavailable." };
}

async function assertMarketplacePublishLimit(
  transaction: Prisma.TransactionClient,
  userId: string,
  role: UserRole,
  excludeListingId?: string,
) {
  if (isAdminRole(role)) return { ok: true as const, photoCap: 12 };
  const policy = await getEffectivePolicyForUser(userId);
  if (!policy) return { ok: false as const, error: "This account is not available." };
  const limits = policy.limits;

  if (limits.marketActiveListingCap != null) {
    const now = new Date();
    const [unified, legacyMarket, legacyJobs] = await Promise.all([
      transaction.marketplaceListing.count({
        where: {
          ownerUserId: userId,
          id: excludeListingId ? { not: excludeListingId } : undefined,
          status: { in: ACTIVE_STATUSES },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      transaction.marketListing.count({
        where: { sellerUserId: userId, status: MarketListingStatus.ACTIVE, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      }),
      transaction.jobListing.count({ where: { employerUserId: userId, status: JobListingStatus.ACTIVE } }),
    ]);
    if (unified + legacyMarket + legacyJobs >= limits.marketActiveListingCap) {
      return { ok: false as const, error: `Your plan supports ${limits.marketActiveListingCap} active listing at a time.` };
    }
  }

  if (limits.marketListingsPer14Days != null) {
    const since = addDays(new Date(), -14);
    const [unified, legacyMarket, legacyJobs] = await Promise.all([
      transaction.marketplaceListing.count({ where: { ownerUserId: userId, publishedAt: { gte: since }, id: excludeListingId ? { not: excludeListingId } : undefined } }),
      transaction.marketListing.count({ where: { sellerUserId: userId, createdAt: { gte: since } } }),
      transaction.jobListing.count({ where: { employerUserId: userId, createdAt: { gte: since } } }),
    ]);
    if (unified + legacyMarket + legacyJobs >= limits.marketListingsPer14Days) {
      return { ok: false as const, error: `Your plan supports ${limits.marketListingsPer14Days} new listings every 14 days.` };
    }
  }
  return { ok: true as const, photoCap: policy.limits.marketListingPhotoCap ?? 12 };
}

function listingData(input: MarketplaceListingInput & { attributes: Record<string, unknown> }) {
  return {
    kind: input.kind,
    intent: input.intent,
    title: input.title,
    summary: input.summary || null,
    description: input.description,
    category: input.category,
    subcategory: input.subcategory || null,
    condition: input.condition || null,
    templateVersion: input.templateVersion,
    attributes: input.attributes as Prisma.InputJsonValue,
    priceType: input.priceType,
    priceCents: input.priceCents ?? null,
    priceMinCents: input.priceMinCents ?? null,
    priceMaxCents: input.priceMaxCents ?? null,
    currency: input.currency,
    countryCode: input.location.countryCode ?? null,
    region: input.location.region || null,
    city: input.location.city || null,
    postalArea: input.location.postalArea || null,
    remote: input.location.remote,
    deliveryAvailable: input.location.deliveryAvailable,
    exactAddress: input.location.exactAddress || null,
    contactEmail: input.contact.email || null,
    contactPhone: input.contact.phone || null,
    contactWebsite: input.contact.website || null,
    contactInstructions: input.contact.instructions || null,
    showEmail: input.contact.showEmail,
    showPhone: input.contact.showPhone,
    showWebsite: input.contact.showWebsite,
    showExactAddress: input.contact.showExactAddress,
    allowInAppMessages: input.contact.allowInAppMessages,
  };
}

export async function getMarketplaceCreateState(userId: string) {
  const actor = await requireMarketplaceActor(userId, "create");
  if (!actor.ok) return { allowed: false as const, reason: actor.error, photoCap: 0, publishers: [] };
  const [policy, businesses, auditors] = await Promise.all([
    getEffectivePolicyForUser(userId),
    prisma.businessProfile.findMany({
      where: { OR: [{ ownerUserId: userId }, { owner: { businessAccountOwnerLink: { is: { privateUserId: userId, active: true } } } }] },
      select: { id: true, businessName: true, profileKind: true },
      orderBy: { businessName: "asc" },
    }),
    prisma.auditorProfile.findMany({
      where: { active: true, OR: [{ userId }, { user: { auditorAccountOwnerLink: { is: { privateUserId: userId, active: true } } } }] },
      select: { id: true, practiceName: true },
      orderBy: { practiceName: "asc" },
    }),
  ]);
  return {
    allowed: true as const,
    photoCap: isAdminRole(actor.user.role) ? 12 : policy?.limits.marketListingPhotoCap ?? 3,
    publishers: [
      { kind: "PERSONAL" as const, id: userId, name: "My personal profile" },
      ...businesses.map((profile) => ({ kind: profile.profileKind === "ORG" ? "ORGANIZATION" as const : "BUSINESS" as const, id: profile.id, name: profile.businessName })),
      ...auditors.map((profile) => ({ kind: "AUDITOR" as const, id: profile.id, name: profile.practiceName })),
    ],
  };
}

export async function createMarketplaceListing(userId: string, input: unknown, options: { publish?: boolean } = {}) {
  const normalized = normalizeListingInput(input);
  if (!normalized.ok) return normalized;
  const actor = await requireMarketplaceActor(userId, "create");
  if (!actor.ok) return actor;
  const publish = options.publish !== false;
  if (publish) {
    const policyError = validateMarketplacePublicationPolicy(normalized.listing);
    if (policyError) return { ok: false as const, error: policyError };
  }

  const referenceValidation = await withMediaAssetReferenceValidation(() => prisma.$transaction(async (transaction) => {
    const publisher = await resolveMarketplacePublisher(transaction, userId, normalized.listing.publisher);
    if (!publisher.ok) return publisher;
    const policy = isAdminRole(actor.user.role) ? null : await getEffectivePolicyForUser(userId);
    const photoCap = isAdminRole(actor.user.role) ? 12 : policy?.limits.marketListingPhotoCap ?? 3;
    if (publish) {
      const limit = await assertMarketplacePublishLimit(transaction, userId, actor.user.role);
      if (!limit.ok) return limit;
    }
    if (normalized.listing.mediaAssetIds.length > photoCap) {
      return { ok: false as const, error: `Your plan supports ${photoCap} photos or videos per listing.` };
    }
    const media = await validateListingMedia(transaction, userId, normalized.listing.mediaAssetIds);
    if (!media.ok) return media;

    const now = new Date();
    const listing = await transaction.marketplaceListing.create({
      data: {
        slug: await uniqueMarketplaceSlug(normalized.listing.title, transaction),
        ownerUserId: userId,
        publisherKind: publisher.publisherKind,
        businessProfileId: publisher.businessProfileId,
        auditorProfileId: publisher.auditorProfileId,
        ...listingData(normalized.listing),
        status: publish ? MarketplaceListingStatus.ACTIVE : MarketplaceListingStatus.DRAFT,
        publishedAt: publish ? now : null,
        expiresAt: publish ? addDays(now, MARKETPLACE_LISTING_LIFETIME_DAYS) : null,
        media: {
          create: normalized.listing.mediaAssetIds.map((mediaAssetId, sortOrder) => ({
            mediaAssetId,
            sortOrder,
            isPrimary: mediaAssetId === (normalized.listing.primaryMediaAssetId ?? normalized.listing.mediaAssetIds[0]),
          })),
        },
        facets: { create: marketplaceFacetsFromAttributes(normalized.listing.attributes) },
        events: {
          create: [
            { actorUserId: userId, type: MarketplaceListingEventType.CREATED },
            ...(publish ? [{ actorUserId: userId, type: MarketplaceListingEventType.PUBLISHED }] : []),
          ],
        },
      },
      include: marketplaceListingInclude,
    });
    if (publish) {
      await transaction.marketplaceFeeLedgerEntry.create({
        data: { listingId: listing.id, userId, action: MarketplaceFeeAction.PUBLISH, status: MarketplaceFeeStatus.WAIVED, amountCents: 0, metadata: { reason: "Free marketplace beta" } },
      });
    }
    return { ok: true as const, listing: toMarketplaceDetailView(listing, true) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  return referenceValidation.ok ? referenceValidation.value : referenceValidation;
}

export async function updateMarketplaceListing(viewerUserId: string, listingId: string, input: unknown) {
  const normalized = normalizeListingInput(input);
  if (!normalized.ok) return normalized;
  const actor = await requireMarketplaceActor(viewerUserId, "create");
  if (!actor.ok) return actor;
  const existing = await prisma.marketplaceListing.findUnique({ where: { id: listingId }, select: { ownerUserId: true, status: true } });
  if (!existing || !MANAGEABLE_STATUSES.has(existing.status)) return { ok: false as const, error: "Listing not found." };
  if (!canManageMarketplaceListing({ viewerUserId, ownerUserId: existing.ownerUserId, viewerRole: actor.user.role })) {
    return { ok: false as const, error: "You cannot edit this listing." };
  }
  if (ACTIVE_STATUSES.includes(existing.status)) {
    const policyError = validateMarketplacePublicationPolicy(normalized.listing);
    if (policyError) return { ok: false as const, error: policyError };
  }

  const policy = await getEffectivePolicyForUser(existing.ownerUserId);
  const photoCap = isAdminRole(actor.user.role) ? 12 : policy?.limits.marketListingPhotoCap ?? 3;
  if (normalized.listing.mediaAssetIds.length > photoCap) {
    return { ok: false as const, error: `This plan supports ${photoCap} photos or videos per listing.` };
  }
  const referenceValidation = await withMediaAssetReferenceValidation(() => prisma.$transaction(async (transaction) => {
    const publisher = await resolveMarketplacePublisher(transaction, existing.ownerUserId, normalized.listing.publisher);
    if (!publisher.ok) return publisher;
    const media = await validateListingMedia(transaction, existing.ownerUserId, normalized.listing.mediaAssetIds);
    if (!media.ok) return media;
    const listing = await transaction.marketplaceListing.update({
      where: { id: listingId },
      data: {
        publisherKind: publisher.publisherKind,
        businessProfileId: publisher.businessProfileId,
        auditorProfileId: publisher.auditorProfileId,
        ...listingData(normalized.listing),
        media: {
          deleteMany: {},
          create: normalized.listing.mediaAssetIds.map((mediaAssetId, sortOrder) => ({
            mediaAssetId,
            sortOrder,
            isPrimary: mediaAssetId === (normalized.listing.primaryMediaAssetId ?? normalized.listing.mediaAssetIds[0]),
          })),
        },
        facets: { deleteMany: {}, create: marketplaceFacetsFromAttributes(normalized.listing.attributes) },
        events: { create: { actorUserId: viewerUserId, type: MarketplaceListingEventType.UPDATED } },
      },
      include: marketplaceListingInclude,
    });
    return { ok: true as const, listing: toMarketplaceDetailView(listing, true) };
  }));
  return referenceValidation.ok ? referenceValidation.value : referenceValidation;
}

export async function publishMarketplaceListing(userId: string, listingId: string) {
  const actor = await requireMarketplaceActor(userId, "create");
  if (!actor.ok) return actor;
  return prisma.$transaction(async (transaction) => {
    const listing = await transaction.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing || !canManageMarketplaceListing({ viewerUserId: userId, ownerUserId: listing.ownerUserId, viewerRole: actor.user.role })) {
      return { ok: false as const, error: "Listing not found." };
    }
    const publishableStatuses: MarketplaceListingStatus[] = [MarketplaceListingStatus.DRAFT, MarketplaceListingStatus.PAUSED, MarketplaceListingStatus.EXPIRED];
    if (!publishableStatuses.includes(listing.status)) {
      return { ok: false as const, error: "This listing cannot be published from its current status." };
    }
    const publicationInput: MarketplaceListingInput = {
      kind: listing.kind,
      intent: listing.intent,
      title: listing.title,
      summary: listing.summary,
      description: listing.description,
      category: listing.category,
      subcategory: listing.subcategory,
      condition: listing.condition,
      templateVersion: 1,
      attributes: listing.attributes as Record<string, unknown>,
      priceType: listing.priceType,
      priceCents: listing.priceCents,
      priceMinCents: listing.priceMinCents,
      priceMaxCents: listing.priceMaxCents,
      currency: listing.currency,
      publisher: { kind: listing.publisherKind, businessProfileId: listing.businessProfileId, auditorProfileId: listing.auditorProfileId },
      location: { countryCode: listing.countryCode, region: listing.region, city: listing.city, postalArea: listing.postalArea, exactAddress: listing.exactAddress, remote: listing.remote, deliveryAvailable: listing.deliveryAvailable },
      contact: { email: listing.contactEmail, phone: listing.contactPhone, website: listing.contactWebsite, instructions: listing.contactInstructions, showEmail: listing.showEmail, showPhone: listing.showPhone, showWebsite: listing.showWebsite, showExactAddress: listing.showExactAddress, allowInAppMessages: listing.allowInAppMessages },
      mediaAssetIds: [],
      primaryMediaAssetId: null,
    };
    const policyError = validateMarketplacePublicationPolicy(publicationInput);
    if (policyError) return { ok: false as const, error: policyError };
    const limit = await assertMarketplacePublishLimit(transaction, listing.ownerUserId, actor.user.role, listing.id);
    if (!limit.ok) return limit;
    const now = new Date();
    const updated = await transaction.marketplaceListing.update({
      where: { id: listing.id },
      data: { status: MarketplaceListingStatus.ACTIVE, publishedAt: now, expiresAt: addDays(now, MARKETPLACE_LISTING_LIFETIME_DAYS), closedAt: null, archivedAt: null, events: { create: { actorUserId: userId, type: MarketplaceListingEventType.PUBLISHED } } },
      include: marketplaceListingInclude,
    });
    await transaction.marketplaceFeeLedgerEntry.create({ data: { listingId: listing.id, userId: listing.ownerUserId, action: MarketplaceFeeAction.PUBLISH, status: MarketplaceFeeStatus.WAIVED, amountCents: 0, metadata: { reason: "Free marketplace beta" } } });
    return { ok: true as const, listing: toMarketplaceDetailView(updated, true) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function marketplaceStatusEvent(status: MarketplaceListingStatus) {
  const map: Partial<Record<MarketplaceListingStatus, MarketplaceListingEventType>> = {
    [MarketplaceListingStatus.PAUSED]: MarketplaceListingEventType.PAUSED,
    [MarketplaceListingStatus.RESERVED]: MarketplaceListingEventType.RESERVED,
    [MarketplaceListingStatus.FULFILLED]: MarketplaceListingEventType.FULFILLED,
    [MarketplaceListingStatus.ARCHIVED]: MarketplaceListingEventType.ARCHIVED,
    [MarketplaceListingStatus.REMOVED]: MarketplaceListingEventType.REMOVED,
  };
  return map[status] ?? null;
}

export async function setMarketplaceListingStatus(
  userId: string,
  listingId: string,
  status: MarketplaceListingStatus,
  reason?: string,
) {
  if (status === MarketplaceListingStatus.ACTIVE) return publishMarketplaceListing(userId, listingId);
  const eventType = marketplaceStatusEvent(status);
  if (!eventType || status === MarketplaceListingStatus.DRAFT || status === MarketplaceListingStatus.EXPIRED) {
    return { ok: false as const, error: "Choose a valid listing action." };
  }
  const actor = await requireMarketplaceActor(userId, "interact");
  if (!actor.ok) return actor;
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || !canManageMarketplaceListing({ viewerUserId: userId, ownerUserId: listing.ownerUserId, viewerRole: actor.user.role })) {
    return { ok: false as const, error: "Listing not found." };
  }
  if (status === MarketplaceListingStatus.REMOVED && !isAdminRole(actor.user.role)) {
    return { ok: false as const, error: "Only an administrator can remove a listing." };
  }
  const now = new Date();
  const updated = await prisma.marketplaceListing.update({
    where: { id: listing.id },
    data: {
      status,
      closedAt: ([MarketplaceListingStatus.FULFILLED, MarketplaceListingStatus.ARCHIVED, MarketplaceListingStatus.REMOVED] as MarketplaceListingStatus[]).includes(status) ? now : listing.closedAt,
      archivedAt: status === MarketplaceListingStatus.ARCHIVED ? now : listing.archivedAt,
      moderatedAt: status === MarketplaceListingStatus.REMOVED ? now : listing.moderatedAt,
      moderatedByUserId: status === MarketplaceListingStatus.REMOVED ? userId : listing.moderatedByUserId,
      moderationReason: status === MarketplaceListingStatus.REMOVED ? reason?.trim() || "Removed by an administrator." : listing.moderationReason,
      events: { create: { actorUserId: userId, type: eventType, metadata: reason ? { reason: reason.trim() } : undefined } },
    },
    include: marketplaceListingInclude,
  });
  return { ok: true as const, listing: toMarketplaceDetailView(updated, true) };
}

export async function renewMarketplaceListing(userId: string, listingId: string) {
  const actor = await requireMarketplaceActor(userId, "create");
  if (!actor.ok) return actor;
  return prisma.$transaction(async (transaction) => {
    const listing = await transaction.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing || !canManageMarketplaceListing({ viewerUserId: userId, ownerUserId: listing.ownerUserId, viewerRole: actor.user.role })) {
      return { ok: false as const, error: "Listing not found." };
    }
    if (([MarketplaceListingStatus.ARCHIVED, MarketplaceListingStatus.REMOVED] as MarketplaceListingStatus[]).includes(listing.status)) {
      return { ok: false as const, error: "This listing cannot be renewed." };
    }
    const limit = await assertMarketplacePublishLimit(transaction, listing.ownerUserId, actor.user.role, listing.id);
    if (!limit.ok) return limit;
    const now = new Date();
    const updated = await transaction.marketplaceListing.update({
      where: { id: listing.id },
      data: { status: MarketplaceListingStatus.ACTIVE, publishedAt: listing.publishedAt ?? now, expiresAt: addDays(now, MARKETPLACE_LISTING_LIFETIME_DAYS), closedAt: null, events: { create: { actorUserId: userId, type: MarketplaceListingEventType.RENEWED } } },
      include: marketplaceListingInclude,
    });
    await transaction.marketplaceFeeLedgerEntry.create({ data: { listingId: listing.id, userId: listing.ownerUserId, action: MarketplaceFeeAction.RENEW, status: MarketplaceFeeStatus.WAIVED, amountCents: 0, metadata: { reason: "Free marketplace beta" } } });
    return { ok: true as const, listing: toMarketplaceDetailView(updated, true) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function expireMarketplaceListings(now = new Date()) {
  const expired = await prisma.marketplaceListing.findMany({ where: { status: { in: ACTIVE_STATUSES }, expiresAt: { lte: now } }, select: { id: true } });
  if (!expired.length) return 0;
  await prisma.$transaction([
    prisma.marketplaceListing.updateMany({ where: { id: { in: expired.map((item) => item.id) } }, data: { status: MarketplaceListingStatus.EXPIRED, closedAt: now } }),
    prisma.marketplaceListingEvent.createMany({ data: expired.map((item) => ({ listingId: item.id, type: MarketplaceListingEventType.EXPIRED })) }),
  ]);
  return expired.length;
}
