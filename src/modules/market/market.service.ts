import {
  MarketListingCategory,
  MarketListingStatus,
  MediaAssetStatus,
  MediaVisibility,
  Prisma,
  UploadIntentPurpose,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import { getR2PublicUrl } from "@/lib/platform/r2";
import { canUserAccessFeature, getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";
import {
  completeUploadIntent,
  consumeVerifiedUploadIntent,
  createUploadIntent
} from "@/modules/media/upload-intent.service";
import {
  completeMarketPhotoUploadSchema,
  createMarketListingSchema,
  createMarketPhotoUploadIntentSchema,
  marketCategoryLabels,
  PROFESSIONAL_MARKET_PHOTO_CAP,
  updateMarketListingSchema,
  type MarketListingCardView,
  type MarketListingDetailView
} from "@/modules/market/types";

const MODULE_KEY = "market";
const MARKET_DB_TIMEOUT_MS = 2500;
const CONTRIBUTOR_LISTING_DAYS = 14;

function withMarketDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), MARKET_DB_TIMEOUT_MS);
    })
  ]);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type MarketDatabase = typeof prisma | Prisma.TransactionClient;

export function buildRollingMarketQuotaWhere(userId: string, cutoff: Date): Prisma.MarketListingWhereInput {
  return {
    sellerUserId: userId,
    createdAt: { gte: cutoff }
  };
}

export function planMarketPhotoAdditions(input: {
  existingPhotoIds: string[];
  requestedPhotoIds: string[];
  photoCap: number;
}) {
  const existing = new Set(input.existingPhotoIds);
  const requested = [...new Set(input.requestedPhotoIds)];
  const newPhotoIds = requested.filter((mediaAssetId) => !existing.has(mediaAssetId));
  const finalPhotoCount = existing.size + newPhotoIds.length;
  return {
    newPhotoIds,
    finalPhotoCount,
    capExceeded: finalPhotoCount > input.photoCap
  };
}

async function uniqueMarketSlug(title: string, database: MarketDatabase = prisma) {
  const base = slugify(title) || "listing";
  let candidate = base;
  let index = 2;

  while (await database.marketListing.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

async function withSerializableMarketTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const conflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!conflict || attempt === 2) throw error;
    }
  }

  throw new Error("Market transaction retry limit reached.");
}

async function assertMarketCreateLimit(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    isAdmin: boolean;
    activeListingCap: number | null;
    listingLimit: number | null;
    now: Date;
  }
) {
  if (input.isAdmin) return { ok: true as const };

  if (input.activeListingCap !== null) {
    const activeListings = await transaction.marketListing.count({
      where: {
        sellerUserId: input.userId,
        status: MarketListingStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }]
      }
    });

    return activeListings < input.activeListingCap
      ? { ok: true as const }
      : {
          ok: false as const,
          error: `You can have ${input.activeListingCap} active Market listing at a time.`
        };
  }

  if (input.listingLimit === null) return { ok: true as const };

  const cutoff = new Date(input.now);
  cutoff.setDate(cutoff.getDate() - CONTRIBUTOR_LISTING_DAYS);
  const used = await transaction.marketListing.count({
    where: buildRollingMarketQuotaWhere(input.userId, cutoff)
  });

  return used < input.listingLimit
    ? { ok: true as const }
    : {
        ok: false as const,
        error: `You have used all ${input.listingLimit} Market listings for this 14-day period.`
      };
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

function sellerView(user: {
  id: string;
  username: string;
  profile: { displayName: string | null; avatarUrl: string | null } | null;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: profileName(user),
    avatarUrl: user.profile?.avatarUrl
  };
}

function mediaAssetUrl(
  mediaAsset?: {
    id: string;
    publicUrl: string | null;
    status: MediaAssetStatus;
    visibility: MediaVisibility;
  } | null
) {
  if (
    !mediaAsset ||
    mediaAsset.status !== MediaAssetStatus.READY ||
    mediaAsset.visibility !== MediaVisibility.PUBLIC
  ) {
    return null;
  }
  return mediaAsset.publicUrl ?? `/api/media/assets/${mediaAsset.id}`;
}

function futureDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function recentCutoff(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function getViewerRole(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return user?.role ?? UserRole.MEMBER;
}

export async function getMarketCreateState(userId: string) {
  const [role, policy, featureAccess, storefrontAccess] = await Promise.all([
    getViewerRole(userId),
    getEffectivePolicyForUser(userId),
    canUserAccessFeature(userId, "market.createListing"),
    canUserAccessFeature(userId, "market.storefront")
  ]);

  if (isAdminRole(role)) {
    return {
      viewerCanCreate: true,
      listingsRemaining: null,
      listingLimit: null,
      listingLimitKind: null,
      photoCap: PROFESSIONAL_MARKET_PHOTO_CAP,
      storefrontEligible: true
    };
  }

  if (!featureAccess.allowed || !policy) {
    return {
      viewerCanCreate: false,
      reason: featureAccess.reason,
      listingsRemaining: 0,
      listingLimit: 0,
      listingLimitKind: null,
      photoCap: 0,
      storefrontEligible: false
    };
  }

  const activeListingCap = policy.limits.marketActiveListingCap;
  const listingLimit = policy.limits.marketListingsPer14Days;
  const photoCap = policy.limits.marketListingPhotoCap ?? PROFESSIONAL_MARKET_PHOTO_CAP;

  if (activeListingCap !== null) {
    const activeListings = await prisma.marketListing.count({
      where: {
        sellerUserId: userId,
        status: MarketListingStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      }
    });
    const remaining = Math.max(0, activeListingCap - activeListings);

    return {
      viewerCanCreate: remaining > 0,
      reason: remaining > 0 ? undefined : `You can have ${activeListingCap} active Market listing at a time.`,
      listingsRemaining: remaining,
      listingLimit: activeListingCap,
      listingLimitKind: "active" as const,
      photoCap,
      storefrontEligible: storefrontAccess.allowed
    };
  }

  if (listingLimit === null) {
    return {
      viewerCanCreate: true,
      listingsRemaining: null,
      listingLimit: null,
      listingLimitKind: null,
      photoCap,
      storefrontEligible: storefrontAccess.allowed
    };
  }

  const used = await prisma.marketListing.count({
    where: buildRollingMarketQuotaWhere(userId, recentCutoff(CONTRIBUTOR_LISTING_DAYS))
  });
  const remaining = Math.max(0, listingLimit - used);

  return {
    viewerCanCreate: remaining > 0,
    reason: remaining > 0 ? undefined : `You have used all ${listingLimit} Market listings for this 14-day period.`,
    listingsRemaining: remaining,
    listingLimit,
    listingLimitKind: "rolling14" as const,
    photoCap,
    storefrontEligible: storefrontAccess.allowed
  };
}

async function getMarketPhotoAccessState(userId: string) {
  const [role, policy, featureAccess] = await Promise.all([
    getViewerRole(userId),
    getEffectivePolicyForUser(userId),
    canUserAccessFeature(userId, "market.createListing")
  ]);

  if (isAdminRole(role)) {
    return { allowed: true as const, photoCap: PROFESSIONAL_MARKET_PHOTO_CAP };
  }

  if (!featureAccess.allowed || !policy) {
    return {
      allowed: false as const,
      photoCap: 0,
      reason: featureAccess.reason ?? "You cannot manage Market listing photos."
    };
  }

  return {
    allowed: true as const,
    photoCap: policy.limits.marketListingPhotoCap ?? PROFESSIONAL_MARKET_PHOTO_CAP
  };
}

type MarketListingPayload = Prisma.MarketListingGetPayload<{
  include: {
    seller: { include: { profile: true } };
    photos: { include: { mediaAsset: true } };
  };
}>;

function toMarketCardView(listing: MarketListingPayload): MarketListingCardView {
  const thumbnail = listing.photos.sort((first, second) => first.sortOrder - second.sortOrder)[0];

  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    category: listing.category,
    categoryLabel: marketCategoryLabels[listing.category],
    location: listing.location,
    priceCents: listing.priceCents,
    currency: listing.currency,
    status: listing.status,
    expiresAt: listing.expiresAt?.toISOString(),
    createdAt: listing.createdAt.toISOString(),
    thumbnailUrl: mediaAssetUrl(thumbnail?.mediaAsset),
    allowMessages: listing.allowMessages,
    carouselEnabled: listing.carouselEnabled,
    seller: sellerView(listing.seller)
  };
}

export async function listMarketListings(input?: { query?: string | null; category?: string | null }) {
  const query = input?.query?.trim();
  const category = input?.category && input.category in MarketListingCategory ? (input.category as MarketListingCategory) : null;
  const listings = await withMarketDbTimeout(
    prisma.marketListing.findMany({
      where: {
        status: MarketListingStatus.ACTIVE,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          ...(category ? [{ category }] : []),
          ...(query
            ? [
                {
                  OR: [
                    { title: { contains: query, mode: "insensitive" as const } },
                    { location: { contains: query, mode: "insensitive" as const } },
                    { description: { contains: query, mode: "insensitive" as const } }
                  ]
                }
              ]
            : [])
        ]
      },
      include: {
        seller: {
          include: {
            profile: true
          }
        },
        photos: {
          include: {
            mediaAsset: true
          },
          orderBy: {
            sortOrder: "asc"
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 80
    }),
    "market listings lookup"
  );

  return listings.map(toMarketCardView);
}

export async function safeListMarketListings(input?: { query?: string | null; category?: string | null }) {
  try {
    return await listMarketListings(input);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list Market listings.", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function listOwnedMarketListings(userId: string) {
  const listings = await withMarketDbTimeout(
    prisma.marketListing.findMany({
      where: {
        sellerUserId: userId,
        status: {
          not: MarketListingStatus.ARCHIVED
        }
      },
      include: {
        seller: {
          include: {
            profile: true
          }
        },
        photos: {
          include: {
            mediaAsset: true
          },
          orderBy: {
            sortOrder: "asc"
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    "owned Market listings lookup"
  );

  return listings.map(toMarketCardView);
}

export async function safeListOwnedMarketListings(userId: string) {
  try {
    return await listOwnedMarketListings(userId);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list owned Market listings.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function createMarketPhotoUploadIntent(userId: string, input: unknown) {
  const parsed = createMarketPhotoUploadIntentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid photo." };
  }

  const state = await getMarketPhotoAccessState(userId);

  if (!state.allowed) {
    return { ok: false as const, error: state.reason };
  }

  const intent = await createUploadIntent(userId, {
    purpose: UploadIntentPurpose.MARKET_LISTING,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
    visibility: MediaVisibility.PUBLIC
  });

  if (!intent.ok) return intent;

  return {
    ok: true as const,
    intentId: intent.intent.id,
    uploadUrl: intent.uploadUrl,
    uploadHeaders: intent.uploadHeaders,
    storageKey: intent.intent.storageKey,
    publicUrl: getR2PublicUrl(intent.intent.storageKey),
    expiresInSeconds: intent.expiresInSeconds
  };
}

export async function completeMarketPhotoUpload(userId: string, input: unknown) {
  const parsed = completeMarketPhotoUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload completion." };
  }

  const state = await getMarketPhotoAccessState(userId);

  if (!state.allowed) {
    return { ok: false as const, error: state.reason };
  }

  const verified = await completeUploadIntent(userId, { intentId: parsed.data.intentId });
  if (!verified.ok) return verified;

  if (
    verified.intent.purpose !== UploadIntentPurpose.MARKET_LISTING ||
    verified.intent.storageKey !== parsed.data.storageKey ||
    verified.intent.mimeType !== parsed.data.mimeType ||
    Number(verified.intent.sizeBytes) !== parsed.data.sizeBytes ||
    verified.intent.visibility !== MediaVisibility.PUBLIC
  ) {
    return { ok: false as const, error: "Upload intent does not match this Market photo." };
  }

  const consumed = await consumeVerifiedUploadIntent({
    ownerUserId: userId,
    intentId: parsed.data.intentId,
    purpose: UploadIntentPurpose.MARKET_LISTING,
    consume: async (transaction, intent) => transaction.mediaAsset.create({
      data: {
        ownerUserId: userId,
        storageKey: intent.storageKey,
        publicUrl: getR2PublicUrl(intent.storageKey),
        mimeType: intent.declaredMimeType,
        sizeBytes: intent.declaredSizeBytes,
        originalName: parsed.data.fileName,
        status: MediaAssetStatus.READY,
        visibility: intent.visibility,
        metadata: {
          module: MODULE_KEY,
          uploadIntentId: intent.id
        }
      }
    })
  });

  if (!consumed.ok) return consumed;
  const asset = consumed.value;

  await diagnostics.info(MODULE_KEY, "Market photo upload completed.", {
    userId,
    mediaAssetId: asset.id
  });

  return {
    ok: true as const,
    asset: {
      id: asset.id,
      publicUrl: asset.publicUrl
    }
  };
}

export async function createMarketListing(userId: string, input: unknown) {
  const parsed = createMarketListingSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid listing." };
  }

  const state = await getMarketCreateState(userId);

  if (!state.viewerCanCreate) {
    return { ok: false as const, error: state.reason ?? "You cannot create Market listings." };
  }

  if (parsed.data.photoMediaAssetIds.length > state.photoCap) {
    return { ok: false as const, error: `This tier supports ${state.photoCap} photos per listing.` };
  }

  const [policy, role] = await Promise.all([getEffectivePolicyForUser(userId), getViewerRole(userId)]);
  if (!policy && !isAdminRole(role)) {
    return { ok: false as const, error: "You cannot create Market listings." };
  }

  const limits = policy?.limits ?? {
    marketActiveListingCap: null,
    marketListingsPer14Days: null
  };
  const now = new Date();
  const creation = await withSerializableMarketTransaction(async (transaction) => {
    const limit = await assertMarketCreateLimit(transaction, {
      userId,
      isAdmin: isAdminRole(role),
      activeListingCap: limits.marketActiveListingCap,
      listingLimit: limits.marketListingsPer14Days,
      now
    });
    if (!limit.ok) return limit;

    const photos = parsed.data.photoMediaAssetIds.length
      ? await transaction.mediaAsset.findMany({
          where: {
            id: { in: parsed.data.photoMediaAssetIds },
            ownerUserId: userId,
            status: MediaAssetStatus.READY,
            visibility: MediaVisibility.PUBLIC,
            mimeType: { startsWith: "image/", mode: "insensitive" }
          },
          select: { id: true }
        })
      : [];

    if (photos.length !== parsed.data.photoMediaAssetIds.length) {
      return { ok: false as const, error: "One or more listing photos could not be found." };
    }

    const listing = await transaction.marketListing.create({
      data: {
        slug: await uniqueMarketSlug(parsed.data.title, transaction),
        sellerUserId: userId,
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        location: parsed.data.location || null,
        contactEmail: parsed.data.contactEmail || null,
        contactPhone: parsed.data.contactPhone || null,
        contactNotes: parsed.data.contactNotes || null,
        allowMessages: parsed.data.allowMessages,
        carouselEnabled: parsed.data.carouselEnabled && parsed.data.photoMediaAssetIds.length > 1,
        priceCents: parsed.data.priceCents ?? null,
        expiresAt: limits.marketListingsPer14Days !== null ? futureDate(CONTRIBUTOR_LISTING_DAYS) : null,
        photos: {
          create: parsed.data.photoMediaAssetIds.map((mediaAssetId, index) => ({
            mediaAssetId,
            sortOrder: index
          }))
        }
      }
    });

    return { ok: true as const, listing };
  });

  if (!creation.ok) return creation;
  const listing = creation.listing;

  await diagnostics.info(MODULE_KEY, "Market listing created.", {
    userId,
    listingId: listing.id,
    category: listing.category
  });

  return { ok: true as const, listing };
}

async function assertMarketPhotoOwnership(database: MarketDatabase, userId: string, photoMediaAssetIds: string[]) {
  if (!photoMediaAssetIds.length) return { ok: true as const, photos: [] as Array<{ id: string }> };

  const photos = await database.mediaAsset.findMany({
    where: {
      id: { in: photoMediaAssetIds },
      ownerUserId: userId,
      status: MediaAssetStatus.READY,
      visibility: MediaVisibility.PUBLIC,
      mimeType: { startsWith: "image/", mode: "insensitive" }
    },
    select: {
      id: true
    }
  });

  if (photos.length !== photoMediaAssetIds.length) {
    return { ok: false as const, error: "One or more listing photos could not be found." };
  }

  return { ok: true as const, photos };
}

export async function updateMarketListing(viewerUserId: string, listingIdOrSlug: string, input: unknown) {
  const parsed = updateMarketListingSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid listing." };
  }

  const listingOwner = await prisma.marketListing.findFirst({
    where: {
      OR: [{ id: listingIdOrSlug }, { slug: listingIdOrSlug }],
      status: {
        not: MarketListingStatus.ARCHIVED
      }
    },
    select: { id: true, sellerUserId: true }
  });

  if (!listingOwner) {
    return { ok: false as const, error: "Listing not found." };
  }

  const role = await getViewerRole(viewerUserId);
  const canManage = isAdminRole(role) || listingOwner.sellerUserId === viewerUserId;

  if (!canManage) {
    return { ok: false as const, error: "You cannot edit this listing." };
  }

  const photoAccess = await getMarketPhotoAccessState(listingOwner.sellerUserId);
  const requestedPhotoIds = parsed.data.photoMediaAssetIds ?? [];
  const update = await withSerializableMarketTransaction(async (transaction) => {
    const listing = await transaction.marketListing.findFirst({
      where: {
        id: listingOwner.id,
        status: { not: MarketListingStatus.ARCHIVED }
      },
      include: {
        photos: {
          orderBy: { sortOrder: "asc" }
        }
      }
    });

    if (!listing) return { ok: false as const, error: "Listing not found." };
    if (!isAdminRole(role) && listing.sellerUserId !== viewerUserId) {
      return { ok: false as const, error: "You cannot edit this listing." };
    }

    const photoPlan = planMarketPhotoAdditions({
      existingPhotoIds: listing.photos.map((photo) => photo.mediaAssetId),
      requestedPhotoIds,
      photoCap: photoAccess.photoCap
    });
    const newPhotoIds = photoPlan.newPhotoIds;

    if (newPhotoIds.length > 0 && (!photoAccess.allowed || photoPlan.capExceeded)) {
      return {
        ok: false as const,
        error: photoAccess.allowed
          ? `This tier supports ${photoAccess.photoCap} photos per listing.`
          : photoAccess.reason
      };
    }

    const photoOwnership = await assertMarketPhotoOwnership(transaction, listing.sellerUserId, newPhotoIds);
    if (!photoOwnership.ok) return photoOwnership;

    const maxSortOrder = listing.photos.reduce((max, photo) => Math.max(max, photo.sortOrder), -1);
    const updated = await transaction.marketListing.update({
      where: { id: listing.id },
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        location: parsed.data.location || null,
        contactEmail: parsed.data.contactEmail || null,
        contactPhone: parsed.data.contactPhone || null,
        contactNotes: parsed.data.contactNotes || null,
        allowMessages: parsed.data.allowMessages ?? true,
        carouselEnabled:
          (parsed.data.carouselEnabled ?? listing.carouselEnabled) && photoPlan.finalPhotoCount > 1,
        priceCents: parsed.data.priceCents ?? null,
        photos: newPhotoIds.length
          ? {
              create: newPhotoIds.map((mediaAssetId, index) => ({
                mediaAssetId,
                sortOrder: maxSortOrder + index + 1
              }))
            }
          : undefined
      }
    });

    return { ok: true as const, listing: updated };
  });

  if (!update.ok) return update;
  const updated = update.listing;

  await diagnostics.info(MODULE_KEY, "Market listing updated.", {
    userId: viewerUserId,
    listingId: updated.id,
    category: updated.category
  });

  return { ok: true as const, listing: updated };
}

export async function getMarketListingDetail(viewerUserId: string, listingIdOrSlug: string) {
  const listing = await prisma.marketListing.findFirst({
    where: {
      OR: [{ id: listingIdOrSlug }, { slug: listingIdOrSlug }],
      status: {
        not: MarketListingStatus.ARCHIVED
      }
    },
    include: {
      seller: {
        include: {
          profile: true
        }
      },
      photos: {
        include: {
          mediaAsset: true
        },
        orderBy: {
          sortOrder: "asc"
        }
      }
    }
  });

  if (!listing) {
    return { ok: false as const, error: "Listing not found." };
  }

  const role = await getViewerRole(viewerUserId);
  const promotionAccess = await canUserAccessFeature(viewerUserId, "market.createAd");
  const canPromote = canViewerPromoteListing({
    isOwner: listing.sellerUserId === viewerUserId,
    hasPromotionEntitlement: promotionAccess.allowed
  });
  const detail: MarketListingDetailView = {
    ...toMarketCardView(listing),
    description: listing.description,
    contactEmail: listing.contactEmail,
    contactPhone: listing.contactPhone,
    contactNotes: listing.contactNotes,
    allowMessages: listing.allowMessages,
    photos: listing.photos.map((photo) => ({
      id: photo.id,
      publicUrl: mediaAssetUrl(photo.mediaAsset),
      originalName: photo.mediaAsset.originalName
    })),
    viewerCanManage: isAdminRole(role) || listing.sellerUserId === viewerUserId,
    viewerCanPromote: canPromote
  };

  return { ok: true as const, listing: detail };
}

export function canViewerPromoteListing(input: {
  isOwner: boolean;
  hasPromotionEntitlement: boolean;
}) {
  return input.isOwner && input.hasPromotionEntitlement;
}

export async function safeGetMarketListingDetail(viewerUserId: string, listingIdOrSlug: string) {
  try {
    return await getMarketListingDetail(viewerUserId, listingIdOrSlug);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load Market listing detail.", {
      viewerUserId,
      listingIdOrSlug,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load listing." };
  }
}
