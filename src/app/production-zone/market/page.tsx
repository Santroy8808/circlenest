import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";
import { canCreateAds, canCreateBazaarListing } from "@/lib/policy/tier-policy";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export default async function ProductionZoneMarketPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  const canCreateListing = canCreateBazaarListing(policy);
  const canCreateListingAds = canCreateAds(policy);

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Production Zone: Market</h1>
          <p className="text-sm text-slate-400">Start with browsing, then create listings and listing ads if your tier supports them.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <article className="rounded border border-[var(--border)] p-4">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">View listings</h2>
            <p className="mt-1 text-sm text-slate-400">Search and browse all active Market listings.</p>
            <Link href="/bazaar" className="mt-3 inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
              Open Market
            </Link>
          </article>
          <article className="rounded border border-[var(--border)] p-4">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">Create listing</h2>
            <p className="mt-1 text-sm text-slate-400">
              {canCreateListing ? "Your tier can create Market listings on the main Market page." : "Your tier cannot create Market listings yet."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={canCreateListing ? "/bazaar" : "/settings/subscription"} className="inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
                {canCreateListing ? "Open listing creator" : "Open subscription"}
              </Link>
              <span className="rounded border border-[var(--border)] px-3 py-2 text-sm text-slate-400">
                {canCreateListingAds ? "Create ad option is available after listing creation." : "Listing ads unlock on Pro, Auditor, or Admin."}
              </span>
            </div>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
