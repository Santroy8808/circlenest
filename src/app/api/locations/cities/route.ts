import { AdCampaignStatus, BusinessProfileKind, EventStatus, JobListingStatus, MarketListingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/platform/db";
import { searchCityLocations } from "@/lib/platform/city-locations";

async function getPlatformCityValues(query: string) {
  try {
    const [businessProfiles, marketListings, jobListings, events, adCampaigns] = await Promise.all([
      prisma.businessProfile.findMany({
        select: { location: true },
        take: 8,
        where: {
          location: { contains: query, mode: "insensitive" },
          profileKind: BusinessProfileKind.BUSINESS,
          publicStorefrontEnabled: true
        }
      }),
      prisma.marketListing.findMany({
        select: { location: true },
        take: 8,
        where: {
          location: { contains: query, mode: "insensitive" },
          status: MarketListingStatus.ACTIVE
        }
      }),
      prisma.jobListing.findMany({
        select: { location: true },
        take: 8,
        where: {
          location: { contains: query, mode: "insensitive" },
          remote: false,
          status: JobListingStatus.ACTIVE
        }
      }),
      prisma.event.findMany({
        select: { locationName: true },
        take: 8,
        where: {
          locationName: { contains: query, mode: "insensitive" },
          status: EventStatus.PUBLISHED
        }
      }),
      prisma.adCampaign.findMany({
        select: { targetLocation: true },
        take: 8,
        where: {
          status: AdCampaignStatus.ACTIVE,
          targetLocation: { contains: query, mode: "insensitive" }
        }
      })
    ]);

    return [
      ...businessProfiles.map((profile) => profile.location),
      ...marketListings.map((listing) => listing.location),
      ...jobListings.map((listing) => listing.location),
      ...events.map((event) => event.locationName),
      ...adCampaigns.map((campaign) => campaign.targetLocation)
    ].filter((value): value is string => Boolean(value));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = (searchParams.get("q") ?? "").trim().slice(0, 80);
  const limit = Number(searchParams.get("limit") ?? "8");

  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] }, { headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json(
    {
      suggestions: searchCityLocations(query, Number.isFinite(limit) ? limit : 8, await getPlatformCityValues(query))
    },
    { headers: { "cache-control": "no-store" } }
  );
}
