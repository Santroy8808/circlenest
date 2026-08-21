import { MarketplaceListingStatus, Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import { marketplaceSearchSchema, type MarketplacePage, type MarketplaceSearchInput } from "./marketplace.contracts";
import { decodeMarketplaceCursor, encodeMarketplaceCursor, isMarketplaceDirectoryBridgeRecord } from "./marketplace-policy";
import type { MarketplaceAvailableCategory } from "./marketplace-navigation";
import {
  marketplaceListingInclude,
  toMarketplaceCardView,
  toMarketplaceDetailView,
  type MarketplaceListingCardView,
  type MarketplaceListingDetailView,
} from "./marketplace-view";

const MODULE_KEY = "marketplace";
const MARKETPLACE_QUERY_TIMEOUT_MS = 4_000;

type SearchRow = { id: string; score: number };
type AvailableCategoryRow = { category: string; kind: MarketplaceAvailableCategory["kind"]; subcategory: string | null };

function withMarketplaceTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${operation} timed out`)), MARKETPLACE_QUERY_TIMEOUT_MS)),
  ]);
}

function textPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

function facetCondition(key: string, value: string | number | boolean | string[]) {
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "MarketplaceListingFacet" facet
      WHERE facet."listingId" = listing.id
        AND facet."key" = ${key}
        AND facet."valueText" IN (${Prisma.join(value)})
    )`;
  }
  if (typeof value === "number") {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "MarketplaceListingFacet" facet
      WHERE facet."listingId" = listing.id AND facet."key" = ${key} AND facet."valueNumber" = ${value}
    )`;
  }
  if (typeof value === "boolean") {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "MarketplaceListingFacet" facet
      WHERE facet."listingId" = listing.id AND facet."key" = ${key} AND facet."valueBoolean" = ${value}
    )`;
  }
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "MarketplaceListingFacet" facet
    WHERE facet."listingId" = listing.id AND facet."key" = ${key} AND LOWER(facet."valueText") = LOWER(${value})
  )`;
}

export function buildMarketplaceSearchSql(input: MarketplaceSearchInput, offset: number) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`listing."status" = 'ACTIVE'::"MarketplaceListingStatus"`,
    Prisma.sql`listing."publishedAt" IS NOT NULL`,
    Prisma.sql`(listing."expiresAt" IS NULL OR listing."expiresAt" > CURRENT_TIMESTAMP)`,
    Prisma.sql`(listing."attributes" ->> 'sourceProfileSync') IS DISTINCT FROM 'true'`,
  ];
  if (input.kind) conditions.push(Prisma.sql`listing."kind" = ${input.kind}::"MarketplaceListingKind"`);
  if (input.intent) conditions.push(Prisma.sql`listing."intent" = ${input.intent}::"MarketplaceIntent"`);
  if (input.category) conditions.push(Prisma.sql`LOWER(listing."category") = LOWER(${input.category})`);
  if (input.subcategory) conditions.push(Prisma.sql`LOWER(listing."subcategory") = LOWER(${input.subcategory})`);
  if (input.countryCode) conditions.push(Prisma.sql`listing."countryCode" = ${input.countryCode}`);
  if (input.region) conditions.push(Prisma.sql`listing."region" ILIKE ${textPattern(input.region)} ESCAPE '\\'`);
  if (input.city) conditions.push(Prisma.sql`listing."city" ILIKE ${textPattern(input.city)} ESCAPE '\\'`);
  if (input.remote != null) conditions.push(Prisma.sql`listing."remote" = ${input.remote}`);
  if (input.minPriceCents != null) {
    conditions.push(Prisma.sql`COALESCE(listing."priceCents", listing."priceMinCents", listing."priceMaxCents") >= ${input.minPriceCents}`);
  }
  if (input.maxPriceCents != null) {
    conditions.push(Prisma.sql`COALESCE(listing."priceCents", listing."priceMaxCents", listing."priceMinCents") <= ${input.maxPriceCents}`);
  }
  for (const [key, value] of Object.entries(input.facets)) {
    const condition = facetCondition(key, value);
    if (condition) conditions.push(condition);
  }

  const searchDocument = Prisma.sql`to_tsvector(
    'simple'::regconfig,
    COALESCE(listing."title", '') || ' ' || COALESCE(listing."summary", '') || ' ' ||
    COALESCE(listing."description", '') || ' ' || COALESCE(listing."category", '') || ' ' ||
    COALESCE(listing."subcategory", '') || ' ' || COALESCE(listing."city", '') || ' ' || COALESCE(listing."region", '')
  )`;
  const score = input.q
    ? Prisma.sql`GREATEST(
        ts_rank_cd(${searchDocument}, plainto_tsquery('simple'::regconfig, ${input.q})),
        similarity(LOWER(listing."title"), LOWER(${input.q}))
      )`
    : Prisma.sql`0::double precision`;
  if (input.q) {
    conditions.push(Prisma.sql`(
      ${searchDocument} @@ plainto_tsquery('simple'::regconfig, ${input.q})
      OR similarity(LOWER(listing."title"), LOWER(${input.q})) >= 0.12
    )`);
  }

  const order =
    input.sort === "oldest"
      ? Prisma.sql`listing."publishedAt" ASC, listing."id" ASC`
      : input.sort === "price_asc"
        ? Prisma.sql`COALESCE(listing."priceCents", listing."priceMinCents", listing."priceMaxCents") ASC NULLS LAST, listing."publishedAt" DESC`
        : input.sort === "price_desc"
          ? Prisma.sql`COALESCE(listing."priceCents", listing."priceMaxCents", listing."priceMinCents") DESC NULLS LAST, listing."publishedAt" DESC`
          : input.q && input.sort === "relevance"
            ? Prisma.sql`score DESC, listing."publishedAt" DESC, listing."id" DESC`
            : Prisma.sql`listing."publishedAt" DESC, listing."id" DESC`;

  return Prisma.sql`
    SELECT listing."id", ${score} AS score
    FROM "MarketplaceListing" listing
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY ${order}
    LIMIT ${input.limit + 1}
    OFFSET ${offset}
  `;
}

export async function searchMarketplaceListings(input: unknown): Promise<MarketplacePage<MarketplaceListingCardView>> {
  const parsed = marketplaceSearchSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid marketplace search.");
  const query = parsed.data;
  const offset = decodeMarketplaceCursor(query.cursor);
  const rows = await withMarketplaceTimeout(prisma.$queryRaw<SearchRow[]>(buildMarketplaceSearchSql(query, offset)), "marketplace search");
  const hasMore = rows.length > query.limit;
  const pageRows = rows.slice(0, query.limit);
  if (!pageRows.length) return { items: [], nextCursor: null };

  const listings = await withMarketplaceTimeout(
    prisma.marketplaceListing.findMany({
      where: { id: { in: pageRows.map((row) => row.id) } },
      include: marketplaceListingInclude,
    }),
    "marketplace listing hydration",
  );
  const byId = new Map(listings.map((listing) => [listing.id, listing]));
  return {
    items: pageRows.map((row) => byId.get(row.id)).filter(Boolean).map((listing) => toMarketplaceCardView(listing!)),
    nextCursor: hasMore ? encodeMarketplaceCursor(offset + query.limit) : null,
  };
}

export async function safeSearchMarketplaceListings(input: unknown): Promise<MarketplacePage<MarketplaceListingCardView>> {
  try {
    return await searchMarketplaceListings(input);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Marketplace search failed.", { error: error instanceof Error ? error.message : "unknown" });
    return { items: [], nextCursor: null };
  }
}

export async function getMarketplaceListingDetail(
  listingIdOrSlug: string,
  viewerUserId?: string | null,
): Promise<MarketplaceListingDetailView | null> {
  const [listing, viewer] = await Promise.all([
    prisma.marketplaceListing.findFirst({
      where: { OR: [{ id: listingIdOrSlug }, { slug: listingIdOrSlug }] },
      include: marketplaceListingInclude,
    }),
    viewerUserId
      ? prisma.user.findUnique({ where: { id: viewerUserId }, select: { role: true } })
      : Promise.resolve(null),
  ]);
  if (!listing) return null;
  if (isMarketplaceDirectoryBridgeRecord(listing.attributes)) return null;
  const canManage = Boolean(viewerUserId && (listing.ownerUserId === viewerUserId || isAdminRole(viewer?.role ?? UserRole.MEMBER)));
  const publicNow =
    listing.status === MarketplaceListingStatus.ACTIVE &&
    Boolean(listing.publishedAt) &&
    (!listing.expiresAt || listing.expiresAt.getTime() > Date.now());
  if (!publicNow && !canManage) return null;

  if (!canManage) {
    void prisma.marketplaceListing.update({ where: { id: listing.id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
  }
  return toMarketplaceDetailView(listing, canManage);
}

export async function listOwnedMarketplaceListings(userId: string, status?: MarketplaceListingStatus | null) {
  const listings = await prisma.marketplaceListing.findMany({
    where: { ownerUserId: userId, ...(status ? { status } : {}) },
    include: marketplaceListingInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  return listings
    .filter((listing) => !isMarketplaceDirectoryBridgeRecord(listing.attributes))
    .map((listing) => toMarketplaceDetailView(listing, true));
}

export async function getAvailableMarketplaceCategories(): Promise<MarketplaceAvailableCategory[]> {
  return withMarketplaceTimeout(prisma.$queryRaw<AvailableCategoryRow[]>(Prisma.sql`
    SELECT DISTINCT listing."kind", listing."category", listing."subcategory"
    FROM "MarketplaceListing" listing
    WHERE listing."status" = 'ACTIVE'::"MarketplaceListingStatus"
      AND listing."publishedAt" IS NOT NULL
      AND listing."publishedAt" <= CURRENT_TIMESTAMP
      AND (listing."expiresAt" IS NULL OR listing."expiresAt" > CURRENT_TIMESTAMP)
      AND (listing."attributes" ->> 'sourceProfileSync') IS DISTINCT FROM 'true'
    ORDER BY listing."kind", listing."category", listing."subcategory"
  `), "marketplace category availability");
}

export async function safeGetAvailableMarketplaceCategories(): Promise<MarketplaceAvailableCategory[]> {
  try {
    return await getAvailableMarketplaceCategories();
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Marketplace category availability failed.", { error: error instanceof Error ? error.message : "unknown" });
    return [];
  }
}

export async function listLegacyMarketplaceArchive(userId: string, viewerRole: UserRole) {
  const ownerFilter = isAdminRole(viewerRole) ? {} : { sellerUserId: userId };
  const employerFilter = isAdminRole(viewerRole) ? {} : { employerUserId: userId };
  const [market, jobs] = await Promise.all([
    prisma.marketListing.findMany({ where: ownerFilter, orderBy: { createdAt: "desc" }, take: 250 }),
    prisma.jobListing.findMany({ where: employerFilter, orderBy: { createdAt: "desc" }, take: 250 }),
  ]);
  return {
    market: market.map((listing) => ({ ...listing, createdAt: listing.createdAt.toISOString(), updatedAt: listing.updatedAt.toISOString(), expiresAt: listing.expiresAt?.toISOString() ?? null })),
    jobs: jobs.map((listing) => ({ ...listing, createdAt: listing.createdAt.toISOString(), updatedAt: listing.updatedAt.toISOString() })),
  };
}
