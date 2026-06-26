import "./load-next-env";
import {
  AdCampaignStatus,
  AdDestinationKind,
  AdPlacement,
  MarketListingStatus,
  MediaVisibility,
  Prisma,
  PrismaClient
} from "@prisma/client";

const prisma = new PrismaClient();

const SEED_TAG = "[Seed Ad 10]";
const SEED_IMAGE_PREFIX = "seed/ads10/";
const DAY = 24 * 60 * 60 * 1000;
const AD_SCHEDULE_TIME_ZONE = "America/Los_Angeles";
const AD_SCHEDULE_SLOT_SECONDS = 30;
const AD_SCHEDULE_SLOT_MS = AD_SCHEDULE_SLOT_SECONDS * 1000;

type PlatformDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type ScheduleCampaign = {
  id: string;
  totalBudgetCredits: number;
  spentCredits: number;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
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

const adBodies = [
  "A storefront promotion with a clear destination and image preview for right-stream testing.",
  "A market-focused placement that should render as a normal paid ad in the desktop stream rail.",
  "A business article placement for checking title, copy, destination, and visual balance.",
  "A service-oriented ad with enough body copy to test real ad card wrapping.",
  "A member resource promotion intended to look like an active campaign, not a placeholder."
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function imageUrl(seed: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(slugify(seed))}/900/620`;
}

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

async function cleanupPriorSeedAds() {
  await prisma.adCampaign.deleteMany({
    where: {
      title: {
        startsWith: SEED_TAG
      }
    }
  });

  await prisma.mediaAsset.deleteMany({
    where: {
      storageKey: {
        startsWith: SEED_IMAGE_PREFIX
      }
    }
  });
}

async function getAdminUserId() {
  const admin = await prisma.user.findFirst({
    where: {
      role: "ADMIN"
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true
    }
  });

  if (!admin) {
    throw new Error("Need an admin or God account to recalculate the ad schedule after seeding.");
  }

  return admin.id;
}

async function getDestinationPool() {
  const businessProfiles = await prisma.businessProfile.findMany({
    where: {
      publicStorefrontEnabled: true
    },
    select: {
      id: true,
      ownerUserId: true,
      slug: true,
      businessName: true,
      tagline: true,
      location: true,
      owner: {
        select: {
          id: true,
          username: true
        }
      },
      articles: {
        where: {
          published: true
        },
        select: {
          id: true,
          slug: true,
          title: true
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 2
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: 10
  });

  if (businessProfiles.length === 0) {
    throw new Error("Need at least one public business storefront to seed ads.");
  }

  const listings = await prisma.marketListing.findMany({
    where: {
      status: MarketListingStatus.ACTIVE,
      sellerUserId: {
        in: businessProfiles.map((profile) => profile.ownerUserId)
      },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 20
  });

  return { businessProfiles, listings };
}

function chooseScheduleCampaign(input: {
  campaigns: ScheduleCampaign[];
  assignedCounts: Map<string, number>;
  startsAt: Date;
  endsAt: Date;
  lastCampaignId: string | null;
  consecutiveSlots: number;
}) {
  const active = input.campaigns.filter((campaign) => {
    const activeFrom = campaign.startsAt ?? campaign.createdAt;
    const activeUntil = campaign.endsAt ?? input.endsAt;
    return activeFrom <= input.startsAt && activeUntil >= input.endsAt && campaign.totalBudgetCredits > campaign.spentCredits;
  });
  const candidates =
    input.lastCampaignId && input.consecutiveSlots >= 4 && active.some((campaign) => campaign.id !== input.lastCampaignId)
      ? active.filter((campaign) => campaign.id !== input.lastCampaignId)
      : active;

  let chosen: ScheduleCampaign | null = null;
  let bestDue = Number.POSITIVE_INFINITY;

  for (const campaign of candidates) {
    const weight = Math.max(campaign.totalBudgetCredits - campaign.spentCredits, 1);
    const due = ((input.assignedCounts.get(campaign.id) ?? 0) + 1) / weight;

    if (due < bestDue || (due === bestDue && campaign.id.localeCompare(chosen?.id ?? "") < 0)) {
      chosen = campaign;
      bestDue = due;
    }
  }

  return chosen;
}

async function rebuildRightStreamSchedule(actorUserId: string) {
  const scheduleTables = await prisma.$queryRaw<Array<{ slotTable: string | null; runTable: string | null }>>`
    SELECT
      to_regclass('public."AdDisplayScheduleSlot"')::text AS "slotTable",
      to_regclass('public."AdDisplayScheduleRun"')::text AS "runTable"
  `;
  const hasScheduleTables = Boolean(scheduleTables[0]?.slotTable && scheduleTables[0]?.runTable);

  if (!hasScheduleTables) {
    return { slotCount: 0, campaignCount: 0, scheduleTablesPresent: false };
  }

  const now = new Date();
  const { start: scheduleDate, end: scheduledUntil } = getPlatformDayBounds(now);
  const scheduledFrom = roundUpToScheduleSlot(now);

  if (scheduledFrom >= scheduledUntil) {
    return { slotCount: 0, campaignCount: 0, scheduleTablesPresent: true };
  }

  await prisma.adDisplayScheduleSlot.deleteMany({
    where: {
      placement: AdPlacement.RIGHT_STREAM,
      startsAt: {
        gte: scheduledFrom,
        lt: scheduledUntil
      }
    }
  });

  const run = await prisma.adDisplayScheduleRun.create({
    data: {
      placement: AdPlacement.RIGHT_STREAM,
      scheduleDate,
      scheduledFrom,
      scheduledUntil,
      slotSeconds: AD_SCHEDULE_SLOT_SECONDS,
      forced: true,
      reason: "Seeded 10 right-stream ads and refreshed the remaining daily schedule",
      createdByUserId: actorUserId
    },
    select: {
      id: true
    }
  });

  const campaigns = await prisma.adCampaign.findMany({
    where: {
      placement: AdPlacement.RIGHT_STREAM,
      status: AdCampaignStatus.ACTIVE,
      OR: [{ startsAt: null }, { startsAt: { lt: scheduledUntil } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: scheduledFrom } }] }]
    },
    select: {
      id: true,
      totalBudgetCredits: true,
      spentCredits: true,
      startsAt: true,
      endsAt: true,
      createdAt: true
    }
  });

  const assignedCounts = new Map<string, number>();
  const slots: Prisma.AdDisplayScheduleSlotCreateManyInput[] = [];
  const totalSlots = Math.floor((scheduledUntil.getTime() - scheduledFrom.getTime()) / AD_SCHEDULE_SLOT_MS);
  let lastCampaignId: string | null = null;
  let consecutiveSlots = 0;

  for (let sequence = 0; sequence < totalSlots; sequence += 1) {
    const startsAt = new Date(scheduledFrom.getTime() + sequence * AD_SCHEDULE_SLOT_MS);
    const endsAt = new Date(startsAt.getTime() + AD_SCHEDULE_SLOT_MS);
    const campaign = chooseScheduleCampaign({
      campaigns,
      assignedCounts,
      startsAt,
      endsAt,
      lastCampaignId,
      consecutiveSlots
    });

    if (!campaign) continue;

    slots.push({
      runId: run.id,
      campaignId: campaign.id,
      placement: AdPlacement.RIGHT_STREAM,
      startsAt,
      endsAt,
      sequence,
      displaySeconds: AD_SCHEDULE_SLOT_SECONDS
    });

    assignedCounts.set(campaign.id, (assignedCounts.get(campaign.id) ?? 0) + 1);
    if (lastCampaignId === campaign.id) {
      consecutiveSlots += 1;
    } else {
      lastCampaignId = campaign.id;
      consecutiveSlots = 1;
    }
  }

  if (slots.length > 0) {
    await prisma.adDisplayScheduleSlot.createMany({ data: slots });
  }

  await prisma.adDisplayScheduleRun.update({
    where: { id: run.id },
    data: {
      slotCount: slots.length,
      campaignCount: assignedCounts.size
    }
  });

  return { slotCount: slots.length, campaignCount: assignedCounts.size, scheduleTablesPresent: true };
}

async function main() {
  const adminUserId = await getAdminUserId();
  const { businessProfiles, listings } = await getDestinationPool();

  await cleanupPriorSeedAds();

  const createdCampaignIds: string[] = [];
  const imageRows: Prisma.MediaAssetCreateManyInput[] = [];
  const campaignRows: Prisma.AdCampaignCreateManyInput[] = [];
  const now = new Date();

  for (let index = 0; index < 10; index += 1) {
    const business = businessProfiles[index % businessProfiles.length];
    const listing = listings.find((candidate) => candidate.sellerUserId === business.ownerUserId) ?? listings[index % Math.max(listings.length, 1)];
    const article = business.articles[index % Math.max(business.articles.length, 1)];
    const destinationMode = index % 3;
    const useListing = destinationMode === 1 && listing;
    const useArticle = destinationMode === 2 && article;
    const seed = `${business.slug}-seed-ad-${index + 1}`;
    const imageId = `seed-ad10-image-${String(index + 1).padStart(2, "0")}-${now.getTime()}`;
    const campaignId = `seed-ad10-campaign-${String(index + 1).padStart(2, "0")}-${now.getTime()}`;

    imageRows.push({
      id: imageId,
      ownerUserId: business.ownerUserId,
      storageKey: `${SEED_IMAGE_PREFIX}${String(index + 1).padStart(2, "0")}-${slugify(seed)}.jpg`,
      publicUrl: imageUrl(seed),
      mimeType: "image/jpeg",
      sizeBytes: BigInt(560_000 + index * 25_000),
      originalName: `seed-ad-${String(index + 1).padStart(2, "0")}.jpg`,
      visibility: MediaVisibility.PUBLIC,
      metadata: {
        demo: true,
        source: "seed-ten-ads",
        seed
      }
    });

    campaignRows.push({
      id: campaignId,
      ownerUserId: business.ownerUserId,
      businessProfileId: business.id,
      marketListingId: useListing ? listing.id : null,
      businessArticleId: useArticle ? article.id : null,
      imageMediaAssetId: imageId,
      title: `${SEED_TAG} ${index + 1}: ${useListing ? listing.title : useArticle ? article.title : business.businessName}`,
      body: `${adBodies[index % adBodies.length]} ${business.tagline ?? "Seeded campaign for ad-stream QA."}`,
      destinationUrl: useListing
        ? `/market/${listing.slug}`
        : useArticle
          ? `/storefront/${business.slug}/articles/${article.slug}`
          : `/storefront/${business.slug}`,
      destinationKind: useListing
        ? AdDestinationKind.MARKET_LISTING
        : useArticle
          ? AdDestinationKind.BUSINESS_ARTICLE
          : AdDestinationKind.STOREFRONT,
      placement: AdPlacement.RIGHT_STREAM,
      status: AdCampaignStatus.ACTIVE,
      targetLocation: business.location ?? listing?.location ?? null,
      totalBudgetCredits: 30 + index * 5,
      dailyBudgetCredits: 6 + (index % 4),
      spentCredits: index % 3,
      startsAt: new Date(now.getTime() - 60 * 60 * 1000),
      endsAt: new Date(now.getTime() + (7 + index) * DAY),
      createdAt: new Date(now.getTime() - (index + 1) * 45 * 60 * 1000)
    });

    createdCampaignIds.push(campaignId);
  }

  await prisma.mediaAsset.createMany({ data: imageRows });
  await prisma.adCampaign.createMany({ data: campaignRows });
  const scheduleResult = await rebuildRightStreamSchedule(adminUserId);

  const seededCount = await prisma.adCampaign.count({
    where: {
      title: {
        startsWith: SEED_TAG
      }
    }
  });
  const rightStreamSlots = scheduleResult.scheduleTablesPresent
    ? await prisma.adDisplayScheduleSlot.count({
        where: {
          placement: AdPlacement.RIGHT_STREAM,
          campaignId: {
            in: createdCampaignIds
          },
          endsAt: {
            gt: now
          }
        }
      })
    : 0;

  console.table({
    seededAds: seededCount,
    rightStreamSeedSlots: rightStreamSlots,
    rightStreamScheduledCampaigns: scheduleResult.campaignCount,
    scheduleTablesPresent: scheduleResult.scheduleTablesPresent
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
