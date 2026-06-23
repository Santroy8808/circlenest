import { randomBytes } from "crypto";
import { MarketListingCategory, MarketListingStatus, MediaVisibility, MembershipTier, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { createPresignedR2PutUrl, getR2PublicUrl } from "@/lib/platform/r2";
import { canUserAccessFeature, getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";
import {
  completeMarketPhotoUploadSchema,
  createMarketListingSchema,
  createMarketPhotoUploadIntentSchema,
  marketCategoryLabels,
  PROFESSIONAL_MARKET_PHOTO_CAP,
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

async function uniqueMarketSlug(title: string) {
  const base = slugify(title) || "listing";
  let candidate = base;
  let index = 2;

  while (await prisma.marketListing.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function safeFileName(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return cleaned || "market-photo";
}

function dateSlug(date = new Date()) {
  return date.toISOString().slice(0, 10);
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

  if (role === UserRole.ADMIN) {
    return {
      viewerCanCreate: true,
      listingsRemaining: null,
      listingLimit: null,
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
      photoCap: 0,
      storefrontEligible: false
    };
  }

  const listingLimit = policy.limits.marketListingsPer14Days;
  const photoCap = policy.limits.marketListingPhotoCap ?? PROFESSIONAL_MARKET_PHOTO_CAP;

  if (listingLimit === null) {
    return {
      viewerCanCreate: true,
      listingsRemaining: null,
      listingLimit: null,
      photoCap,
      storefrontEligible: storefrontAccess.allowed
    };
  }

  const used = await prisma.marketListing.count({
    where: {
      sellerUserId: userId,
      createdAt: {
        gte: recentCutoff(CONTRIBUTOR_LISTING_DAYS)
      },
      status: {
        not: MarketListingStatus.ARCHIVED
      }
    }
  });
  const remaining = Math.max(0, listingLimit - used);

  return {
    viewerCanCreate: remaining > 0,
    reason: remaining > 0 ? undefined : `You have used all ${listingLimit} Market listings for this 14-day period.`,
    listingsRemaining: remaining,
    listingLimit,
    photoCap,
    storefrontEligible: storefrontAccess.allowed
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
    thumbnailUrl: thumbnail?.mediaAsset.publicUrl,
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

export async function createMarketPhotoUploadIntent(userId: string, input: unknown) {
  const parsed = createMarketPhotoUploadIntentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid photo." };
  }

  const state = await getMarketCreateState(userId);

  if (!state.viewerCanCreate) {
    return { ok: false as const, error: state.reason ?? "You cannot create Market listings." };
  }

  const storageKey = [
    "market",
    userId,
    dateSlug(),
    `${randomBytes(8).toString("hex")}-${safeFileName(parsed.data.fileName)}`
  ].join("/");

  try {
    const uploadUrl = await createPresignedR2PutUrl({
      storageKey,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes
    });

    return {
      ok: true as const,
      uploadUrl,
      storageKey,
      publicUrl: getR2PublicUrl(storageKey),
      expiresInSeconds: 300
    };
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not create Market photo upload intent.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Media storage is not configured." };
  }
}

export async function completeMarketPhotoUpload(userId: string, input: unknown) {
  const parsed = completeMarketPhotoUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload completion." };
  }

  const state = await getMarketCreateState(userId);

  if (!state.viewerCanCreate) {
    return { ok: false as const, error: state.reason ?? "You cannot create Market listings." };
  }

  if (!parsed.data.storageKey.startsWith(`market/${userId}/`)) {
    return { ok: false as const, error: "Invalid upload target." };
  }

  const asset = await prisma.mediaAsset.upsert({
    where: {
      storageKey: parsed.data.storageKey
    },
    update: {
      publicUrl: getR2PublicUrl(parsed.data.storageKey),
      mimeType: parsed.data.mimeType,
      sizeBytes: BigInt(parsed.data.sizeBytes),
      originalName: parsed.data.fileName,
      visibility: MediaVisibility.PUBLIC,
      metadata: {
        module: MODULE_KEY
      }
    },
    create: {
      ownerUserId: userId,
      storageKey: parsed.data.storageKey,
      publicUrl: getR2PublicUrl(parsed.data.storageKey),
      mimeType: parsed.data.mimeType,
      sizeBytes: BigInt(parsed.data.sizeBytes),
      originalName: parsed.data.fileName,
      visibility: MediaVisibility.PUBLIC,
      metadata: {
        module: MODULE_KEY
      }
    }
  });

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

  const photos = parsed.data.photoMediaAssetIds.length
    ? await prisma.mediaAsset.findMany({
        where: {
          id: { in: parsed.data.photoMediaAssetIds },
          ownerUserId: userId,
          mimeType: {
            startsWith: "image/"
          }
        },
        select: {
          id: true
        }
      })
    : [];

  if (photos.length !== parsed.data.photoMediaAssetIds.length) {
    return { ok: false as const, error: "One or more listing photos could not be found." };
  }

  const policy = await getEffectivePolicyForUser(userId);
  const contributorLimited = policy?.tier === MembershipTier.CONTRIBUTOR;
  const listing = await prisma.marketListing.create({
    data: {
      slug: await uniqueMarketSlug(parsed.data.title),
      sellerUserId: userId,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      location: parsed.data.location || null,
      priceCents: parsed.data.priceCents ?? null,
      expiresAt: contributorLimited ? futureDate(CONTRIBUTOR_LISTING_DAYS) : null,
      photos: {
        create: parsed.data.photoMediaAssetIds.map((mediaAssetId, index) => ({
          mediaAssetId,
          sortOrder: index
        }))
      }
    }
  });

  await diagnostics.info(MODULE_KEY, "Market listing created.", {
    userId,
    listingId: listing.id,
    category: listing.category
  });

  return { ok: true as const, listing };
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
  const canPromote = role === UserRole.ADMIN || listing.sellerUserId === viewerUserId || (await canUserAccessFeature(viewerUserId, "market.createAd")).allowed;
  const detail: MarketListingDetailView = {
    ...toMarketCardView(listing),
    description: listing.description,
    photos: listing.photos.map((photo) => ({
      id: photo.id,
      publicUrl: photo.mediaAsset.publicUrl,
      originalName: photo.mediaAsset.originalName
    })),
    viewerCanManage: role === UserRole.ADMIN || listing.sellerUserId === viewerUserId,
    viewerCanPromote: canPromote
  };

  return { ok: true as const, listing: detail };
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
