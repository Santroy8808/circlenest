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
  MembershipTier,
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
import { listStripeCreditPackages } from "@/modules/billing/stripe-credit-checkout.service";

const MODULE_KEY = "ads-credits";
const MIN_AD_HOLD_MS = 9000;
const MAX_AD_HOLD_MS = 45000;
const RESERVED_STREAM_MAX_AD_SHARE = 0.05;
const RESERVED_STREAM_MIN_SCORE = 8;

function hashForRotation(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

async function getAdCreateAccess(userId: string) {
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

  return {
    id: campaign.id,
    title: campaign.title,
    body: campaign.body,
    destinationUrl: campaign.destinationUrl,
    imageUrl,
    destinationKind: campaign.destinationKind,
    placement: campaign.placement,
    placementLabel: adPlacementLabels[campaign.placement],
    status: campaign.status,
    targetLocation: campaign.targetLocation,
    targetInterestLabels: campaign.targetInterests.map((target) => interestCategoryLabels[target.category]),
    subscriberTargetLabel: campaign.subscriberTargetManuscript?.title ?? null,
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
  const imageUrl = campaign.imageMediaAsset
    ? campaign.imageMediaAsset.publicUrl ?? `/api/media/assets/${campaign.imageMediaAsset.id}`
    : campaign.externalImageUrl;

  return {
    id: campaign.id,
    title: campaign.title,
    body: campaign.body,
    destinationUrl: campaign.destinationUrl,
    imageUrl,
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
  const [access, membership, campaigns, storefront, marketListings, businessArticles, writerManuscripts, pricingPackages, creditPackages] = await Promise.all([
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
    creditPackages
  };
}

export async function getAdPlacementPool(input: {
  viewerUserId?: string;
  placement: AdPlacement;
  limit?: number;
}) {
  if (input.placement === AdPlacement.RESERVED_STREAM && !(await canServeReservedStreamAd(input.viewerUserId))) {
    return [];
  }

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
    },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.max((input.limit ?? 16) * 3, 16)
  });

  const subscriberTargetManuscriptIds = [
    ...new Set(campaigns.map((campaign) => campaign.subscriberTargetManuscriptId).filter((id): id is string => Boolean(id)))
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
    ...new Set(campaigns.filter((campaign) => campaign.owner.membership?.tier === MembershipTier.ORG).map((campaign) => campaign.ownerUserId))
  ];
  const orgAdEligibleOwnerIds = await getOrgAdEligibleOwnerIds(input.viewerUserId, orgOwnerIds);
  const eligibleCampaigns = campaigns.filter((campaign) => {
    if (campaign.owner.membership?.tier === MembershipTier.ORG && !orgAdEligibleOwnerIds.has(campaign.ownerUserId)) return false;
    if (campaign.subscriberTargetManuscriptId && !viewerSubscribedManuscriptIds.has(campaign.subscriberTargetManuscriptId)) return false;
    if (campaign.targetInterests.length === 0) return true;
    if (!input.viewerUserId) return false;
    return campaign.targetInterests.some((target) => viewerInterestSet.has(target.category));
  });

  return weightedRotationSort(eligibleCampaigns)
    .slice(0, input.limit ?? 16)
    .map(toPlacementCard);
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

  const campaignCostCredits = access.fundraiserOnly ? Math.ceil(pricingRule.creditCost / 2) : pricingRule.creditCost;
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
        subscriberTargetManuscriptId: subscriberTarget.manuscriptId,
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
        targetInterests: true,
        subscriberTargetManuscript: {
          select: {
            title: true
          }
        }
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
    targetInterests: targetInterestCategories,
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
      endsAt: campaign.endsAt?.toISOString(),
      targetInterests: targetInterestCategories,
      subscriberTargetManuscriptId: subscriberTarget.manuscriptId
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

    // Delivery events are analytics only. Credits are charged when a package/time window is reserved.
  });

  await diagnostics.debug(MODULE_KEY, "Ad delivery event logged.", {
    campaignId: input.campaignId,
    viewerUserId: input.viewerUserId,
    placement: input.placement,
    eventType: input.eventType
  });
}
