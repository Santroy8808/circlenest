import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
  calculateAdRankScore,
  canCreateAdCampaign,
  isAdCampaignTargetType,
  normalizeCampaignStatus,
  serializeAdCampaigns,
} from "@/lib/ads/campaigns";
import { getAdCreditBalance, getProAdCreditBalance, resolveAdPeriodKey } from "@/lib/ads/ads";
import { serializeBusinessProfile } from "@/lib/business/business-profile";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

function asText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNullableText(value: unknown) {
  const text = asText(value);
  return text ? text : null;
}

function asNonNegativeInt(value: unknown) {
  const number = typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function asNullableDate(value: unknown) {
  const text = asText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolvePlacementTarget(targetType: string, targetId: string | null) {
  if (!targetId) return {};
  if (targetType === "MARKET_LISTING") return { bazaarListingId: targetId };
  if (targetType === "EVENT_LISTING") return { eventId: targetId };
  if (targetType === "JOB_LISTING") return { jobListingId: targetId };
  if (targetType === "FUNDRAISER_LISTING") return { fundraiserId: targetId };
  return {};
}

async function getCampaignActor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(userId, user);
  const businessProfile = await prisma.businessProfile.findUnique({
    where: { ownerId: userId },
    include: {
      owner: { select: { id: true, username: true, fullName: true } },
      complianceProfile: {
        select: { processorOnboardingStatus: true, processorChargesEnabled: true, processorPayoutsEnabled: true },
      },
    },
  });
  const businessSummary = businessProfile ? serializeBusinessProfile(businessProfile) : null;
  return { user, policy, businessProfile, businessSummary };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const campaigns = await prisma.adCampaign.findMany({
    where: { creatorId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      businessProfile: { select: { id: true, businessName: true, storefrontSlug: true } },
      landingArticle: { select: { id: true, title: true, body: true, heroImageUrl: true, ctaLabel: true, ctaUrl: true, status: true } },
      _count: { select: { impressions: true, clicks: true, engagements: true } },
    },
  });

  return NextResponse.json({ campaigns: serializeAdCampaigns(campaigns) });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = asText(payload.title);
  const targetType = asText(payload.targetType).toUpperCase();
  const targetId = asNullableText(payload.targetId);
  const articleTitle = asText(payload.articleTitle, title);
  const articleBody = asText(payload.articleBody);
  const status = normalizeCampaignStatus(asText(payload.status, "DRAFT"));
  const budgetAmountCents = asNonNegativeInt(payload.budgetAmountCents);
  const platformCreditBudget = asNonNegativeInt(payload.platformCreditBudget);
  const dailyBudgetCents = payload.dailyBudgetCents === null || payload.dailyBudgetCents === undefined ? null : asNonNegativeInt(payload.dailyBudgetCents);
  const startsAt = asNullableDate(payload.startsAt);
  const endsAt = asNullableDate(payload.endsAt);

  if (!title) {
    return NextResponse.json({ error: "Campaign title is required." }, { status: 400 });
  }
  if (!isAdCampaignTargetType(targetType)) {
    return NextResponse.json({ error: "Choose a valid campaign target." }, { status: 400 });
  }
  if (!articleTitle || !articleBody) {
    return NextResponse.json({ error: "Landing article title and body are required." }, { status: 400 });
  }
  if (!asNullableText(payload.imageUrl) && !targetId) {
    return NextResponse.json({ error: "Campaign requires an image or a specific target ID." }, { status: 400 });
  }
  if (!startsAt || !endsAt) {
    return NextResponse.json({ error: "Campaign start and end dates are required." }, { status: 400 });
  }
  if (startsAt && endsAt && startsAt >= endsAt) {
    return NextResponse.json({ error: "End date must be after the start date." }, { status: 400 });
  }
  if (budgetAmountCents <= 0 && platformCreditBudget <= 0) {
    return NextResponse.json({ error: "Campaign requires a cash budget note or platform credit budget." }, { status: 400 });
  }

  const { policy, businessProfile, businessSummary } = await getCampaignActor(session.user.id);
  if (!canCreateAdCampaign(policy)) {
    return NextResponse.json({ error: "Upgrade to Biz or Auditor to create ad campaigns." }, { status: 403 });
  }
  if (!policy.isAdmin && policy.tier === "PRO" && (!businessProfile || !businessSummary?.completion.reviewReady)) {
    return NextResponse.json({ error: "Complete Company Profile before launching Biz ad campaigns." }, { status: 403 });
  }

  const balance = await getProAdCreditBalance(session.user.id, policy);
  if (platformCreditBudget > balance) {
    return NextResponse.json({ error: `Not enough platform ad credits. Current balance: ${balance}.` }, { status: 400 });
  }

  const now = new Date();
  const campaign = await prisma.$transaction(async (tx) => {
    const createdCampaign = await tx.adCampaign.create({
      data: {
        creatorId: session.user.id,
        businessProfileId: businessProfile?.id ?? null,
        title,
        status,
        budgetAmountCents,
        platformCreditBudget,
        startsAt,
        endsAt,
        dailyBudgetCents,
        targetType,
        targetId,
        imageUrl: asNullableText(payload.imageUrl),
      },
    });

    const article = await tx.adArticle.create({
      data: {
        campaignId: createdCampaign.id,
        title: articleTitle,
        body: articleBody,
        heroImageUrl: asNullableText(payload.heroImageUrl),
        ctaLabel: asNullableText(payload.ctaLabel),
        ctaUrl: asNullableText(payload.ctaUrl),
        status: status === "ACTIVE" ? "ACTIVE" : "DRAFT",
      },
    });

    const updatedCampaign = await tx.adCampaign.update({
      where: { id: createdCampaign.id },
      data: { landingArticleId: article.id },
      include: {
        businessProfile: { select: { id: true, businessName: true, storefrontSlug: true } },
        landingArticle: { select: { id: true, title: true, body: true, heroImageUrl: true, ctaLabel: true, ctaUrl: true, status: true } },
        _count: { select: { impressions: true, clicks: true, engagements: true } },
      },
    });

    const placement = await tx.adPlacement.create({
      data: {
        creatorId: session.user.id,
        campaignId: updatedCampaign.id,
        targetType,
        ...resolvePlacementTarget(targetType, targetId),
        headline: title,
        body: articleBody.slice(0, 240),
        creditCost: platformCreditBudget,
        boostFactor: 1,
        status: status === "ACTIVE" ? "ACTIVE" : "PAUSED",
        startsAt: startsAt ?? now,
        endsAt,
      },
    });

    if (platformCreditBudget > 0) {
      await tx.adCreditLedger.create({
        data: {
          ledgerKey: `AD_SPEND:CAMPAIGN:${updatedCampaign.id}`,
          userId: session.user.id,
          entryType: "AD_SPEND",
          periodKey: resolveAdPeriodKey(now),
          credits: -platformCreditBudget,
          sourceType: "AD_CAMPAIGN",
          sourceId: updatedCampaign.id,
          note: `Reserved ${platformCreditBudget} platform credits for campaign ${title}`,
        },
      });
    }

    await tx.dailyAdRankingSnapshot.create({
      data: {
        campaignId: updatedCampaign.id,
        dateKey: now.toISOString().slice(0, 10),
        spendWeight: Math.log10(Math.max(1, budgetAmountCents + platformCreditBudget * 100)),
        boostWeight: 1,
        recencyWeight: 1,
        finalRankScore: calculateAdRankScore({
          budgetAmountCents,
          platformCreditBudget,
          boostFactor: 1,
          createdAt: now,
        }),
        impressionsAllocated: 0,
      },
    });

    return { ...updatedCampaign, placements: [placement] };
  });

  return NextResponse.json({ campaign: serializeAdCampaigns([campaign])[0], balance: await getAdCreditBalance(session.user.id) }, { status: 201 });
}
