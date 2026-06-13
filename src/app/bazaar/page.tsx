import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { BazaarClient } from "@/components/bazaar/bazaar-client";
import { BazaarCreateFormClient } from "@/components/bazaar/bazaar-create-form-client";
import { TierGate } from "@/components/policy/tier-gate";
import { canCreateBazaarListing, getBazaarListingLifetimeDays, getBazaarListingMaxImageCount, getBazaarListingRollingLimit, getBazaarListingWeeklyLimit } from "@/lib/policy/tier-policy";
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

export default async function BazaarPage({ searchParams }: { searchParams?: { created?: string } }) {
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
  const canCreate = canCreateBazaarListing(policy);
  const maxImages = getBazaarListingMaxImageCount(policy);
  const bazaarLimitNote =
    policy.tier === "PLUS"
      ? `Activist listings are limited to ${getBazaarListingWeeklyLimit(policy) ?? 0} per week, ${getBazaarListingRollingLimit(policy) ?? 0} in any 2-week window, ${maxImages ?? 0} photos per listing, and last ${getBazaarListingLifetimeDays(policy) ?? 14} days.`
      : policy.tier === "PRO" || policy.tier === "AUDITOR"
        ? "Biz and Auditor listings are unlimited."
        : policy.tier === "ADMIN"
          ? "Admin listings are unlimited."
          : null;
  const adCreditBalance = policy.tier === "PRO" || policy.tier === "AUDITOR" ? await getProAdCreditBalance(session.user.id, policy) : null;
  const adCreditLabel =
    policy.tier === "PRO"
      ? `Biz ad credits: ${adCreditBalance ?? 0}`
      : policy.tier === "AUDITOR"
        ? `Auditor ad credits: ${adCreditBalance ?? 0}`
      : policy.tier === "PLUS"
        ? "Activist members need Biz or Auditor for ads."
        : policy.tier === "ADMIN"
          ? "Admin ad access: unlimited."
          : "Upgrade to Biz or Auditor to create ads.";

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Market</h1>
          <p className="text-sm text-slate-500">Marketplace listings with search and filters.</p>
        </div>
        {searchParams?.created ? (
          <p className="rounded border border-emerald-400/40 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-200">
            Listing created.
          </p>
        ) : null}
        <p className="text-xs text-slate-400">{adCreditLabel}</p>
        {!canCreate ? (
          <TierGate
            variant="locked"
            title="Market locked"
            message="Upgrade to Activist to create Market listings."
            ctaLabel="Open subscription"
            ctaHref="/settings/subscription"
            secondaryLabel="Compare memberships"
            secondaryHref="/membership"
            compact
          />
        ) : null}
        <BazaarCreateFormClient canCreate={canCreate} maxImages={maxImages} listingLimitNote={bazaarLimitNote} />
        <BazaarClient
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
