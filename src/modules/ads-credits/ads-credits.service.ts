import {
  AdCampaignStatus,
  AdDeliveryEventType,
  AdDestinationKind,
  AdPlacement,
  EventStatus,
  FundraiserStatus,
  InterestCategory,
  JobListingStatus,
  MarketListingStatus,
  MediaAssetStatus,
  MembershipTier,
  PlatformActivityEventType,
  Prisma,
  UserRole
} from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  adPlacementLabels,
  createAdCampaignSchema,
  interestCategoryLabels,
  normalizeAdTargetHashtag,
  type AdCampaignCardView,
  type AdScheduleAdminView,
  type AdScheduleRunView,
  type AdPlacementCardView,
  type AdsManagerView
} from "@/modules/ads-credits/types";
import {
  getActivePlatformCostRuleByKey,
  getAdPricingPackages,
  isAdPricingRuleCompatible
} from "@/modules/platform-pricing/platform-pricing.service";
import { listStripeCreditPackages } from "@/modules/billing/stripe-credit-checkout.service";
import { resolveAdCampaignBudget } from "@/modules/ads-credits/ad-budget";

const MODULE_KEY = "ads-credits";
const AD_SCHEDULE_TIME_ZONE = "America/Los_Angeles";
const AD_SCHEDULE_SLOT_SECONDS = 30;
const AD_SCHEDULE_SLOT_MS = AD_SCHEDULE_SLOT_SECONDS * 1000;
const AD_SCHEDULE_LOOKAHEAD_MS = 90 * 60 * 1000;
const MAX_CONSECUTIVE_SCHEDULE_SLOTS = 4;
const MAX_AD_HOLD_MS = 120000;
const RESERVED_STREAM_MAX_AD_SHARE = 0.05;
const RESERVED_STREAM_MIN_SCORE = 8;
const INSUFFICIENT_AD_CREDITS = "INSUFFICIENT_AD_CREDITS";

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function compareNullableDate(left: Date | null, right: Date | null) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.getTime() - right.getTime();
}

type PlatformDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const platformDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: AD_SCHEDULE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

function getPlatformDateParts(date: Date): PlatformDateParts {
  const parts = Object.fromEntries(platformDateFormatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function getPlatformTimeZoneOffsetMs(date: Date) {
  const parts = getPlatformDateParts(date);
  const wallTimeAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallTimeAsUtc - date.getTime();
}

function platformWallTimeToUtc(parts: Omit<PlatformDateParts, "hour" | "minute" | "second"> & Partial<Pick<PlatformDateParts, "hour" | "minute" | "second">>) {
  const wallTimeAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0);
  let utc = new Date(wallTimeAsUtc);

  for (let iteration = 0; iteration < 2; iteration += 1) {
    utc = new Date(wallTimeAsUtc - getPlatformTimeZoneOffsetMs(utc));
  }

  return utc;
}

function getPlatformDayBounds(date = new Date()) {
  const parts = getPlatformDateParts(date);
  const start = platformWallTimeToUtc({ year: parts.year, month: parts.month, day: parts.day });
  const end = platformWallTimeToUtc({ year: parts.year, month: parts.month, day: parts.day + 1 });

  return { start, end };
}

function roundUpToScheduleSlot(date: Date) {
  return new Date(Math.ceil(date.getTime() / AD_SCHEDULE_SLOT_MS) * AD_SCHEDULE_SLOT_MS);
}

function toScheduleRunView(run: {
  id: string;
  placement: AdPlacement;
  scheduleDate: Date;
  scheduledFrom: Date;
  scheduledUntil: Date;
  slotSeconds: number;
  slotCount: number;
  campaignCount: number;
  forced: boolean;
  reason: string | null;
  createdAt: Date;
}): AdScheduleRunView {
  return {
    id: run.id,
    placement: run.placement,
    placementLabel: adPlacementLabels[run.placement],
    scheduleDate: run.scheduleDate.toISOString(),
    scheduledFrom: run.scheduledFrom.toISOString(),
    scheduledUntil: run.scheduledUntil.toISOString(),
    slotSeconds: run.slotSeconds,
    slotCount: run.slotCount,
    campaignCount: run.campaignCount,
    forced: run.forced,
    reason: run.reason,
    createdAt: run.createdAt.toISOString()
  };
}

async function getAdCreateAccess(userId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  if (isAdminRole(actor?.role)) {
    return { allowed: true, reason: undefined, fundraiserOnly: false, isAdmin: true };
  }

  const generalAccess = await canUserAccessFeature(userId, "ads.createGeneral");
  if (generalAccess.allowed) {
    return { ...generalAccess, fundraiserOnly: false, isAdmin: false };
  }

  const fundraiserAccess = await canUserAccessFeature(userId, "ads.createFundraiser");
  return { ...fundraiserAccess, fundraiserOnly: fundraiserAccess.allowed, isAdmin: false };
}

type AdCampaignPayload = Prisma.AdCampaignGetPayload<{
  include: {
    imageMediaAsset: true;
    targetInterests: true;
    subscriberTargetManuscript: {
      select: {
        title: true;
      };
    };
  };
}>;

function toCampaignCard(campaign: AdCampaignPayload): AdCampaignCardView {
  const imageUrl = campaign.imageMediaAsset
    ? campaign.imageMediaAsset.publicUrl ?? `/api/media/assets/${campaign.imageMediaAsset.id}`
    : campaign.externalImageUrl;
  const remainingCredits = Math.max(campaign.totalBudgetCredits - campaign.spentCredits, 0);

  return {
    id: campaign.id,
    title: campaign.title,
    body: campaign.body,
    destinationUrl: campaign.destinationUrl,
    imageUrl,
    imageUrls: imageUrl ? [imageUrl] : [],
    carouselEnabled: campaign.carouselEnabled,
    destinationKind: campaign.destinationKind,
    placement: campaign.placement,
    placementLabel: adPlacementLabels[campaign.placement],
    status: campaign.status,
    targetLocation: campaign.targetLocation,
    targetInterestLabels: campaign.targetInterests.map((target) => interestCategoryLabels[target.category]),
    targetAgeRanges: campaign.targetAgeRanges,
    targetSexes: campaign.targetSexes,
    targetHashtags: campaign.targetHashtags,
    subscriberTargetLabel: campaign.subscriberTargetManuscript?.title ?? null,
    totalBudgetCredits: campaign.totalBudgetCredits,
    dailyBudgetCredits: campaign.dailyBudgetCredits,
    spentCredits: campaign.spentCredits,
    remainingCredits,
    startsAt: campaign.startsAt?.toISOString() ?? null,
    endsAt: campaign.endsAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString()
  };
}

function toPlacementCard(
  campaign: AdCampaignPayload,
  options: {
    rotationHoldMs?: number;
    scheduledStartAt?: Date;
    scheduledEndAt?: Date;
  } = {}
): AdPlacementCardView {
  const remainingCredits = Math.max(campaign.totalBudgetCredits - campaign.spentCredits, 0);
  const rotationHoldMs = options.rotationHoldMs ?? AD_SCHEDULE_SLOT_MS;
  const imageUrl = campaign.imageMediaAsset
    ? campaign.imageMediaAsset.publicUrl ?? `/api/media/assets/${campaign.imageMediaAsset.id}`
    : campaign.externalImageUrl;

  return {
    id: campaign.id,
    title: campaign.title,
    body: campaign.body,
    destinationUrl: campaign.destinationUrl,
    imageUrl,
    imageUrls: imageUrl ? [imageUrl] : [],
    carouselEnabled: campaign.carouselEnabled,
    minimumCarouselHoldMs: 3000,
    imageAlt: campaign.imageMediaAsset?.originalName ?? campaign.title,
    totalBudgetCredits: campaign.totalBudgetCredits,
    spentCredits: campaign.spentCredits,
    remainingCredits,
    rotationHoldMs: clampNumber(rotationHoldMs, 1000, MAX_AD_HOLD_MS),
    scheduledStartAt: options.scheduledStartAt?.toISOString(),
    scheduledEndAt: options.scheduledEndAt?.toISOString()
  };
}

async function reconcileEndedAdCampaigns(now = new Date()) {
  await prisma.$executeRaw`
    WITH campaign_spend AS (
      SELECT
        "id",
        CASE
          WHEN "startsAt" IS NOT NULL
            AND "endsAt" IS NOT NULL
            AND "endsAt" > "startsAt"
            AND ${now} >= "endsAt"
            THEN "totalBudgetCredits"
          WHEN "startsAt" IS NOT NULL
            AND "endsAt" IS NOT NULL
            AND "endsAt" > "startsAt"
            AND ${now} > "startsAt"
            THEN LEAST(
              "totalBudgetCredits",
              GREATEST(
                "spentCredits",
                FLOOR(
                  "totalBudgetCredits" *
                  EXTRACT(EPOCH FROM (${now} - "startsAt")) /
                  NULLIF(EXTRACT(EPOCH FROM ("endsAt" - "startsAt")), 0)
                )::int
              )
            )
          ELSE "spentCredits"
        END AS "nextSpentCredits"
      FROM "AdCampaign"
      WHERE "status" = 'ACTIVE'::"AdCampaignStatus"
    )
    UPDATE "AdCampaign" c
    SET
      "spentCredits" = cs."nextSpentCredits",
      "status" = CASE
        WHEN ("endsAt" IS NOT NULL AND "endsAt" <= ${now})
          OR cs."nextSpentCredits" >= c."totalBudgetCredits"
          THEN 'ENDED'::"AdCampaignStatus"
        ELSE c."status"
      END,
      "endsAt" = CASE
        WHEN cs."nextSpentCredits" >= c."totalBudgetCredits"
          AND (c."endsAt" IS NULL OR c."endsAt" > ${now})
          THEN ${now}
        ELSE c."endsAt"
      END,
      "updatedAt" = ${now}
    FROM campaign_spend cs
    WHERE c."id" = cs."id"
      AND (
        c."spentCredits" <> cs."nextSpentCredits"
        OR (c."endsAt" IS NOT NULL AND c."endsAt" <= ${now})
        OR cs."nextSpentCredits" >= c."totalBudgetCredits"
      )
  `;
}

type ScheduledAdCampaignPayload = Prisma.AdCampaignGetPayload<{
  include: {
    owner: {
      include: {
        businessProfile: true;
        membership: true;
      };
    };
    imageMediaAsset: true;
    targetInterests: true;
    subscriberTargetManuscript: {
      select: {
        title: true;
      };
    };
  };
}>;

type ScheduledAdSlotPayload = Prisma.AdDisplayScheduleSlotGetPayload<{
  include: {
    campaign: {
      include: {
        owner: {
          include: {
            businessProfile: true;
            membership: true;
          };
        };
        imageMediaAsset: true;
        targetInterests: true;
        subscriberTargetManuscript: {
          select: {
            title: true;
          };
        };
      };
    };
  };
}>;

type AdScheduleCandidate = {
  campaign: ScheduledAdCampaignPayload;
  activeFrom: Date;
  activeUntil: Date;
  weight: number;
};

function getCampaignScheduleCandidate(campaign: ScheduledAdCampaignPayload, scheduledFrom: Date, scheduledUntil: Date): AdScheduleCandidate | null {
  const campaignStart = campaign.startsAt ?? campaign.createdAt;
  const campaignUntil = campaign.endsAt ?? scheduledUntil;
  const activeFrom = new Date(Math.max(scheduledFrom.getTime(), campaignStart.getTime()));
  const activeUntil = new Date(Math.min(scheduledUntil.getTime(), campaignUntil.getTime()));
  const remainingCredits = Math.max(campaign.totalBudgetCredits - campaign.spentCredits, 0);

  if (remainingCredits <= 0 || activeUntil <= activeFrom) return null;

  const remainingCampaignMs = Math.max(campaignUntil.getTime() - activeFrom.getTime(), AD_SCHEDULE_SLOT_MS);
  const activeWindowMs = activeUntil.getTime() - activeFrom.getTime();
  const weight = remainingCredits * (activeWindowMs / remainingCampaignMs);

  if (weight <= 0) return null;

  return {
    campaign,
    activeFrom,
    activeUntil,
    weight
  };
}

function chooseScheduleCandidate(input: {
  candidates: AdScheduleCandidate[];
  assignedSlotCounts: Map<string, number>;
  lastCampaignId: string | null;
  consecutiveSlots: number;
}) {
  let candidates = input.candidates;

  if (input.lastCampaignId && input.consecutiveSlots >= MAX_CONSECUTIVE_SCHEDULE_SLOTS && candidates.some((candidate) => candidate.campaign.id !== input.lastCampaignId)) {
    candidates = candidates.filter((candidate) => candidate.campaign.id !== input.lastCampaignId);
  }

  let best: { candidate: AdScheduleCandidate; nextDue: number } | null = null;

  for (const candidate of candidates) {
    const nextDue = ((input.assignedSlotCounts.get(candidate.campaign.id) ?? 0) + 1) / candidate.weight;

    if (!best) {
      best = { candidate, nextDue };
      continue;
    }

    const dueDelta = nextDue - best.nextDue;
    const weightDelta = candidate.weight - best.candidate.weight;
    const startsAtDelta = compareNullableDate(candidate.campaign.startsAt, best.candidate.campaign.startsAt);

    if (
      dueDelta < -0.000001 ||
      (Math.abs(dueDelta) <= 0.000001 && weightDelta > 0.000001) ||
      (Math.abs(dueDelta) <= 0.000001 && Math.abs(weightDelta) <= 0.000001 && startsAtDelta < 0) ||
      (Math.abs(dueDelta) <= 0.000001 && Math.abs(weightDelta) <= 0.000001 && startsAtDelta === 0 && candidate.campaign.id.localeCompare(best.candidate.campaign.id) < 0)
    ) {
      best = { candidate, nextDue };
    }
  }

  return best?.candidate;
}

async function rebuildAdDisplaySchedule(input: {
  placement: AdPlacement;
  from: Date;
  until: Date;
  scheduleDate: Date;
  forced: boolean;
  actorUserId?: string;
  reason: string;
}) {
  if (input.until <= input.from) {
    return null;
  }

  await reconcileEndedAdCampaigns(input.from);

  await prisma.adDisplayScheduleSlot.deleteMany({
    where: {
      placement: input.placement,
      startsAt: {
        gte: input.from,
        lt: input.until
      }
    }
  });

  const run = await prisma.adDisplayScheduleRun.create({
    data: {
      placement: input.placement,
      scheduleDate: input.scheduleDate,
      scheduledFrom: input.from,
      scheduledUntil: input.until,
      slotSeconds: AD_SCHEDULE_SLOT_SECONDS,
      forced: input.forced,
      reason: input.reason,
      createdByUserId: input.actorUserId
    }
  });

  const campaigns = await prisma.adCampaign.findMany({
    where: {
      placement: input.placement,
      status: AdCampaignStatus.ACTIVE,
      OR: [{ startsAt: null }, { startsAt: { lt: input.until } }],
      AND: [
        {
          OR: [{ endsAt: null }, { endsAt: { gt: input.from } }]
        }
      ]
    },
    include: {
      owner: {
        include: {
          businessProfile: true,
          membership: true
        }
      },
      imageMediaAsset: true,
      targetInterests: true,
      subscriberTargetManuscript: {
        select: {
          title: true
        }
      }
    }
  });

  const candidates = campaigns
    .map((campaign) => getCampaignScheduleCandidate(campaign, input.from, input.until))
    .filter((candidate): candidate is AdScheduleCandidate => Boolean(candidate));
  const scheduledSlots: Prisma.AdDisplayScheduleSlotCreateManyInput[] = [];
  const assignedSlotCounts = new Map<string, number>();
  const totalSlotCount = Math.floor((input.until.getTime() - input.from.getTime()) / AD_SCHEDULE_SLOT_MS);
  let lastCampaignId: string | null = null;
  let consecutiveSlots = 0;

  for (let sequence = 0; sequence < totalSlotCount; sequence += 1) {
    const startsAt = new Date(input.from.getTime() + sequence * AD_SCHEDULE_SLOT_MS);
    const endsAt = new Date(startsAt.getTime() + AD_SCHEDULE_SLOT_MS);
    const activeCandidates = candidates.filter((candidate) => candidate.activeFrom <= startsAt && candidate.activeUntil >= endsAt);
    const chosen = chooseScheduleCandidate({
      candidates: activeCandidates,
      assignedSlotCounts,
      lastCampaignId,
      consecutiveSlots
    });

    if (!chosen) continue;

    scheduledSlots.push({
      runId: run.id,
      campaignId: chosen.campaign.id,
      placement: input.placement,
      startsAt,
      endsAt,
      sequence,
      displaySeconds: AD_SCHEDULE_SLOT_SECONDS
    });

    assignedSlotCounts.set(chosen.campaign.id, (assignedSlotCounts.get(chosen.campaign.id) ?? 0) + 1);

    if (chosen.campaign.id === lastCampaignId) {
      consecutiveSlots += 1;
    } else {
      lastCampaignId = chosen.campaign.id;
      consecutiveSlots = 1;
    }
  }

  if (scheduledSlots.length > 0) {
    await prisma.adDisplayScheduleSlot.createMany({
      data: scheduledSlots
    });
  }

  return prisma.adDisplayScheduleRun.update({
    where: { id: run.id },
    data: {
      slotCount: scheduledSlots.length,
      campaignCount: assignedSlotCounts.size
    }
  });
}

async function ensureAdDisplaySchedule(placement: AdPlacement, now = new Date()) {
  const { start: scheduleDate, end: scheduledUntil } = getPlatformDayBounds(now);
  const currentRun = await prisma.adDisplayScheduleRun.findFirst({
    where: {
      placement,
      scheduleDate,
      scheduledUntil: {
        gte: scheduledUntil
      }
    },
    select: {
      id: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (currentRun) return;

  await rebuildAdDisplaySchedule({
    placement,
    from: roundUpToScheduleSlot(now),
    until: scheduledUntil,
    scheduleDate,
    forced: false,
    reason: "Automatic daily ad schedule calculation"
  });
}

async function requireAdminActor(actorUserId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { role: true }
  });

  return isAdminRole(actor?.role);
}

export async function getAdScheduleAdminView(): Promise<AdScheduleAdminView> {
  const now = new Date();
  const { end: nextAutomaticRunAt } = getPlatformDayBounds(now);
  const latestRuns = await Promise.all(
    Object.values(AdPlacement).map((placement) =>
      prisma.adDisplayScheduleRun.findFirst({
        where: { placement },
        orderBy: { createdAt: "desc" }
      })
    )
  );

  return {
    timeZone: AD_SCHEDULE_TIME_ZONE,
    slotSeconds: AD_SCHEDULE_SLOT_SECONDS,
    nextAutomaticRunAt: nextAutomaticRunAt.toISOString(),
    latestRuns: latestRuns.filter((run): run is NonNullable<typeof run> => Boolean(run)).map(toScheduleRunView)
  };
}

export async function forceRecalculateAdDisplaySchedules(actorUserId: string) {
  if (!(await requireAdminActor(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const now = new Date();
  const { start: scheduleDate, end: scheduledUntil } = getPlatformDayBounds(now);
  const scheduledFrom = roundUpToScheduleSlot(now);

  if (scheduledFrom >= scheduledUntil) {
    return { ok: false as const, error: "There is no remaining schedule time today." };
  }

  const runs = (
    await Promise.all(
      Object.values(AdPlacement).map((placement) =>
        rebuildAdDisplaySchedule({
          placement,
          from: scheduledFrom,
          until: scheduledUntil,
          scheduleDate,
          forced: true,
          actorUserId,
          reason: "Admin forced recalculation for the rest of the day"
        })
      )
    )
  ).filter((run): run is NonNullable<typeof run> => Boolean(run));

  await prisma.adminAction.create({
    data: {
      actorUserId,
      actionKey: "ad-schedule",
      module: MODULE_KEY,
      status: "completed",
      metadata: {
        scheduledFrom: scheduledFrom.toISOString(),
        scheduledUntil: scheduledUntil.toISOString(),
        placements: runs.map((run) => ({
          placement: run.placement,
          slotCount: run.slotCount,
          campaignCount: run.campaignCount
        }))
      } as Prisma.InputJsonObject
    }
  });
  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "ad.schedule.recalculated",
    targetType: "AdDisplayScheduleRun",
    targetId: runs[0]?.id,
    severity: "warning",
    metadata: {
      scheduledFrom: scheduledFrom.toISOString(),
      scheduledUntil: scheduledUntil.toISOString(),
      runIds: runs.map((run) => run.id)
    }
  });
  await diagnostics.info(MODULE_KEY, "Ad display schedule recalculated by admin.", {
    actorUserId,
    scheduledFrom: scheduledFrom.toISOString(),
    scheduledUntil: scheduledUntil.toISOString(),
    runCount: runs.length
  });

  return { ok: true as const, view: await getAdScheduleAdminView(), runs: runs.map(toScheduleRunView) };
}

async function recalculatePlacementScheduleForRestOfDay(input: {
  placement: AdPlacement;
  actorUserId?: string;
  reason: string;
  forced?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const { start: scheduleDate, end: scheduledUntil } = getPlatformDayBounds(now);
  const scheduledFrom = roundUpToScheduleSlot(now);

  if (scheduledFrom >= scheduledUntil) return null;

  return rebuildAdDisplaySchedule({
    placement: input.placement,
    from: scheduledFrom,
    until: scheduledUntil,
    scheduleDate,
    forced: input.forced ?? false,
    actorUserId: input.actorUserId,
    reason: input.reason
  });
}

function mergeScheduledSlots(slots: ScheduledAdSlotPayload[], limit: number, now: Date) {
  const runs: Array<{ campaign: ScheduledAdCampaignPayload; startsAt: Date; endsAt: Date }> = [];

  slots.forEach((slot) => {
    const previous = runs[runs.length - 1];
    const previousMs = previous ? previous.endsAt.getTime() - previous.startsAt.getTime() : 0;

    if (previous && previous.campaign.id === slot.campaignId && previous.endsAt.getTime() === slot.startsAt.getTime() && previousMs < MAX_AD_HOLD_MS) {
      previous.endsAt = slot.endsAt;
      return;
    }

    runs.push({
      campaign: slot.campaign,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt
    });
  });

  return runs
    .filter((run) => run.endsAt > now)
    .slice(0, limit)
    .map((run) => {
      const holdFrom = run.startsAt <= now ? now : run.startsAt;
      return toPlacementCard(run.campaign, {
        rotationHoldMs: run.endsAt.getTime() - holdFrom.getTime(),
        scheduledStartAt: run.startsAt,
        scheduledEndAt: run.endsAt
      });
    });
}

function reservedStreamOrganicGap(totalActivityScore: number) {
  if (totalActivityScore >= 80) return 19;
  if (totalActivityScore >= 24) return 25;
  return 40;
}

function isReservedStreamExposureAllowed(metric: {
  mobileActivityScore: number;
  desktopActivityScore: number;
  reservedStreamOrganicUnits: number;
  reservedStreamAdImpressions: number;
  reservedStreamOrganicUnitsAtLastAd: number;
} | null) {
  if (!metric) return false;

  const totalActivityScore = metric.mobileActivityScore + metric.desktopActivityScore;
  if (totalActivityScore < RESERVED_STREAM_MIN_SCORE) return false;

  const organicUnitsSinceLastAd = metric.reservedStreamOrganicUnits - metric.reservedStreamOrganicUnitsAtLastAd;
  if (organicUnitsSinceLastAd < reservedStreamOrganicGap(totalActivityScore)) return false;

  const nextAdImpressions = metric.reservedStreamAdImpressions + 1;
  const nextTotalUnits = metric.reservedStreamOrganicUnits + nextAdImpressions;
  return nextTotalUnits > 0 && nextAdImpressions / nextTotalUnits <= RESERVED_STREAM_MAX_AD_SHARE;
}

async function canServeReservedStreamAd(viewerUserId?: string) {
  if (!viewerUserId) return false;

  const metric = await prisma.userApplicationUsageMetric.findUnique({
    where: { userId: viewerUserId },
    select: {
      mobileActivityScore: true,
      desktopActivityScore: true,
      reservedStreamOrganicUnits: true,
      reservedStreamAdImpressions: true,
      reservedStreamOrganicUnitsAtLastAd: true
    }
  });

  return isReservedStreamExposureAllowed(metric);
}

export async function recordReservedStreamOrganicFeedUnits(userId: string | undefined, unitCount: number, deviceClass: "MOBILE" | "DESKTOP" = "DESKTOP") {
  if (!userId || unitCount <= 0) return;

  const now = new Date();

  await prisma.userApplicationUsageMetric.upsert({
    where: { userId },
    update: {
      reservedStreamOrganicUnits: { increment: unitCount },
      lastSeenAt: now,
      ...(deviceClass === "MOBILE" ? { lastMobileSeenAt: now } : { lastDesktopSeenAt: now })
    },
    create: {
      userId,
      reservedStreamOrganicUnits: unitCount,
      lastSeenAt: now,
      lastMobileSeenAt: deviceClass === "MOBILE" ? now : undefined,
      lastDesktopSeenAt: deviceClass === "DESKTOP" ? now : undefined
    }
  });
}

export async function getAdsManagerView(userId: string): Promise<AdsManagerView> {
  await reconcileEndedAdCampaigns();

  const metricWindowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [access, membership, campaigns, metricEvents, storefront, marketListings, businessArticles, writerManuscripts, pricingPackages, creditPackages] = await Promise.all([
    getAdCreateAccess(userId),
    prisma.membership.findUnique({
      where: { userId },
      select: { platformCredits: true }
    }),
    prisma.adCampaign.findMany({
      where: { ownerUserId: userId },
      include: {
        imageMediaAsset: true,
        targetInterests: true,
        subscriberTargetManuscript: {
          select: {
            title: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 40
    }),
    prisma.adDeliveryLog.findMany({
      where: {
        campaign: {
          ownerUserId: userId
        },
        createdAt: {
          gte: metricWindowStart
        }
      },
      select: {
        campaignId: true,
        eventType: true,
        placement: true,
        createdAt: true,
        viewer: {
          select: {
            profile: {
              select: {
                location: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 5000
    }),
    prisma.businessProfile.findUnique({
      where: { ownerUserId: userId },
      select: {
        id: true,
        businessName: true,
        slug: true,
        publicStorefrontEnabled: true
      }
    }),
    prisma.marketListing.findMany({
      where: {
        sellerUserId: userId,
        status: MarketListingStatus.ACTIVE
      },
      select: {
        id: true,
        slug: true,
        title: true
      },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.businessArticle.findMany({
      where: {
        ownerUserId: userId,
        published: true
      },
      select: {
        id: true,
        slug: true,
        title: true,
        businessProfile: {
          select: {
            slug: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.writerManuscript.findMany({
      where: {
        authorUserId: userId
      },
      select: {
        id: true,
        slug: true,
        title: true,
        _count: {
          select: {
            subscriptions: true
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 80
    }),
    getAdPricingPackages(),
    listStripeCreditPackages()
  ]);

  return {
    canCreate: access.allowed,
    fundraiserOnly: access.fundraiserOnly,
    reason: access.reason,
    platformCredits: membership?.platformCredits ?? 0,
    campaigns: campaigns.map(toCampaignCard),
    destinationOptions: {
      storefronts: storefront?.publicStorefrontEnabled
        ? [{ id: storefront.id, label: storefront.businessName, href: `/storefront/${storefront.slug}` }]
        : [],
      marketListings: marketListings.map((listing) => ({
        id: listing.id,
        label: listing.title,
        href: `/market/${listing.slug}`
      })),
      businessArticles: businessArticles.map((article) => ({
        id: article.id,
        label: article.title,
        href: `/storefront/${article.businessProfile.slug}/articles/${article.slug}`
      })),
      writerManuscripts: writerManuscripts.map((manuscript) => ({
        id: manuscript.id,
        label: manuscript.title,
        href: `/writers-corner/${manuscript.slug}`,
        subscriberCount: manuscript._count.subscriptions
      }))
    },
    pricingPackages,
    creditPackages,
    metrics: {
      generatedAt: new Date().toISOString(),
      events: metricEvents.map((event) => ({
        campaignId: event.campaignId,
        eventType: event.eventType,
        placement: event.placement,
        viewerLocation: event.viewer?.profile?.location ?? null,
        createdAt: event.createdAt.toISOString()
      }))
    }
  };
}

export async function getAdPlacementPool(input: {
  viewerUserId?: string;
  placement: AdPlacement;
  limit?: number;
}) {
  const now = new Date();
  await reconcileEndedAdCampaigns(now);

  if (input.placement === AdPlacement.RESERVED_STREAM && !(await canServeReservedStreamAd(input.viewerUserId))) {
    return [];
  }

  await ensureAdDisplaySchedule(input.placement, now);

  const limit = input.limit ?? 16;
  const slots = await prisma.adDisplayScheduleSlot.findMany({
    where: {
      placement: input.placement,
      endsAt: {
        gt: now
      },
      startsAt: {
        lt: new Date(now.getTime() + AD_SCHEDULE_LOOKAHEAD_MS)
      },
      campaign: {
        status: AdCampaignStatus.ACTIVE
      }
    },
    include: {
      campaign: {
        include: {
          owner: {
            include: {
              businessProfile: true,
              membership: true
            }
          },
          imageMediaAsset: true,
          targetInterests: true,
          subscriberTargetManuscript: {
            select: {
              title: true
            }
          }
        }
      }
    },
    orderBy: [{ startsAt: "asc" }, { sequence: "asc" }],
    take: Math.max(limit * 12, 48)
  });

  const scheduledCampaigns = [...new Map(slots.map((slot) => [slot.campaign.id, slot.campaign])).values()];
  const viewerInterests = input.viewerUserId
    ? await prisma.userInterest.findMany({
        where: { userId: input.viewerUserId },
        select: { category: true }
      })
    : [];
  const viewerInterestSet = new Set(viewerInterests.map((interest) => interest.category));
  const campaignHashtagTargets = [...new Set(scheduledCampaigns.flatMap((campaign) => campaign.targetHashtags))];
  const viewerHashtagSet =
    input.viewerUserId && campaignHashtagTargets.length > 0
      ? new Set(
          (
            await prisma.userHashtagSignal.findMany({
              where: {
                userId: input.viewerUserId,
                isNegative: false,
                hashtag: {
                  normalized: {
                    in: campaignHashtagTargets
                  }
                }
              },
              select: {
                hashtag: {
                  select: {
                    normalized: true
                  }
                }
              },
              distinct: ["hashtagId"]
            })
          ).map((signal) => signal.hashtag.normalized)
        )
      : new Set<string>();
  const subscriberTargetManuscriptIds = [
    ...new Set(scheduledCampaigns.map((campaign) => campaign.subscriberTargetManuscriptId).filter((id): id is string => Boolean(id)))
  ];
  const viewerSubscribedManuscriptIds =
    input.viewerUserId && subscriberTargetManuscriptIds.length > 0
      ? new Set(
          (
            await prisma.writerManuscriptSubscription.findMany({
              where: {
                userId: input.viewerUserId,
                manuscriptId: {
                  in: subscriberTargetManuscriptIds
                }
              },
              select: {
                manuscriptId: true
              }
            })
          ).map((subscription) => subscription.manuscriptId)
        )
      : new Set<string>();

  const orgOwnerIds = [
    ...new Set(scheduledCampaigns.filter((campaign) => campaign.owner.membership?.tier === MembershipTier.ORG).map((campaign) => campaign.ownerUserId))
  ];
  const orgAdEligibleOwnerIds = await getOrgAdEligibleOwnerIds(input.viewerUserId, orgOwnerIds);
  const eligibleCampaignIds = new Set(scheduledCampaigns.filter((campaign) => {
    if (campaign.spentCredits >= campaign.totalBudgetCredits) return false;
    if (campaign.owner.membership?.tier === MembershipTier.ORG && !orgAdEligibleOwnerIds.has(campaign.ownerUserId)) return false;
    if (campaign.subscriberTargetManuscriptId && !viewerSubscribedManuscriptIds.has(campaign.subscriberTargetManuscriptId)) return false;
    if (campaign.targetInterests.length === 0 && campaign.targetHashtags.length === 0) return true;
    if (!input.viewerUserId) return false;
    if (campaign.targetInterests.some((target) => viewerInterestSet.has(target.category))) return true;
    return campaign.targetHashtags.some((hashtag) => viewerHashtagSet.has(hashtag));
  }).map((campaign) => campaign.id));

  return mergeScheduledSlots(slots.filter((slot) => eligibleCampaignIds.has(slot.campaignId)), limit, now);
}

async function getOrgAdEligibleOwnerIds(viewerUserId: string | undefined, orgOwnerIds: string[]) {
  const eligible = new Set<string>();

  if (!viewerUserId || orgOwnerIds.length === 0) return eligible;

  const [viewerScientology, orgProfiles, rsvps] = await Promise.all([
    prisma.scientologyProfile.findUnique({
      where: { userId: viewerUserId },
      select: { orgName: true }
    }),
    prisma.businessProfile.findMany({
      where: { ownerUserId: { in: orgOwnerIds } },
      select: {
        ownerUserId: true,
        businessName: true
      }
    }),
    prisma.eventRsvp.findMany({
      where: {
        userId: viewerUserId,
        event: {
          createdByUserId: { in: orgOwnerIds }
        }
      },
      select: {
        event: {
          select: {
            createdByUserId: true
          }
        }
      }
    })
  ]);

  const viewerOrgName = viewerScientology?.orgName?.trim().toLowerCase();

  if (viewerOrgName) {
    for (const profile of orgProfiles) {
      if (profile.businessName.trim().toLowerCase() === viewerOrgName) {
        eligible.add(profile.ownerUserId);
      }
    }
  }

  for (const rsvp of rsvps) {
    if (rsvp.event.createdByUserId) {
      eligible.add(rsvp.event.createdByUserId);
    }
  }

  return eligible;
}

async function resolveAdDestination(userId: string, input: {
  destinationKind: AdDestinationKind;
  marketListingId?: string;
  businessArticleId?: string;
  customDestinationUrl?: string;
}) {
  if (input.destinationKind === AdDestinationKind.EXTERNAL_URL) {
    const destinationUrl = normalizeCustomDestinationUrl(input.customDestinationUrl);

    if (!destinationUrl) {
      return { ok: false as const, error: "Enter a valid http(s) URL or internal /path for this ad." };
    }

    return verifyCustomAdDestination(userId, destinationUrl);
  }

  if (input.destinationKind === AdDestinationKind.STOREFRONT) {
    const storefront = await prisma.businessProfile.findUnique({
      where: { ownerUserId: userId },
      select: {
        id: true,
        slug: true,
        publicStorefrontEnabled: true
      }
    });

    if (!storefront?.publicStorefrontEnabled) {
      return { ok: false as const, error: "Publish a storefront before creating a storefront ad." };
    }

    return {
      ok: true as const,
      businessProfileId: storefront.id,
      marketListingId: null,
      businessArticleId: null,
      destinationUrl: `/storefront/${storefront.slug}`
    };
  }

  if (input.destinationKind === AdDestinationKind.MARKET_LISTING) {
    const listing = await prisma.marketListing.findFirst({
      where: {
        id: input.marketListingId || "",
        sellerUserId: userId,
        status: MarketListingStatus.ACTIVE
      },
      select: {
        id: true,
        slug: true
      }
    });

    if (!listing) {
      return { ok: false as const, error: "Choose one of your active Market listings for this ad." };
    }

    return {
      ok: true as const,
      businessProfileId: null,
      marketListingId: listing.id,
      businessArticleId: null,
      destinationUrl: `/market/${listing.slug}`
    };
  }

  const article = await prisma.businessArticle.findFirst({
    where: {
      id: input.businessArticleId || "",
      ownerUserId: userId,
      published: true
    },
    select: {
      id: true,
      slug: true,
      businessProfile: {
        select: {
          id: true,
          slug: true
        }
      }
    }
  });

  if (!article) {
    return { ok: false as const, error: "Choose one of your published storefront articles for this ad." };
  }

  return {
    ok: true as const,
    businessProfileId: article.businessProfile.id,
    marketListingId: null,
    businessArticleId: article.id,
    destinationUrl: `/storefront/${article.businessProfile.slug}/articles/${article.slug}`
  };
}

function parseInternalDestinationPath(destinationUrl: string) {
  if (!destinationUrl.startsWith("/") || destinationUrl.startsWith("//")) return null;

  try {
    const url = new URL(destinationUrl, "https://theta-space.local");
    return {
      pathname: url.pathname,
      suffix: `${url.search}${url.hash}`,
      parts: url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part))
    };
  } catch {
    return null;
  }
}

async function verifyCustomAdDestination(userId: string, destinationUrl: string) {
  const internal = parseInternalDestinationPath(destinationUrl);

  if (!internal) {
    return {
      ok: true as const,
      businessProfileId: null,
      marketListingId: null,
      businessArticleId: null,
      destinationUrl
    };
  }

  const [section, slugOrId, detailType, detailSlugOrId] = internal.parts;
  const genericError = "Choose one of your own listings, storefronts, events, fundraisers, jobs, or manuscripts for an internal ad destination.";

  if (section === "market" && slugOrId) {
    const listing = await prisma.marketListing.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
        sellerUserId: userId,
        status: MarketListingStatus.ACTIVE
      },
      select: {
        id: true,
        slug: true
      }
    });

    if (!listing) return { ok: false as const, error: "Choose one of your own active Market listings for this ad." };

    return {
      ok: true as const,
      businessProfileId: null,
      marketListingId: listing.id,
      businessArticleId: null,
      destinationUrl: `/market/${listing.slug}${internal.suffix}`
    };
  }

  if (section === "storefront" && slugOrId) {
    if (detailType === "articles" && detailSlugOrId) {
      const article = await prisma.businessArticle.findFirst({
        where: {
          OR: [{ id: detailSlugOrId }, { slug: detailSlugOrId }],
          ownerUserId: userId,
          published: true,
          businessProfile: {
            slug: slugOrId,
            ownerUserId: userId,
            publicStorefrontEnabled: true
          }
        },
        select: {
          id: true,
          slug: true,
          businessProfile: {
            select: {
              id: true,
              slug: true
            }
          }
        }
      });

      if (!article) return { ok: false as const, error: "Choose one of your own published storefront articles for this ad." };

      return {
        ok: true as const,
        businessProfileId: article.businessProfile.id,
        marketListingId: null,
        businessArticleId: article.id,
        destinationUrl: `/storefront/${article.businessProfile.slug}/articles/${article.slug}${internal.suffix}`
      };
    }

    if (detailType === "blogs" && detailSlugOrId) {
      const profile = await prisma.businessProfile.findFirst({
        where: {
          slug: slugOrId,
          ownerUserId: userId,
          publicStorefrontEnabled: true,
          blogEnabled: true
        },
        select: {
          id: true,
          slug: true
        }
      });
      const manuscript = await prisma.writerManuscript.findFirst({
        where: {
          OR: [{ id: detailSlugOrId }, { slug: detailSlugOrId }],
          authorUserId: userId,
          publishToStorefront: true
        },
        select: {
          slug: true
        }
      });

      if (!profile || !manuscript) return { ok: false as const, error: "Choose one of your own published storefront blogs for this ad." };

      return {
        ok: true as const,
        businessProfileId: profile.id,
        marketListingId: null,
        businessArticleId: null,
        destinationUrl: `/storefront/${profile.slug}/blogs/${manuscript.slug}${internal.suffix}`
      };
    }

    const storefront = await prisma.businessProfile.findFirst({
      where: {
        slug: slugOrId,
        ownerUserId: userId,
        publicStorefrontEnabled: true
      },
      select: {
        id: true,
        slug: true
      }
    });

    if (!storefront) return { ok: false as const, error: "Choose your own published storefront for this ad." };

    return {
      ok: true as const,
      businessProfileId: storefront.id,
      marketListingId: null,
      businessArticleId: null,
      destinationUrl: `/storefront/${storefront.slug}${internal.suffix}`
    };
  }

  if (section === "writers-corner" && slugOrId) {
    const manuscript = await prisma.writerManuscript.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
        authorUserId: userId
      },
      select: {
        id: true,
        slug: true
      }
    });

    if (!manuscript) return { ok: false as const, error: "Choose one of your own manuscripts for this ad." };

    if (detailType === "chapters" && detailSlugOrId) {
      const chapter = await prisma.writerChapter.findFirst({
        where: {
          id: detailSlugOrId,
          manuscriptId: manuscript.id
        },
        select: {
          id: true
        }
      });

      if (!chapter) return { ok: false as const, error: "Choose one of your own manuscript chapters for this ad." };

      return {
        ok: true as const,
        businessProfileId: null,
        marketListingId: null,
        businessArticleId: null,
        destinationUrl: `/writers-corner/${manuscript.slug}/chapters/${chapter.id}${internal.suffix}`
      };
    }

    return {
      ok: true as const,
      businessProfileId: null,
      marketListingId: null,
      businessArticleId: null,
      destinationUrl: `/writers-corner/${manuscript.slug}${internal.suffix}`
    };
  }

  if (section === "fundraisers" && slugOrId) {
    const fundraiser = await prisma.fundraiserCampaign.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
        creatorUserId: userId,
        status: FundraiserStatus.ACTIVE
      },
      select: {
        slug: true
      }
    });

    if (!fundraiser) return { ok: false as const, error: "Choose one of your own active fundraisers for this ad." };

    return {
      ok: true as const,
      businessProfileId: null,
      marketListingId: null,
      businessArticleId: null,
      destinationUrl: `/fundraisers/${fundraiser.slug}${internal.suffix}`
    };
  }

  if (section === "events" && slugOrId) {
    const event = await prisma.event.findFirst({
      where: {
        AND: [
          { OR: [{ id: slugOrId }, { slug: slugOrId }] },
          {
            OR: [
              { createdByUserId: userId },
              {
                moderators: {
                  some: {
                    userId
                  }
                }
              }
            ]
          }
        ],
        status: EventStatus.PUBLISHED,
      },
      select: {
        slug: true
      }
    });

    if (!event) return { ok: false as const, error: "Choose one of your own events or moderated event locations for this ad." };

    return {
      ok: true as const,
      businessProfileId: null,
      marketListingId: null,
      businessArticleId: null,
      destinationUrl: `/events/${event.slug}${internal.suffix}`
    };
  }

  if (section === "jobs" && slugOrId) {
    const job = await prisma.jobListing.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
        employerUserId: userId,
        status: JobListingStatus.ACTIVE
      },
      select: {
        slug: true
      }
    });

    if (!job) return { ok: false as const, error: "Choose one of your own active job listings for this ad." };

    return {
      ok: true as const,
      businessProfileId: null,
      marketListingId: null,
      businessArticleId: null,
      destinationUrl: `/jobs/${job.slug}${internal.suffix}`
    };
  }

  return { ok: false as const, error: genericError };
}

function normalizeCustomDestinationUrl(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed) return null;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

async function isOwnFundraiserDestination(userId: string, destinationUrl: string | null) {
  if (!destinationUrl?.startsWith("/fundraisers/")) return false;
  const slug = destinationUrl.split("?")[0]?.split("#")[0]?.split("/").filter(Boolean)[1];

  if (!slug) return false;

  const fundraiser = await prisma.fundraiserCampaign.findFirst({
    where: {
      OR: [{ id: slug }, { slug }],
      creatorUserId: userId
    },
    select: {
      id: true
    }
  });

  return Boolean(fundraiser);
}

async function resolveSubscriberTargetManuscript(userId: string, manuscriptId?: string) {
  const trimmed = manuscriptId?.trim();

  if (!trimmed) {
    return { ok: true as const, manuscriptId: null, title: null };
  }

  const manuscript = await prisma.writerManuscript.findFirst({
    where: {
      id: trimmed,
      authorUserId: userId
    },
    select: {
      id: true,
      title: true
    }
  });

  if (!manuscript) {
    return { ok: false as const, error: "Choose one of your manuscripts for subscriber targeting." };
  }

  return { ok: true as const, manuscriptId: manuscript.id, title: manuscript.title };
}

async function verifyAdImage(userId: string, imageMediaAssetId?: string) {
  if (!imageMediaAssetId) return { ok: true as const, imageMediaAssetId: null };

  const image = await prisma.mediaAsset.findFirst({
    where: {
      id: imageMediaAssetId,
      ownerUserId: userId,
      status: MediaAssetStatus.READY,
      mimeType: { in: ["image/jpeg", "image/png", "image/webp", "image/gif"] }
    },
    select: {
      id: true
    }
  });

  if (!image) {
    return { ok: false as const, error: "That ad image could not be used." };
  }

  return { ok: true as const, imageMediaAssetId: image.id };
}

export async function createAdCampaign(userId: string, input: unknown) {
  const parsed = createAdCampaignSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid ad campaign." };
  }

  const access = await getAdCreateAccess(userId);

  if (!access.allowed) {
    return { ok: false as const, error: access.reason ?? "Professional or Auditor access required." };
  }

  const pricingRule = await getActivePlatformCostRuleByKey(parsed.data.pricingRuleKey);

  if (!pricingRule) {
    return { ok: false as const, error: "Choose an active pricing package." };
  }

  if (!isAdPricingRuleCompatible(parsed.data.placement, pricingRule.subject)) {
    return { ok: false as const, error: "That pricing package does not match the selected placement." };
  }

  const budget = resolveAdCampaignBudget({
    ruleCredits: pricingRule.creditCost,
    ruleDurationDays: pricingRule.durationDays,
    fundraiserDiscount: access.fundraiserOnly,
    requestedCredits: parsed.data.totalBudgetCredits,
    requestedDurationDays: parsed.data.campaignDurationDays
  });

  if (!budget.ok) return budget;

  const campaignCostCredits = budget.credits;
  const campaignDurationDays = budget.durationDays;
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + campaignDurationDays * 24 * 60 * 60 * 1000);
  const targetInterestCategories = [...new Set(parsed.data.targetInterestCategories)] as InterestCategory[];
  const targetAgeRanges = [...new Set(parsed.data.targetAgeRanges)];
  const targetSexes = [...new Set(parsed.data.targetSexes)];
  const targetHashtags = [...new Set(parsed.data.targetHashtags.map(normalizeAdTargetHashtag).filter(Boolean))];

  const membership = await prisma.membership.findUnique({
    where: { userId },
    select: { platformCredits: true }
  });

  if (!access.isAdmin && (membership?.platformCredits ?? 0) < campaignCostCredits) {
    return { ok: false as const, error: "Not enough platform credits for this ad budget." };
  }

  const destination = await resolveAdDestination(userId, {
    destinationKind: parsed.data.destinationKind,
    marketListingId: parsed.data.marketListingId || undefined,
    businessArticleId: parsed.data.businessArticleId || undefined,
    customDestinationUrl: parsed.data.customDestinationUrl || undefined
  });

  if (!destination.ok) {
    return destination;
  }

  if (access.fundraiserOnly && !(await isOwnFundraiserDestination(userId, destination.destinationUrl))) {
    return { ok: false as const, error: "Org ads can only promote one of the org's fundraiser pages." };
  }

  const subscriberTarget = await resolveSubscriberTargetManuscript(userId, parsed.data.subscriberTargetManuscriptId || undefined);

  if (!subscriberTarget.ok) {
    return subscriberTarget;
  }

  const image = await verifyAdImage(userId, parsed.data.imageMediaAssetId || undefined);

  if (!image.ok) {
    return image;
  }

  if (!image.imageMediaAssetId) {
    return { ok: false as const, error: "Upload a verified image for this ad." };
  }

  const externalImageUrl = null;

  let campaign: AdCampaignPayload;

  try {
    campaign = await prisma.$transaction(async (tx) => {
      if (!access.isAdmin) {
        const debit = await tx.membership.updateMany({
          where: {
            userId,
            platformCredits: {
              gte: campaignCostCredits
            }
          },
          data: {
            platformCredits: {
              decrement: campaignCostCredits
            }
          }
        });

        if (debit.count !== 1) {
          throw new Error(INSUFFICIENT_AD_CREDITS);
        }

        await tx.adCreditLedgerEntry.create({
          data: {
            userId,
            amount: -campaignCostCredits,
            reason: `Reserved ad campaign: ${campaignCostCredits} credits for ${campaignDurationDays} day${campaignDurationDays === 1 ? "" : "s"} (${pricingRule.label})`,
            sourceType: "PlatformCostRule",
            sourceId: pricingRule.id
          }
        });
      }

      return tx.adCampaign.create({
        data: {
          ownerUserId: userId,
          title: parsed.data.title,
          body: parsed.data.body,
          destinationUrl: destination.destinationUrl,
          destinationKind: parsed.data.destinationKind,
          businessProfileId: destination.businessProfileId,
          marketListingId: destination.marketListingId,
          businessArticleId: destination.businessArticleId,
          subscriberTargetManuscriptId: subscriberTarget.manuscriptId,
          imageMediaAssetId: image.imageMediaAssetId,
          externalImageUrl,
          placement: parsed.data.placement,
          targetLocation: parsed.data.targetLocation || null,
          targetAgeRanges,
          targetSexes,
          targetHashtags,
          totalBudgetCredits: campaignCostCredits,
          dailyBudgetCredits: null,
          startsAt,
          endsAt,
          targetInterests:
            targetInterestCategories.length > 0
              ? {
                  createMany: {
                    data: targetInterestCategories.map((category) => ({ category }))
                  }
                }
              : undefined
        },
        include: {
          imageMediaAsset: true,
          targetInterests: true,
          subscriberTargetManuscript: {
            select: {
              title: true
            }
          }
        }
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === INSUFFICIENT_AD_CREDITS) {
      return { ok: false as const, error: "Not enough platform credits for this ad budget." };
    }

    throw error;
  }

  await diagnostics.info(MODULE_KEY, "Ad campaign created.", {
    userId,
    adCampaignId: campaign.id,
    placement: campaign.placement,
    pricingRuleKey: pricingRule.key,
    totalBudgetCredits: campaign.totalBudgetCredits,
    campaignDurationDays,
    endsAt: campaign.endsAt?.toISOString(),
    targetInterests: targetInterestCategories,
    targetAgeRanges,
    targetSexes,
    targetHashtags,
    subscriberTargetManuscriptId: subscriberTarget.manuscriptId
  });
  await writeAuditLog({
    actorUserId: userId,
    module: MODULE_KEY,
    action: "ad.campaign.created",
    targetType: "AdCampaign",
    targetId: campaign.id,
    metadata: {
      placement: campaign.placement,
      pricingRuleKey: pricingRule.key,
      totalBudgetCredits: campaign.totalBudgetCredits,
      campaignDurationDays,
      endsAt: campaign.endsAt?.toISOString(),
      targetInterests: targetInterestCategories,
      targetAgeRanges,
      targetSexes,
      targetHashtags,
      subscriberTargetManuscriptId: subscriberTarget.manuscriptId
    }
  });
  await recalculatePlacementScheduleForRestOfDay({
    placement: campaign.placement,
    actorUserId: userId,
    reason: "Campaign created"
  });

  return { ok: true as const, campaign: toCampaignCard(campaign) };
}

export async function logAdDelivery(input: {
  campaignId: string;
  viewerUserId?: string;
  placement: AdPlacement;
  eventType: AdDeliveryEventType;
  metadata?: Record<string, unknown>;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const campaign = await tx.adCampaign.findFirst({
      where: {
        id: input.campaignId,
        placement: input.placement
      },
      select: {
        id: true
      }
    });

    if (!campaign) {
      return { logged: false as const };
    }

    await tx.adDeliveryLog.create({
      data: {
        campaignId: input.campaignId,
        viewerUserId: input.viewerUserId,
        placement: input.placement,
        eventType: input.eventType,
        metadata: input.metadata as Prisma.InputJsonObject | undefined
      }
    });
    await tx.platformActivityEvent.create({
      data: {
        userId: input.viewerUserId,
        eventType: PlatformActivityEventType.AD_INTERACTION,
        module: MODULE_KEY,
        action: input.eventType.toLowerCase(),
        targetType: "AdCampaign",
        targetId: input.campaignId,
        metadata: {
          placement: input.placement,
          ...(input.metadata ?? {})
        } as Prisma.InputJsonObject
      }
    });
    if (input.viewerUserId && input.placement === AdPlacement.RESERVED_STREAM && input.eventType === AdDeliveryEventType.IMPRESSION) {
      const metric = await tx.userApplicationUsageMetric.findUnique({
        where: { userId: input.viewerUserId },
        select: { reservedStreamOrganicUnits: true }
      });

      await tx.userApplicationUsageMetric.upsert({
        where: { userId: input.viewerUserId },
        update: {
          reservedStreamAdImpressions: { increment: 1 },
          reservedStreamOrganicUnitsAtLastAd: metric?.reservedStreamOrganicUnits ?? 0,
          lastReservedStreamAdAt: new Date()
        },
        create: {
          userId: input.viewerUserId,
          reservedStreamAdImpressions: 1,
          reservedStreamOrganicUnitsAtLastAd: 0,
          lastReservedStreamAdAt: new Date()
        }
      });
    }

    return { logged: true as const };
  });

  await diagnostics.debug(MODULE_KEY, result.logged ? "Ad delivery event logged." : "Ad delivery event skipped.", {
    campaignId: input.campaignId,
    viewerUserId: input.viewerUserId,
    placement: input.placement,
    eventType: input.eventType,
    logged: result.logged
  });

  return result;
}

export async function endAdCampaign(userId: string, campaignId: string) {
  const campaign = await prisma.adCampaign.findFirst({
    where: {
      id: campaignId,
      ownerUserId: userId
    },
    include: {
      imageMediaAsset: true,
      targetInterests: true,
      subscriberTargetManuscript: {
        select: {
          title: true
        }
      }
    }
  });

  if (!campaign) {
    return { ok: false as const, error: "Campaign not found." };
  }

  if (campaign.status === AdCampaignStatus.ARCHIVED) {
    return { ok: false as const, error: "Archived campaigns cannot be changed." };
  }

  if (campaign.status === AdCampaignStatus.ENDED) {
    return { ok: true as const, campaign: toCampaignCard(campaign) };
  }

  const now = new Date();
  const updatedCampaign = await prisma.adCampaign.update({
    where: {
      id: campaign.id
    },
    data: {
      status: AdCampaignStatus.ENDED,
      endsAt: !campaign.endsAt || campaign.endsAt > now ? now : campaign.endsAt
    },
    include: {
      imageMediaAsset: true,
      targetInterests: true,
      subscriberTargetManuscript: {
        select: {
          title: true
        }
      }
    }
  });

  await diagnostics.info(MODULE_KEY, "Ad campaign ended by owner.", {
    userId,
    adCampaignId: campaign.id
  });
  await writeAuditLog({
    actorUserId: userId,
    module: MODULE_KEY,
    action: "ad.campaign.ended",
    targetType: "AdCampaign",
    targetId: campaign.id,
    metadata: {
      endedByOwner: true,
      previousEndsAt: campaign.endsAt?.toISOString() ?? null
    }
  });
  await recalculatePlacementScheduleForRestOfDay({
    placement: updatedCampaign.placement,
    actorUserId: userId,
    reason: "Campaign ended by owner"
  });

  return { ok: true as const, campaign: toCampaignCard(updatedCampaign) };
}
