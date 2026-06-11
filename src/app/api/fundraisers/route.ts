import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { canCreateFundRaiser, getMonthlyFundraiserLimit } from "@/lib/policy/tier-policy";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";
import { FUNDRAISER_TYPES, isFundraiserType } from "@/lib/fundraisers/fundraisers";

function isSafeUploadUrl(value: string) {
  return value.startsWith("/api/media/") || value.startsWith("/uploads/");
}

function normalizeOptional(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function normalizeRequired(value: unknown) {
  return String(value ?? "").trim();
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = normalizeRequired(searchParams.get("q"));
  const locationCountry = normalizeRequired(searchParams.get("locationCountry"));
  const locationState = normalizeRequired(searchParams.get("locationState"));
  const locationCity = normalizeRequired(searchParams.get("locationCity"));
  const fundraiserType = normalizeRequired(searchParams.get("fundraiserType"));

  const fundraisers = await prisma.fundraiser.findMany({
    where: {
      status: "ACTIVE",
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { description: { contains: q } },
              { organizerName: { contains: q } },
              { charityName: { contains: q } },
              { organizationName: { contains: q } },
              { campaignName: { contains: q } },
              { otherDescription: { contains: q } },
            ],
          }
        : {}),
      ...(locationCountry ? { locationCountry: { contains: locationCountry } } : {}),
      ...(locationState ? { locationState: { contains: locationState } } : {}),
      ...(locationCity ? { locationCity: { contains: locationCity } } : {}),
      ...(fundraiserType ? { fundraiserType } : {}),
    },
    include: {
      creator: { select: { id: true, username: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({
    fundraisers: fundraisers.map((fundraiser) => ({
      ...fundraiser,
      typeLabel: FUNDRAISER_TYPES.includes(fundraiser.fundraiserType as (typeof FUNDRAISER_TYPES)[number])
        ? fundraiser.fundraiserType
        : "OTHER",
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  if (!canCreateFundRaiser(policy)) {
    return NextResponse.json({ error: "Fund raiser creation is not allowed on this tier." }, { status: 403 });
  }
  const monthlyLimit = getMonthlyFundraiserLimit(policy);
  if (monthlyLimit !== null) {
    const now = new Date();
    const monthCount = await prisma.fundraiser.count({
      where: {
        creatorId: session.user.id,
        createdAt: {
          gte: startOfMonth(now),
          lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        },
      },
    });
    if (monthCount >= monthlyLimit) {
      return NextResponse.json({ error: `Activist fund raisers are limited to ${monthlyLimit} per month.` }, { status: 409 });
    }
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const organizerName = normalizeRequired(body.organizerName);
  const fundraiserType = normalizeRequired(body.fundraiserType).toUpperCase();
  const title = normalizeRequired(body.title);
  const description = normalizeRequired(body.description);
  const goalAmount = Number(body.goalAmount);
  const locationCountry = normalizeRequired(body.locationCountry);
  const locationState = normalizeRequired(body.locationState);
  const locationCity = normalizeRequired(body.locationCity);
  const currentOrg = normalizeOptional(body.currentOrg);
  const currentService = normalizeOptional(body.currentService);
  const additionalNotes = normalizeOptional(body.additionalNotes);
  const bannerUrl = normalizeOptional(body.bannerUrl);
  const allowDirectMessages = body.allowDirectMessages === false || body.allowDirectMessages === "false" ? false : true;

  if (!organizerName || !isFundraiserType(fundraiserType) || !title || !description || Number.isNaN(goalAmount) || goalAmount <= 0) {
    return NextResponse.json({ error: "Required fields are missing." }, { status: 400 });
  }
  if (!locationCountry || !locationState || !locationCity) {
    return NextResponse.json({ error: "Location is required." }, { status: 400 });
  }
  if (bannerUrl && !isSafeUploadUrl(bannerUrl)) {
    return NextResponse.json({ error: "Invalid banner upload." }, { status: 400 });
  }

  const charityName = normalizeOptional(body.charityName);
  const organizationName = normalizeOptional(body.organizationName);
  const campaignName = normalizeOptional(body.campaignName);
  const otherDescription = normalizeOptional(body.otherDescription);

  if (fundraiserType === "CHARITY" && !charityName) {
    return NextResponse.json({ error: "Charity name is required." }, { status: 400 });
  }
  if (fundraiserType === "ORG" && !organizationName) {
    return NextResponse.json({ error: "Organization name is required." }, { status: 400 });
  }
  if (fundraiserType === "4D_CAMPAIGN" && !campaignName) {
    return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
  }
  if (fundraiserType === "OTHER" && !otherDescription) {
    return NextResponse.json({ error: "Other description is required." }, { status: 400 });
  }

  const fundraiser = await prisma.fundraiser.create({
    data: {
      creatorId: session.user.id,
      organizerName,
      fundraiserType,
      charityName,
      organizationName,
      campaignName,
      otherDescription,
      title,
      description,
      goalAmount,
      locationCountry,
      locationState,
      locationCity,
      currentOrg,
      currentService,
      additionalNotes,
      bannerUrl,
      allowDirectMessages,
    },
    select: {
      id: true,
      title: true,
      fundraiserType: true,
      goalAmount: true,
      creatorId: true,
    },
  });

  return NextResponse.json({ fundraiser }, { status: 201 });
}
