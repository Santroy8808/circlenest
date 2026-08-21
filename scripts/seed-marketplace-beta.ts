import "./load-next-env";

import {
  MarketplaceListingEventType,
  MarketplaceListingStatus,
  MarketplacePublisherKind,
  MediaAssetStatus,
  MediaVisibility,
  Prisma,
  PrismaClient,
  UserRole,
} from "@prisma/client";

import {
  buildMarketplaceBetaFixtures,
  MARKETPLACE_BETA_LISTINGS_PER_CATEGORY,
  MARKETPLACE_BETA_TAG,
} from "../src/modules/marketplace/marketplace-beta-fixtures";

const prisma = new PrismaClient();
const BETA_PREFIX = "beta-market-";
const OWNER_EMAIL = "marketplace-beta@theta-space.invalid";
const OWNER_USERNAME = "marketplace_beta_fixture";
const BATCH_SIZE = 400;

const args = new Set(process.argv.slice(2));
const cleanup = args.has("--cleanup");
const confirmed = args.has("--confirm");
const requestedCount = [...args]
  .find((argument) => argument.startsWith("--per-category="))
  ?.split("=")[1];
const listingsPerCategory = requestedCount ? Number(requestedCount) : MARKETPLACE_BETA_LISTINGS_PER_CATEGORY;

function requireConfirmation(action: string) {
  if (!confirmed) throw new Error(`${action} requires --confirm. Run without it only to inspect the current beta-test count.`);
}

function chunks<T>(rows: T[]) {
  const result: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) result.push(rows.slice(offset, offset + BATCH_SIZE));
  return result;
}

async function betaCounts() {
  const [listings, media, events] = await Promise.all([
    prisma.marketplaceListing.count({ where: { id: { startsWith: BETA_PREFIX }, attributes: { path: ["seedTag"], equals: MARKETPLACE_BETA_TAG } } }),
    prisma.mediaAsset.count({ where: { storageKey: { startsWith: `${BETA_PREFIX}media/` }, metadata: { path: ["seedTag"], equals: MARKETPLACE_BETA_TAG } } }),
    prisma.marketplaceListingEvent.count({ where: { listingId: { startsWith: BETA_PREFIX }, metadata: { path: ["seedTag"], equals: MARKETPLACE_BETA_TAG } } }),
  ]);
  return { listings, media, events };
}

async function cleanupBetaListings() {
  requireConfirmation("Beta marketplace cleanup");
  const before = await betaCounts();
  const [deletedListings, deletedMedia] = await prisma.$transaction(async (transaction) => {
    const listings = await transaction.marketplaceListing.deleteMany({
      where: { id: { startsWith: BETA_PREFIX }, attributes: { path: ["seedTag"], equals: MARKETPLACE_BETA_TAG } },
    });
    const media = await transaction.mediaAsset.deleteMany({
      where: { storageKey: { startsWith: `${BETA_PREFIX}media/` }, metadata: { path: ["seedTag"], equals: MARKETPLACE_BETA_TAG } },
    });
    return [listings.count, media.count] as const;
  }, { timeout: 120_000 });
  console.log(JSON.stringify({ action: "cleanup", before, deletedListings, deletedMedia, after: await betaCounts() }, null, 2));
}

async function ensureFixtureOwner() {
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { username: OWNER_USERNAME },
    create: {
      email: OWNER_EMAIL,
      username: OWNER_USERNAME,
      passwordHash: null,
      role: UserRole.MEMBER,
      emailVerified: new Date(),
      onboardingCompletedAt: new Date(),
    },
    select: { id: true },
  });
  await prisma.profile.upsert({
    where: { userId: owner.id },
    update: { displayName: "Theta-Space Beta Marketplace", tagline: "Realistic beta-test inventory" },
    create: { userId: owner.id, displayName: "Theta-Space Beta Marketplace", tagline: "Realistic beta-test inventory" },
  });
  return owner.id;
}

async function seedBetaListings() {
  requireConfirmation("Beta marketplace seed");
  if (!Number.isInteger(listingsPerCategory) || listingsPerCategory < 1 || listingsPerCategory > 100) {
    throw new Error("--per-category must be a whole number from 1 through 100.");
  }

  const ownerUserId = await ensureFixtureOwner();
  const fixtures = buildMarketplaceBetaFixtures(listingsPerCategory);
  const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  const listingRows: Prisma.MarketplaceListingCreateManyInput[] = fixtures.map((fixture, index) => ({
    id: fixture.slug,
    slug: fixture.slug,
    ownerUserId,
    publisherKind: MarketplacePublisherKind.PERSONAL,
    kind: fixture.kind,
    intent: fixture.intent,
    status: MarketplaceListingStatus.ACTIVE,
    title: fixture.title,
    summary: fixture.summary,
    description: fixture.description,
    category: fixture.category,
    subcategory: fixture.subcategory,
    condition: fixture.condition,
    templateVersion: 1,
    attributes: fixture.attributes as Prisma.InputJsonValue,
    priceType: fixture.priceType,
    priceCents: fixture.priceCents,
    priceMinCents: fixture.priceMinCents,
    priceMaxCents: fixture.priceMaxCents,
    currency: fixture.currency,
    countryCode: fixture.countryCode,
    region: fixture.region,
    city: fixture.city,
    remote: fixture.remote,
    deliveryAvailable: fixture.deliveryAvailable,
    contactInstructions: "Send an in-app message with your question and preferred timing.",
    allowInAppMessages: true,
    publishedAt: fixture.publishedAt,
    expiresAt,
    viewCount: 8 + ((index * 17) % 480),
    saveCount: (index * 7) % 34,
    inquiryCount: (index * 3) % 11,
    createdAt: fixture.createdAt,
    updatedAt: fixture.publishedAt,
  }));
  const mediaRows: Prisma.MediaAssetCreateManyInput[] = fixtures.map((fixture) => ({
    id: `${fixture.slug}-image`,
    ownerUserId,
    storageKey: `${BETA_PREFIX}media/${fixture.slug}.jpg`,
    publicUrl: fixture.imageUrl,
    mimeType: "image/jpeg",
    sizeBytes: BigInt(240_000),
    originalName: `${fixture.slug}.jpg`,
    status: MediaAssetStatus.READY,
    visibility: MediaVisibility.PUBLIC,
    metadata: { seedTag: MARKETPLACE_BETA_TAG, fixtureVersion: 1, source: "seed-marketplace-beta" },
    createdAt: fixture.createdAt,
    updatedAt: fixture.createdAt,
  }));
  const listingMediaRows: Prisma.MarketplaceListingMediaCreateManyInput[] = fixtures.map((fixture) => ({
    id: `${fixture.slug}-listing-media`,
    listingId: fixture.slug,
    mediaAssetId: `${fixture.slug}-image`,
    sortOrder: 0,
    altText: fixture.title,
    isPrimary: true,
    createdAt: fixture.createdAt,
  }));
  const eventRows: Prisma.MarketplaceListingEventCreateManyInput[] = fixtures.map((fixture) => ({
    id: `${fixture.slug}-published-event`,
    listingId: fixture.slug,
    actorUserId: ownerUserId,
    type: MarketplaceListingEventType.PUBLISHED,
    metadata: { seedTag: MARKETPLACE_BETA_TAG, fixtureVersion: 1, source: "seed-marketplace-beta" },
    createdAt: fixture.publishedAt,
  }));
  const facetRows: Prisma.MarketplaceListingFacetCreateManyInput[] = fixtures.flatMap((fixture) => [
    { id: `${fixture.slug}-facet-category`, listingId: fixture.slug, key: "category", valueText: fixture.category, createdAt: fixture.createdAt },
    ...(fixture.subcategory ? [{ id: `${fixture.slug}-facet-subcategory`, listingId: fixture.slug, key: "subcategory", valueText: fixture.subcategory, createdAt: fixture.createdAt }] : []),
    { id: `${fixture.slug}-facet-country`, listingId: fixture.slug, key: "countryCode", valueText: fixture.countryCode, createdAt: fixture.createdAt },
    { id: `${fixture.slug}-facet-city`, listingId: fixture.slug, key: "city", valueText: fixture.city, createdAt: fixture.createdAt },
  ]);

  let inserted = { listings: 0, media: 0, listingMedia: 0, events: 0, facets: 0 };
  for (const batch of chunks(listingRows)) inserted.listings += (await prisma.marketplaceListing.createMany({ data: batch, skipDuplicates: true })).count;
  for (const batch of chunks(mediaRows)) inserted.media += (await prisma.mediaAsset.createMany({ data: batch, skipDuplicates: true })).count;
  for (const batch of chunks(listingMediaRows)) inserted.listingMedia += (await prisma.marketplaceListingMedia.createMany({ data: batch, skipDuplicates: true })).count;
  for (const batch of chunks(eventRows)) inserted.events += (await prisma.marketplaceListingEvent.createMany({ data: batch, skipDuplicates: true })).count;
  for (const batch of chunks(facetRows)) inserted.facets += (await prisma.marketplaceListingFacet.createMany({ data: batch, skipDuplicates: true })).count;

  const byKind = fixtures.reduce<Record<string, number>>((totals, fixture) => {
    totals[fixture.kind] = (totals[fixture.kind] ?? 0) + 1;
    return totals;
  }, {});
  console.log(JSON.stringify({ action: "seed", listingsPerCategory, generated: fixtures.length, inserted, byKind, totals: await betaCounts() }, null, 2));
}

async function main() {
  if (cleanup) return cleanupBetaListings();
  if (!confirmed) {
    console.log(JSON.stringify({ action: "inspect", marker: MARKETPLACE_BETA_TAG, counts: await betaCounts() }, null, 2));
    return;
  }
  await seedBetaListings();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

