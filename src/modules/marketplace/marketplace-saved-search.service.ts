import { MarketplaceSavedSearchFrequency, NotificationKind, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/platform/db";
import { marketplaceSearchSchema, type MarketplaceSearchInput } from "./marketplace.contracts";
import { requireMarketplaceActor } from "./marketplace-policy";
import { searchMarketplaceListings } from "./marketplace-search.service";

const savedSearchInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  frequency: z.nativeEnum(MarketplaceSavedSearchFrequency).default(MarketplaceSavedSearchFrequency.NONE),
  query: z.unknown(),
});

const savedSearchUpdateSchema = savedSearchInputSchema.partial().extend({ enabled: z.boolean().optional() });

function serializeSearchQuery(query: MarketplaceSearchInput) {
  const { cursor: _cursor, limit: _limit, ...stored } = query;
  return stored as Prisma.InputJsonObject;
}

function searchHref(query: MarketplaceSearchInput) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.kind) params.set("kind", query.kind);
  if (query.intent) params.set("intent", query.intent);
  if (query.category) params.set("category", query.category);
  if (query.countryCode) params.set("country", query.countryCode);
  if (query.region) params.set("region", query.region);
  if (query.city) params.set("city", query.city);
  if (query.remote != null) params.set("remote", String(query.remote));
  return `/marketplace${params.size ? `?${params.toString()}` : ""}`;
}

export function savedSearchDueAt(frequency: MarketplaceSavedSearchFrequency, lastRunAt: Date | null, now = new Date()) {
  if (frequency === MarketplaceSavedSearchFrequency.NONE) return null;
  if (!lastRunAt) return now;
  const intervalMs = frequency === MarketplaceSavedSearchFrequency.IMMEDIATE
    ? 15 * 60 * 1_000
    : frequency === MarketplaceSavedSearchFrequency.DAILY
      ? 24 * 60 * 60 * 1_000
      : 7 * 24 * 60 * 60 * 1_000;
  return new Date(lastRunAt.getTime() + intervalMs);
}

export async function createMarketplaceSavedSearch(userId: string, input: unknown) {
  const parsed = savedSearchInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the saved search." };
  const actor = await requireMarketplaceActor(userId, "interact");
  if (!actor.ok) return actor;
  const query = marketplaceSearchSchema.parse(parsed.data.query);
  const savedSearch = await prisma.marketplaceSavedSearch.create({
    data: { userId, name: parsed.data.name, frequency: parsed.data.frequency, query: serializeSearchQuery(query) },
  });
  return { ok: true as const, savedSearch };
}

export async function updateMarketplaceSavedSearch(userId: string, savedSearchId: string, input: unknown) {
  const parsed = savedSearchUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the saved search." };
  const existing = await prisma.marketplaceSavedSearch.findFirst({ where: { id: savedSearchId, userId } });
  if (!existing) return { ok: false as const, error: "Saved search not found." };
  const query = parsed.data.query ? marketplaceSearchSchema.parse(parsed.data.query) : null;
  const savedSearch = await prisma.marketplaceSavedSearch.update({
    where: { id: existing.id },
    data: {
      name: parsed.data.name,
      frequency: parsed.data.frequency,
      enabled: parsed.data.enabled,
      query: query ? serializeSearchQuery(query) : undefined,
    },
  });
  return { ok: true as const, savedSearch };
}

export async function deleteMarketplaceSavedSearch(userId: string, savedSearchId: string) {
  const deleted = await prisma.marketplaceSavedSearch.deleteMany({ where: { id: savedSearchId, userId } });
  return deleted.count ? { ok: true as const } : { ok: false as const, error: "Saved search not found." };
}

export async function listMarketplaceSavedSearches(userId: string) {
  const actor = await requireMarketplaceActor(userId, "interact");
  if (!actor.ok) return actor;
  const savedSearches = await prisma.marketplaceSavedSearch.findMany({ where: { userId }, orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }] });
  return { ok: true as const, savedSearches };
}

export async function processDueMarketplaceSavedSearches(now = new Date(), take = 100) {
  const candidates = await prisma.marketplaceSavedSearch.findMany({
    where: { enabled: true, frequency: { not: MarketplaceSavedSearchFrequency.NONE } },
    orderBy: [{ lastRunAt: "asc" }, { createdAt: "asc" }],
    take: Math.max(1, Math.min(take, 500)),
  });
  let processed = 0;
  let notified = 0;
  for (const candidate of candidates) {
    const dueAt = savedSearchDueAt(candidate.frequency, candidate.lastRunAt, now);
    if (!dueAt || dueAt.getTime() > now.getTime()) continue;
    const parsed = marketplaceSearchSchema.safeParse(candidate.query);
    if (!parsed.success) {
      await prisma.marketplaceSavedSearch.update({ where: { id: candidate.id }, data: { enabled: false, lastRunAt: now } });
      processed += 1;
      continue;
    }
    const results = await searchMarketplaceListings({ ...parsed.data, sort: "newest", limit: 12 });
    const floor = candidate.lastNotifiedAt ?? candidate.createdAt;
    const newListings = results.items.filter((item) => item.publishedAt && new Date(item.publishedAt).getTime() > floor.getTime());
    const newestPublishedAt = newListings.reduce<Date | null>((latest, item) => {
      const value = item.publishedAt ? new Date(item.publishedAt) : null;
      return value && (!latest || value > latest) ? value : latest;
    }, null);
    await prisma.$transaction(async (transaction) => {
      await transaction.marketplaceSavedSearch.update({
        where: { id: candidate.id },
        data: { lastRunAt: now, lastNotifiedAt: newestPublishedAt ?? candidate.lastNotifiedAt },
      });
      if (newListings.length && newestPublishedAt) {
        await transaction.notification.upsert({
          where: { idempotencyKey: `market-search:${candidate.id}:${newestPublishedAt.toISOString()}` },
          create: {
            idempotencyKey: `market-search:${candidate.id}:${newestPublishedAt.toISOString()}`,
            userId: candidate.userId,
            kind: NotificationKind.GENERAL,
            sourceType: "MarketplaceSavedSearch",
            sourceId: candidate.id,
            title: `${newListings.length} new ${newListings.length === 1 ? "listing" : "listings"} for ${candidate.name}`,
            body: newListings.slice(0, 3).map((item) => item.title).join("; "),
            href: searchHref(parsed.data),
          },
          update: {},
        });
      }
    });
    processed += 1;
    if (newListings.length) notified += 1;
  }
  return { processed, notified };
}
