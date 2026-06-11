import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { isAdminUser } from "@/lib/auth/admin";
import {
  canCreateTargetAd,
  ensureMonthlyProAdCredits,
  getAdCreditBalance,
  getAdCreditCost,
  requiresAdCredits,
  resolveAdPeriodKey,
  serializeAdPlacements,
} from "@/lib/ads/ads";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export async function GET(_request: Request, context: { params: { jobId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await prisma.jobListing.findUnique({
    where: { id: context.params.jobId },
    select: { id: true },
  });
  if (!job) return NextResponse.json({ error: "Job listing not found" }, { status: 404 });

  const ads = await prisma.adPlacement.findMany({
    where: { jobListingId: job.id },
    include: { creator: { select: { id: true, username: true } } },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ ads: serializeAdPlacements(ads) });
}

export async function POST(request: Request, context: { params: { jobId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  if (!canCreateTargetAd(policy, "JOB_LISTING")) {
    return NextResponse.json({ error: "Ads are not available on this tier." }, { status: 403 });
  }

  const job = await prisma.jobListing.findUnique({
    where: { id: context.params.jobId },
    select: { id: true, creatorId: true, title: true },
  });
  if (!job) return NextResponse.json({ error: "Job listing not found" }, { status: 404 });
  const isAdmin = await isAdminUser(session.user.id);
  if (!isAdmin && job.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { headline?: string; body?: string | null };
  const headline = String(body.headline ?? "").trim();
  if (!headline) return NextResponse.json({ error: "Headline is required." }, { status: 400 });

  const creditCost = getAdCreditCost(policy);
  if (requiresAdCredits(policy)) {
    await ensureMonthlyProAdCredits(session.user.id, policy);
    const balance = await getAdCreditBalance(session.user.id);
    if (balance < creditCost) {
      return NextResponse.json({ error: "No ad credits left." }, { status: 409 });
    }
  }

  const ad = await prisma.$transaction(async (tx) => {
    const created = await tx.adPlacement.create({
      data: {
        creatorId: session.user.id,
        targetType: "JOB_LISTING",
        jobListingId: job.id,
        headline,
        body: String(body.body ?? "").trim() || null,
        creditCost,
      },
      include: { creator: { select: { id: true, username: true } } },
    });

    if (creditCost > 0) {
      await tx.adCreditLedger.create({
        data: {
          ledgerKey: `AD_SPEND:${created.id}`,
          userId: session.user.id,
          entryType: "AD_SPEND",
          periodKey: resolveAdPeriodKey(),
          credits: -creditCost,
          sourceType: "AD_PLACEMENT",
          sourceId: created.id,
          note: `Hiring board ad for ${job.title}`,
        },
      });
    }

    return created;
  });

  return NextResponse.json({ ok: true, ad });
}
