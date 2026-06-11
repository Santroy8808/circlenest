import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { BazaarClient } from "@/components/bazaar/bazaar-client";
import { TierGate } from "@/components/policy/tier-gate";
import { canCreateBazaarListing } from "@/lib/policy/tier-policy";
import { getProAdCreditBalance, serializeAdPlacements } from "@/lib/ads/ads";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

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
  const adCreditBalance = policy.tier === "PRO" || policy.tier === "AUDITOR" ? await getProAdCreditBalance(session.user.id, policy) : null;
  const adCreditLabel =
    policy.tier === "PRO"
      ? `Pro ad credits: ${adCreditBalance ?? 0}`
      : policy.tier === "AUDITOR"
        ? `Auditor ad credits: ${adCreditBalance ?? 0}`
      : policy.tier === "PLUS"
        ? "Ads locked. Upgrade to Pro or Auditor."
        : policy.tier === "ADMIN"
          ? "Admin ad access: unlimited."
          : "Upgrade to Pro or Auditor to create ads.";

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Bazaar</h1>
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
            title="Bazaar locked"
            message="Upgrade to Plus to create Bazaar listings."
            ctaLabel="Open subscription"
            ctaHref="/settings#subscription"
            secondaryLabel="Compare memberships"
            secondaryHref="/membership"
            compact
          />
        ) : null}
        <form
          key={searchParams?.created ?? "initial"}
          action={async (formData) => {
            "use server";
            const { auth } = await import("@/auth");
            const { prisma } = await import("@/lib/db/prisma");
            const { canCreateBazaarListing } = await import("@/lib/policy/tier-policy");
            const { resolveMemberAccessPolicy } = await import("@/lib/policy/member-access-policy");
            const current = await auth();
            if (!current?.user?.id) return;
            const currentUser = await prisma.user.findUnique({
              where: { id: current.user.id },
              select: { role: true, subscriptionTier: true },
            });
            const currentPolicy = resolveMemberAccessPolicy(current.user.id, currentUser);
            if (!canCreateBazaarListing(currentPolicy)) return;
            const title = String(formData.get("title") ?? "").trim();
            const price = Number(formData.get("price"));
            if (!title || Number.isNaN(price) || price < 0) return;
            await prisma.bazaarListing.create({
              data: {
                sellerId: current.user.id,
                title,
                price,
                description: String(formData.get("description") ?? "").trim() || null,
                location: String(formData.get("location") ?? "").trim() || null,
                category: String(formData.get("category") ?? "").trim() || null,
              },
            });
            redirect(`/bazaar?created=${Date.now()}`);
          }}
          className="grid gap-2 md:grid-cols-2"
        >
          <input disabled={!canCreate} name="title" required placeholder="Listing title" className="rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
          <input disabled={!canCreate} name="price" required placeholder="Price" type="number" min="0" step="0.01" className="rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
          <input disabled={!canCreate} name="location" placeholder="Location" className="rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
          <input disabled={!canCreate} name="category" placeholder="Category" className="rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
          <input disabled={!canCreate} name="description" placeholder="Description" className="rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 md:col-span-2" />
          <button type="submit" disabled={!canCreate} className="rounded bg-slate-900 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2">Create Listing</button>
        </form>
        <BazaarClient
          currentUserId={session.user.id}
          initialListings={listings.map((listing) => ({
            id: listing.id,
            title: listing.title,
            description: listing.description,
            price: listing.price,
            currency: listing.currency,
            location: listing.location,
            category: listing.category,
            seller: { id: listing.seller.id, username: listing.seller.username },
            ads: serializeAdPlacements(listing.adPlacements),
          }))}
        />
      </section>
    </AppShell>
  );
}
