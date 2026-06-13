import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
  canCreateBazaarListing,
  getBazaarListingLifetimeDays,
  getBazaarListingMaxImageCount,
  getBazaarListingRollingLimit,
  getBazaarListingWeeklyLimit,
} from "@/lib/policy/tier-policy";
import { serializeAdPlacements } from "@/lib/ads/ads";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

function parseImageUrls(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry ?? "").trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const location = (searchParams.get("location") ?? "").trim();
  const minPrice = Number(searchParams.get("minPrice") ?? "");
  const maxPrice = Number(searchParams.get("maxPrice") ?? "");

  const listings = await prisma.bazaarListing.findMany({
    where: {
      status: "ACTIVE",
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { description: { contains: q } },
              { category: { contains: q } },
            ],
          }
        : {}),
      ...(location ? { location: { contains: location } } : {}),
      ...(!Number.isNaN(minPrice) ? { price: { gte: minPrice } } : {}),
      ...(!Number.isNaN(maxPrice) ? { price: { lte: maxPrice } } : {}),
    },
    include: {
      seller: { select: { id: true, username: true } },
      adPlacements: {
        include: { creator: { select: { id: true, username: true } } },
        orderBy: [{ createdAt: "desc" }],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
  const now = Date.now();

  return NextResponse.json(
    listings
      .map((listing) => {
        const parsedImages = parseImageUrls(listing.imageUrlsJson);
        const expiresAt = listing.expiresAt ?? addDays(listing.createdAt, 14);
        return {
          id: listing.id,
          title: listing.title,
          description: listing.description,
          price: listing.price,
          currency: listing.currency,
          location: listing.location,
          category: listing.category,
          imageUrls: parsedImages.slice(0, 3),
          expiresAt: expiresAt.toISOString(),
          staleSoon: expiresAt.getTime() - now <= 3 * 24 * 60 * 60 * 1000,
          seller: listing.seller,
          ads: serializeAdPlacements(listing.adPlacements),
        };
      })
      .filter((listing) => new Date(listing.expiresAt).getTime() > now),
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  if (!canCreateBazaarListing(policy)) {
    return NextResponse.json({ error: "Market listing creation is not allowed on this tier." }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    price?: number | string;
    location?: string;
    category?: string;
    imageUrls?: string[] | string;
  };

  const title = String(body.title ?? "").trim();
  const price = Number(body.price);
  if (!title || Number.isNaN(price) || price < 0) return NextResponse.json({ error: "Valid title and price are required" }, { status: 400 });
  const imageUrls = parseImageUrls(body.imageUrls);
  const maxImages = getBazaarListingMaxImageCount(policy);
  if (maxImages !== null && imageUrls.length > maxImages) {
    return NextResponse.json({ error: `Market listings can include up to ${maxImages} photos on this tier.` }, { status: 400 });
  }
  const weeklyLimit = getBazaarListingWeeklyLimit(policy);
  const rollingLimit = getBazaarListingRollingLimit(policy);
  if (weeklyLimit !== null || rollingLimit !== null) {
    const now = new Date();
    const weekAgo = addDays(now, -7);
    const twoWeeksAgo = addDays(now, -14);
    const [lastWeekCount, lastTwoWeeksCount] = await Promise.all([
      prisma.bazaarListing.count({ where: { sellerId: session.user.id, createdAt: { gte: weekAgo } } }),
      prisma.bazaarListing.count({ where: { sellerId: session.user.id, createdAt: { gte: twoWeeksAgo } } }),
    ]);
    if (weeklyLimit !== null && lastWeekCount >= weeklyLimit) {
      return NextResponse.json({ error: `Activist Market listings are limited to ${weeklyLimit} per week.` }, { status: 409 });
    }
    if (rollingLimit !== null && lastTwoWeeksCount >= rollingLimit) {
      return NextResponse.json({ error: `Activist Market listings are limited to ${rollingLimit} in any 2-week period.` }, { status: 409 });
    }
  }

  const listing = await prisma.bazaarListing.create({
    data: {
      sellerId: session.user.id,
      title,
      description: String(body.description ?? "").trim() || null,
      price,
      location: String(body.location ?? "").trim() || null,
      category: String(body.category ?? "").trim() || null,
      imageUrlsJson: imageUrls.length ? JSON.stringify(imageUrls.slice(0, 3)) : null,
      expiresAt: policy.tier === "PLUS" ? addDays(new Date(), getBazaarListingLifetimeDays(policy) ?? 14) : null,
    },
    include: { seller: { select: { id: true, username: true } } },
  });
  return NextResponse.json(listing);
}

