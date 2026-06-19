import {
  AdCampaignStatus,
  AdDeliveryEventType,
  AdDestinationKind,
  AdPlacement,
  InterestCategory,
  MarketListingStatus,
  PlatformActivityEventType,
  Prisma
} from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  adPlacementLabels,
  createAdCampaignSchema,
  interestCategoryLabels,
  type AdCampaignCardView,
  type AdPlacementCardView,
  type AdsManagerView
} from "@/modules/ads-credits/types";
import {
  getActivePlatformCostRuleByKey,
  getAdPricingPackages,
  isAdPricingRuleCompatible
} from "@/modules/platform-pricing/platform-pricing.service";

const MODULE_KEY = "ads-credits";
const MIN_AD_HOLD_MS = 9000;
const MAX_AD_HOLD_MS = 45000;

function hashForRotation(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

async function getAdCreateAccess(userId: string) {
  const access = await canUserAccessFeature(userId, "ads.createGeneral");
  return { ...access, isAdmin: false };
}

type AdCampaignPayload = Prisma.AdCampaignGetPayload<{
  include: {
    imageMediaAsset: true;
    targetInterests: true;
  };
}>;

function toCampaignCard(campaign: AdCampaignPayload): AdCampaignCardView {
  return {
    id: campaign.id,
    title: campaign.title,
    body: campaign.body,
    destinationUrl: campaign.destinationUrl,
    imageUrl: campaign.imageMediaAsset?.publicUrl ?? campaign.externalImageUrl,
    destinationKind: campaign.destinationKind,
    placement: campaign.placement,
    placementLabel: adPlacementLabels[campaign.placement],
    status: campaign.status,
    targetLocation: campaign.targetLocation,
    targetInterestLabels: campaign.targetInterests.map((target) => interestCategoryLabels[target.category]),
    totalBudgetCredits: campaign.totalBudgetCredits,
    dailyBudgetCredits: campaign.dailyBudgetCredits,
    spentCredits: campaign.spentCredits,
    startsAt: campaign.startsAt?.toISOString() ?? null,
    endsAt: campaign.endsAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString()
  };
}

function toPlacementCard(campaign: AdCampaignPayload): AdPlacementCardView {
  const reservedCredits = Math.max(campaign.totalBudgetCredits, 0);
  const paidHoldMs = Math.min(Math.floor(reservedCredits / 4) * 1000, MAX_AD_HOLD_MS - MIN_AD_HOLD_MS);

  return {
    id: campaign.id,
    title: campaign.title,
    body: campaign.body,
    destinationUrl: campaign.destinationUrl,
    imageUrl: campaign.imageMediaAsset?.publicUrl ?? campaign.externalImageUrl,
    imageAlt: campaign.imageMediaAsset?.originalName ?? campaign.title,
    totalBudgetCredits: campaign.totalBudgetCredits,
    spentCredits: campaign.spentCredits,
    remainingCredits: reservedCredits,
    rotationHoldMs: MIN_AD_HOLD_MS + paidHoldMs
  };
}

function weightedRotationSort(campaigns: AdCampaignPayload[]) {
  const bucket = Math.floor(Date.now() / 30000);

  return [...campaigns].sort((left, right) => {
    const leftScore = Math.max(left.totalBudgetCredits, 0) * 1000 + (hashForRotation(`${left.id}:${bucket}`) % 997);
    const rightScore = Math.max(right.totalBudgetCredits, 0) * 1000 + (hashForRotation(`${right.id}:${bucket}`) % 997);

    return rightScore - leftScore;
  });
}

export async function getAdsManagerView(userId: string): Promise<AdsManagerView> {
  const [access, membership, campaigns, storefront, marketListings, businessArticles, pricingPackages] = await Promise.all([
    getAdCreateAccess(userId),
    prisma.membership.findUnique({
      where: { userId },
      select: { platformCredits: true }
    }),
    prisma.adCampaign.findMany({
      where: { ownerUserId: userId },
      include: {
        imageMediaAsset: true,
        targetInterests: true
      },
      orderBy: { createdAt: "desc" },
      take: 40
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
    getAdPricingPackages()
  ]);

  return {
    canCreate: access.allowed,
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
      }))
    },
    pricingPackages
  };
}

export async function getAdPlacementPool(input: {
  viewerUserId?: string;
  placement: AdPlacement;
  limit?: number;
}) {
  const now = new Date();
  const viewerInterests = input.viewerUserId
    ? await prisma.userInterest.findMany({
        where: { userId: input.viewerUserId },
        select: { category: true }
      })
    : [];
  const viewerInterestSet = new Set(viewerInterests.map((interest) => interest.category));
  const campaigns = await prisma.adCampaign.findMany({
    where: {
      placement: input.placement,
      status: AdCampaignStatus.ACTIVE,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [
        {
          OR: [{ endsAt: null }, { endsAt: { gte: now } }]
        }
      ]
    },
    include: {
      imageMediaAsset: true,
      targetInterests: true
    },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.max((input.limit ?? 16) * 3, 16)
  });

  const eligibleCampaigns = campaigns.filter((campaign) => {
    if (campaign.targetInterests.length === 0) return true;
    if (!input.viewerUserId) return false;
    return campaign.targetInterests.some((target) => viewerInterestSet.has(target.category));
  });

  return weightedRotationSort(eligibleCampaigns)
    .slice(0, input.limit ?? 16)
    .map(toPlacementCard);
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

    return {
      ok: true as const,
      businessProfileId: null,
      marketListingId: null,
      businessArticleId: null,
      destinationUrl
    };
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

function normalizeExternalImageUrl(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed) return null;

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

async function verifyAdImage(userId: string, imageMediaAssetId?: string) {
  if (!imageMediaAssetId) return { ok: true as const, imageMediaAssetId: null };

  const image = await prisma.mediaAsset.findFirst({
    where: {
      id: imageMediaAssetId,
      ownerUserId: userId,
      mimeType: {
        startsWith: "image/"
      }
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

  const campaignCostCredits = pricingRule.creditCost;
  const startsAt = new Date();
  const endsAt = pricingRule.durationDays ? new Date(startsAt.getTime() + pricingRule.durationDays * 24 * 60 * 60 * 1000) : null;
  const targetInterestCategories = [...new Set(parsed.data.targetInterestCategories)] as InterestCategory[];

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

  const image = await verifyAdImage(userId, parsed.data.imageMediaAssetId || undefined);

  if (!image.ok) {
    return image;
  }

  const externalImageUrl = image.imageMediaAssetId ? null : normalizeExternalImageUrl(parsed.data.externalImageUrl);

  if (!image.imageMediaAssetId && !externalImageUrl) {
    return { ok: false as const, error: "Upload an ad image or enter a valid image URL." };
  }

  const campaign = await prisma.$transaction(async (tx) => {
    if (!access.isAdmin) {
      await tx.membership.update({
        where: { userId },
        data: {
          platformCredits: {
            decrement: campaignCostCredits
          }
        }
      });
      await tx.adCreditLedgerEntry.create({
        data: {
          userId,
          amount: -campaignCostCredits,
          reason: `Reserved ad package: ${pricingRule.label}`,
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
        imageMediaAssetId: image.imageMediaAssetId,
        externalImageUrl,
        placement: parsed.data.placement,
        targetLocation: parsed.data.targetLocation || null,
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
        targetInterests: true
      }
    });
  });

  await diagnostics.info(MODULE_KEY, "Ad campaign created.", {
    userId,
    adCampaignId: campaign.id,
    placement: campaign.placement,
    pricingRuleKey: pricingRule.key,
    totalBudgetCredits: campaign.totalBudgetCredits,
    endsAt: campaign.endsAt?.toISOString(),
    targetInterests: targetInterestCategories
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
      endsAt: campaign.endsAt?.toISOString(),
      targetInterests: targetInterestCategories
    }
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
  await prisma.$transaction(async (tx) => {
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

    // Delivery events are analytics only. Credits are charged when a package/time window is reserved.
  });

  await diagnostics.debug(MODULE_KEY, "Ad delivery event logged.", {
    campaignId: input.campaignId,
    viewerUserId: input.viewerUserId,
    placement: input.placement,
    eventType: input.eventType
  });
}
