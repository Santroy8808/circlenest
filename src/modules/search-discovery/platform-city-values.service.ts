import { AdCampaignStatus, BusinessProfileKind, EventStatus, JobListingStatus, MarketListingStatus } from "@prisma/client";
import { prisma } from "@/lib/platform/db";

const PLATFORM_CITY_CACHE_TTL_MS = 10 * 60 * 1000;
const PLATFORM_CITY_CACHE_LIMIT = 128;
const PLATFORM_CITY_PREFIX_LENGTH = 2;
const PLATFORM_CITY_QUERY_LIMIT = 64;

type PlatformCityCacheEntry = {
  expiresAt: number;
  values: string[];
};

const cache = new Map<string, PlatformCityCacheEntry>();
const refreshes = new Map<string, Promise<string[]>>();

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function platformCityCacheKey(query: string) {
  return normalize(query).replace(/\s+/g, "").slice(0, PLATFORM_CITY_PREFIX_LENGTH);
}

export function filterPlatformCityValues(values: string[], query: string) {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < PLATFORM_CITY_PREFIX_LENGTH) return [];
  return values.filter((value) => normalize(value).includes(normalizedQuery));
}

function store(key: string, values: string[]) {
  cache.delete(key);
  cache.set(key, { expiresAt: Date.now() + PLATFORM_CITY_CACHE_TTL_MS, values });
  if (cache.size > PLATFORM_CITY_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
}

async function loadPlatformCityValues(prefix: string) {
  const [businessProfiles, marketListings, jobListings, events, adCampaigns] = await Promise.all([
    prisma.businessProfile.findMany({
      distinct: ["location"],
      select: { location: true },
      take: PLATFORM_CITY_QUERY_LIMIT,
      where: {
        location: { startsWith: prefix, mode: "insensitive" },
        profileKind: BusinessProfileKind.BUSINESS,
        publicStorefrontEnabled: true
      }
    }),
    prisma.marketListing.findMany({
      distinct: ["location"],
      select: { location: true },
      take: PLATFORM_CITY_QUERY_LIMIT,
      where: {
        location: { startsWith: prefix, mode: "insensitive" },
        status: MarketListingStatus.ACTIVE
      }
    }),
    prisma.jobListing.findMany({
      distinct: ["location"],
      select: { location: true },
      take: PLATFORM_CITY_QUERY_LIMIT,
      where: {
        location: { startsWith: prefix, mode: "insensitive" },
        remote: false,
        status: JobListingStatus.ACTIVE
      }
    }),
    prisma.event.findMany({
      distinct: ["locationName"],
      select: { locationName: true },
      take: PLATFORM_CITY_QUERY_LIMIT,
      where: {
        locationName: { startsWith: prefix, mode: "insensitive" },
        status: EventStatus.PUBLISHED
      }
    }),
    prisma.adCampaign.findMany({
      distinct: ["targetLocation"],
      select: { targetLocation: true },
      take: PLATFORM_CITY_QUERY_LIMIT,
      where: {
        status: AdCampaignStatus.ACTIVE,
        targetLocation: { startsWith: prefix, mode: "insensitive" }
      }
    })
  ]);

  return [
    ...businessProfiles.map((profile) => profile.location),
    ...marketListings.map((listing) => listing.location),
    ...jobListings.map((listing) => listing.location),
    ...events.map((event) => event.locationName),
    ...adCampaigns.map((campaign) => campaign.targetLocation)
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
}

function refresh(key: string) {
  const activeRefresh = refreshes.get(key);
  if (activeRefresh) return activeRefresh;

  const nextRefresh = loadPlatformCityValues(key)
    .then((values) => {
      store(key, values);
      return values;
    })
    .catch(() => cache.get(key)?.values ?? [])
    .finally(() => refreshes.delete(key));
  refreshes.set(key, nextRefresh);
  return nextRefresh;
}

/**
 * Returns immediately from the bounded server cache and refreshes stale data in
 * the background. Platform-entered locations supplement the complete world-city
 * index; a slow database can therefore never block the typeahead response.
 */
export function getCachedPlatformCityValues(query: string) {
  const key = platformCityCacheKey(query);
  if (key.length < PLATFORM_CITY_PREFIX_LENGTH) return [];

  const cached = cache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) void refresh(key);
  return filterPlatformCityValues(cached?.values ?? [], query);
}

export async function warmPlatformCityValues(query: string) {
  const key = platformCityCacheKey(query);
  if (key.length < PLATFORM_CITY_PREFIX_LENGTH) return [];
  return filterPlatformCityValues(await refresh(key), query);
}
