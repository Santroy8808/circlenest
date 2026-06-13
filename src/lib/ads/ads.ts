import { prisma } from "@/lib/db/prisma";
import { getMonthlyAdCredits, type TierPolicy } from "@/lib/policy/tier-policy";

export const AD_TARGET_TYPES = ["BAZAAR_LISTING", "EVENT_LISTING", "JOB_LISTING", "FUNDRAISER_LISTING"] as const;
export type AdTargetType = (typeof AD_TARGET_TYPES)[number];

export const AD_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

export const AD_CREDIT_ENTRY_TYPES = ["MONTHLY_GRANT", "AD_SPEND"] as const;
export type AdCreditEntryType = (typeof AD_CREDIT_ENTRY_TYPES)[number];

export type AdPlacementSummary = Readonly<{
  id: string;
  headline: string;
  body: string | null;
  creditCost: number;
  boostFactor: number;
  status: string;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  creator: Readonly<{
    id: string;
    username: string;
  }>;
}>;

type AdPlacementSource = {
  id: string;
  headline: string;
  body: string | null;
  creditCost: number;
  boostFactor?: number | null;
  status: string;
  startsAt: Date | string;
  endsAt: Date | string | null;
  createdAt: Date | string;
  creator: {
    id: string;
    username: string;
  };
};

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function serializeAdPlacement(ad: AdPlacementSource): AdPlacementSummary {
  return {
    id: ad.id,
    headline: ad.headline,
    body: ad.body,
    creditCost: ad.creditCost,
    boostFactor: typeof ad.boostFactor === "number" ? ad.boostFactor : 1,
    status: ad.status,
    startsAt: normalizeDate(ad.startsAt),
    endsAt: ad.endsAt ? normalizeDate(ad.endsAt) : null,
    createdAt: normalizeDate(ad.createdAt),
    creator: {
      id: ad.creator.id,
      username: ad.creator.username,
    },
  };
}

export function serializeAdPlacements(ads: AdPlacementSource[]): AdPlacementSummary[] {
  return ads.map((ad) => serializeAdPlacement(ad));
}

export function readAdBoostFactor(ad: Record<string, unknown> | null | undefined) {
  const boostFactor = ad?.boostFactor;
  return typeof boostFactor === "number" ? boostFactor : 1;
}

export function resolveAdRotationSeed(now = new Date()) {
  return Math.floor(now.getTime() / 60000);
}

export function pickRotatingAd<T>(ads: readonly T[], slotIndex: number, seed = resolveAdRotationSeed()) {
  if (!ads.length) return null;
  const normalizedSeed = Math.abs(seed) % ads.length;
  return ads[(normalizedSeed + slotIndex) % ads.length];
}

export function resolveAdPeriodKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function getAdCreditCost(policy: TierPolicy) {
  return policy.tier === "PRO" || policy.tier === "AUDITOR" ? 1 : 0;
}

export function canCreateTargetAd(policy: TierPolicy, targetType: string) {
  return (policy.isAdmin || policy.tier === "PRO" || policy.tier === "AUDITOR") && AD_TARGET_TYPES.includes(targetType as AdTargetType);
}

export function requiresAdCredits(policy: TierPolicy) {
  return policy.tier === "PRO" || policy.tier === "AUDITOR";
}

export async function ensureMonthlyProAdCredits(userId: string, policy: TierPolicy, now = new Date()) {
  const credits = getMonthlyAdCredits(policy);
  if ((policy.tier !== "PRO" && policy.tier !== "AUDITOR") || credits <= 0) return 0;

  const periodKey = resolveAdPeriodKey(now);
  await prisma.adCreditLedger.upsert({
    where: {
      ledgerKey: `MONTHLY_GRANT:${userId}:${periodKey}`,
    },
    create: {
      ledgerKey: `MONTHLY_GRANT:${userId}:${periodKey}`,
      userId,
      entryType: "MONTHLY_GRANT",
      periodKey,
      credits,
      sourceType: "SYSTEM",
      sourceId: periodKey,
      note: `${policy.tier === "AUDITOR" ? "Auditor" : "Pro"} monthly ad credits for ${periodKey}`,
    },
    update: {},
  });

  return credits;
}

export async function getAdCreditBalance(userId: string) {
  const aggregate = await prisma.adCreditLedger.aggregate({
    where: { userId },
    _sum: { credits: true },
  });
  return aggregate._sum.credits ?? 0;
}

export async function getProAdCreditBalance(userId: string, policy: TierPolicy, now = new Date()) {
  if (policy.tier !== "PRO" && policy.tier !== "AUDITOR") return 0;
  await ensureMonthlyProAdCredits(userId, policy, now);
  return getAdCreditBalance(userId);
}

export async function spendAdCreditForPlacement(input: {
  userId: string;
  adPlacementId: string;
  creditCost: number;
  note?: string | null;
  now?: Date;
}) {
  if (input.creditCost <= 0) return null;
  const periodKey = resolveAdPeriodKey(input.now ?? new Date());
  return prisma.adCreditLedger.upsert({
    where: {
      ledgerKey: `AD_SPEND:${input.adPlacementId}`,
    },
    create: {
      ledgerKey: `AD_SPEND:${input.adPlacementId}`,
      userId: input.userId,
      entryType: "AD_SPEND",
      periodKey,
      credits: -input.creditCost,
      sourceType: "AD_PLACEMENT",
      sourceId: input.adPlacementId,
      note: input.note ?? null,
    },
    update: {},
  });
}
