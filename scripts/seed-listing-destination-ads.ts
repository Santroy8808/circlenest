import {
  AdCampaignStatus,
  AdDestinationKind,
  AdPlacement,
  MarketListingStatus,
  MediaVisibility,
  PrismaClient
} from "@prisma/client";

const prisma = new PrismaClient();
const SEED_TAG = "[Demo Listing Ad]";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function imageUrl(seed: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(slugify(seed))}/720/720`;
}

async function main() {
  const listings = await prisma.marketListing.findMany({
    where: {
      status: MarketListingStatus.ACTIVE,
      seller: {
        businessProfile: {
          is: {
            publicStorefrontEnabled: true
          }
        }
      },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    },
    include: {
      seller: {
        include: {
          businessProfile: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 2
  });

  if (listings.length < 2) {
    throw new Error("Need at least two active business Market listings to seed listing-destination ads.");
  }

  await prisma.adCampaign.deleteMany({
    where: {
      title: {
        startsWith: SEED_TAG
      }
    }
  });

  for (const [index, listing] of listings.entries()) {
    const businessProfile = listing.seller.businessProfile;

    if (!businessProfile) {
      continue;
    }

    const image = await prisma.mediaAsset.create({
      data: {
        ownerUserId: listing.sellerUserId,
        storageKey: `demo/listing-destination-ads/${listing.slug}-${Date.now()}-${index + 1}.jpg`,
        publicUrl: imageUrl(`${listing.slug}-listing-ad-${index + 1}`),
        mimeType: "image/jpeg",
        sizeBytes: BigInt(420_000),
        originalName: `${listing.slug}-listing-ad.jpg`,
        visibility: MediaVisibility.PUBLIC,
        metadata: {
          demo: true,
          module: "listing-destination-ads"
        }
      }
    });

    await prisma.adCampaign.create({
      data: {
        ownerUserId: listing.sellerUserId,
        businessProfileId: businessProfile.id,
        marketListingId: listing.id,
        imageMediaAssetId: image.id,
        title: `${SEED_TAG} ${listing.title}`,
        body: `Opens directly to the full listing from ${businessProfile.businessName}.`,
        destinationUrl: `/market/${listing.slug}`,
        destinationKind: AdDestinationKind.MARKET_LISTING,
        placement: AdPlacement.RIGHT_STREAM,
        status: AdCampaignStatus.ACTIVE,
        targetLocation: listing.location ?? businessProfile.location,
        totalBudgetCredits: 12,
        dailyBudgetCredits: 3,
        spentCredits: 0,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      }
    });
  }

  console.log(`Seeded ${listings.length} listing-destination ads. Clicks go to /market/<listing-slug>.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
