import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { MarketClient } from "@/components/market/market-client";
import { MarketCreateFormClient } from "@/components/market/market-create-form-client";
import { canCreateMarketListing, getMarketListingLifetimeDays, getMarketListingMaxImageCount, getMarketListingRollingLimit } from "@/lib/policy/market";
import { getProAdCreditBalance, serializeAdPlacements } from "@/lib/ads/ads";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseImageUrlsJson(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry ?? "").trim()).filter(Boolean).slice(0, 3) : [];
  } catch {
    return [];
  }
}

export default async function MarketPage({ searchParams }: { searchParams?: { created?: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const listings = await prisma.bazaarListing.findMany({
    where: { status: "ACTIVE" },
    include: {
      seller: { select: { id: true, username: true } },
      adPlacements: {
        include: { creator: { select: { id: true, username: true } } },
        orderBy: [{ createdAt: "desc" }],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  const canCreate = canCreateMarketListing(policy);
  const maxImages = getMarketListingMaxImageCount(policy);
  const now = new Date();
  const twoWeeksAgo = addDays(now, -14);
  const rollingLimit = getMarketListingRollingLimit(policy);
  const createdInTwoWeeks =
    rollingLimit !== null
      ? await prisma.bazaarListing.count({ where: { sellerId: session.user.id, createdAt: { gte: twoWeeksAgo } } })
      : 0;
  const marketQuotaWidget =
    policy.tier === "CONTRIBUTOR"
      ? `Contributor Market listings: ${createdInTwoWeeks}/${rollingLimit ?? 0} used in the current 2-week window (${Math.max((rollingLimit ?? 0) - createdInTwoWeeks, 0)} left).`
      : policy.tier === "PRO" || policy.tier === "AUDITOR" || policy.tier === "ADMIN"
        ? "Biz members can post unlimited marketplace listings."
        : "Browse The Market freely. Contributor members can post 6 marketplace listings every 2 weeks. Biz members can post unlimited marketplace listings.";
  const marketLimitNote =
    policy.tier === "CONTRIBUTOR"
      ? `Contributor members can post ${rollingLimit ?? 6} marketplace listings every 2 weeks, with ${maxImages ?? 0} photos per listing, and listings last ${getMarketListingLifetimeDays(policy) ?? 14} days. Biz members can post unlimited marketplace listings.`
      : policy.tier === "PRO" || policy.tier === "AUDITOR"
        ? "Biz members can post unlimited marketplace listings."
        : policy.tier === "ADMIN"
          ? "Admin listings are unlimited."
          : "Browse The Market freely. Contributor members can post 6 marketplace listings every 2 weeks. Biz members can post unlimited marketplace listings.";
  const adCreditBalance = policy.tier === "PRO" || policy.tier === "AUDITOR" ? await getProAdCreditBalance(session.user.id, policy) : null;
  const adCreditLabel =
    policy.tier === "PRO"
      ? `Biz ad credits: ${adCreditBalance ?? 0}`
      : policy.tier === "AUDITOR"
        ? `Auditor ad credits: ${adCreditBalance ?? 0}`
      : policy.tier === "CONTRIBUTOR"
        ? "Contributor members need Biz or Auditor for ads."
        : policy.tier === "ADMIN"
          ? "Admin ad access: unlimited."
          : "Upgrade to Biz or Auditor to create ads.";

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">The Market</h1>
          <p className="text-sm text-slate-500">Marketplace listings with search and filters.</p>
        </div>
        {searchParams?.created ? (
          <p className="rounded border border-emerald-400/40 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-200">
            Listing created.
          </p>
        ) : null}
        <p className="text-xs text-slate-400">{adCreditLabel}</p>
        <div className="rounded border border-[var(--border)] bg-[#0e1524] px-3 py-2 text-xs text-slate-300">{marketQuotaWidget}</div>
        <MarketCreateFormClient canCreate={canCreate} maxImages={maxImages} listingLimitNote={marketLimitNote} />
        <MarketClient
          currentUserId={session.user.id}
          initialListings={listings
            .map((listing) => {
              const expiresAt = listing.expiresAt ?? addDays(listing.createdAt, 14);
              return {
                id: listing.id,
                title: listing.title,
                description: listing.description,
                price: listing.price,
                currency: listing.currency,
                location: listing.location,
                category: listing.category,
                imageUrls: parseImageUrlsJson(listing.imageUrlsJson),
                expiresAt: expiresAt.toISOString(),
                staleSoon: expiresAt.getTime() - Date.now() <= 3 * 24 * 60 * 60 * 1000,
                seller: { id: listing.seller.id, username: listing.seller.username },
                ads: serializeAdPlacements(listing.adPlacements),
              };
            })
            .filter((listing) => new Date(listing.expiresAt).getTime() > Date.now())}
        />
      </section>
    </AppShell>
  );
}
