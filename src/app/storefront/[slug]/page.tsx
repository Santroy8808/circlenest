import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { normalizeStorefrontSlug } from "@/lib/business/storefront";
import { BusinessStorefrontPublicClient } from "@/components/business/business-storefront-public-client";

function normalizeWebsiteUrl(value: string | null | undefined) {
  if (!value) return null;
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

function StorefrontList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</h2>
      <div className="space-y-2">
        {hasChildren ? children : <p className="rounded-xl border border-[#3a4661] bg-[#111a2b] p-3 text-sm text-slate-400">{empty}</p>}
      </div>
    </section>
  );
}

export default async function PublicStorefrontPage({ params }: { params: { slug: string } }) {
  const slug = normalizeStorefrontSlug(params.slug ?? "");
  if (!slug) notFound();

  const profile = await prisma.businessProfile.findFirst({
    where: {
      storefrontSlug: slug,
      storefrontEnabled: true,
      isPublic: true,
    },
    include: {
      owner: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
    },
  });

  if (!profile) notFound();

  const websiteHref = normalizeWebsiteUrl(profile.websiteUrl);
  const [marketListings, jobListings, events, fundraisers] = await Promise.all([
    prisma.bazaarListing.findMany({
      where: { sellerId: profile.ownerId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, title: true, description: true, price: true, currency: true, category: true },
    }),
    prisma.jobListing.findMany({
      where: { creatorId: profile.ownerId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, title: true, companyName: true, location: true, employmentType: true },
    }),
    prisma.event.findMany({
      where: { creatorId: profile.ownerId, visibility: "PUBLIC" },
      orderBy: { startsAt: "asc" },
      take: 4,
      select: { id: true, title: true, startsAt: true, locationName: true },
    }),
    prisma.fundraiser.findMany({
      where: { creatorId: profile.ownerId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, title: true, fundraiserType: true, goalAmount: true },
    }),
  ]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(143,114,40,0.18),_transparent_35%),linear-gradient(180deg,_#05070d_0%,_#0b1220_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-6 md:px-6 md:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200">Theta-Space storefront</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#f7e8bf] md:text-4xl">{profile.businessName}</h1>
            <p className="mt-1 text-sm text-slate-300">Public storefront for non-members and outside visitors.</p>
          </div>
          <Link
            href="/"
            className="rounded border border-amber-300/30 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10"
          >
            Theta-Space
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.85fr)]">
          <section className="overflow-hidden rounded-2xl border border-[#4e5d7a] bg-[#0f1726] shadow-[0_20px_80px_rgba(0,0,0,0.32)]">
            {profile.bannerUrl ? (
              <div className="relative h-48 border-b border-white/5">
                <Image src={profile.bannerUrl} alt={`${profile.businessName} banner`} fill unoptimized className="object-cover" />
              </div>
            ) : null}
            <div className="border-b border-white/5 bg-[linear-gradient(135deg,rgba(143,114,40,0.18),rgba(14,18,28,0.04))] px-6 py-5 md:px-8">
              <div className="flex flex-wrap items-center gap-4">
                {profile.logoUrl ? (
                  <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-amber-300/30 bg-[#111a2b]">
                    <Image src={profile.logoUrl} alt={`${profile.businessName} logo`} fill unoptimized className="object-cover" />
                  </div>
                ) : null}
                <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                  Public contact
                </span>
                {profile.category ? (
                  <span className="rounded-full border border-slate-500/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                    {profile.category}
                  </span>
                ) : null}
              </div>
              {profile.tagline ? <p className="mt-4 max-w-3xl text-lg text-slate-200">{profile.tagline}</p> : null}
            </div>

            <div className="grid gap-6 px-6 py-6 md:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
              <div className="space-y-5">
                {profile.description ? (
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">About</h2>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">{profile.description}</p>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[#3a4661] bg-[#111a2b] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Location</p>
                    <p className="mt-1 text-sm text-slate-200">
                      {[profile.city, profile.state, profile.country].filter(Boolean).join(", ") || profile.location || "Not provided"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#3a4661] bg-[#111a2b] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Owner</p>
                    <p className="mt-1 text-sm text-slate-200">@{profile.owner.username}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {(profile.publicContactEmail ?? profile.contactEmail) ? (
                    <a
                      href={`mailto:${profile.publicContactEmail ?? profile.contactEmail}`}
                      className="rounded-2xl border border-[#3a4661] bg-[#111a2b] p-4 text-sm text-slate-200 transition hover:border-amber-300/40 hover:bg-[#141f33]"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Email</p>
                      <p className="mt-1 break-all">{profile.publicContactEmail ?? profile.contactEmail}</p>
                    </a>
                  ) : null}
                  {(profile.publicContactPhone ?? profile.contactPhone) ? (
                    <a
                      href={`tel:${profile.publicContactPhone ?? profile.contactPhone}`}
                      className="rounded-2xl border border-[#3a4661] bg-[#111a2b] p-4 text-sm text-slate-200 transition hover:border-amber-300/40 hover:bg-[#141f33]"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Phone</p>
                      <p className="mt-1">{profile.publicContactPhone ?? profile.contactPhone}</p>
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-[#3a4661] bg-[#111a2b] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Website</p>
                  {websiteHref ? (
                    <a href={websiteHref} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sm text-amber-200 underline underline-offset-2">
                      {profile.websiteUrl}
                    </a>
                  ) : (
                    <p className="mt-2 text-sm text-slate-300">No website linked.</p>
                  )}
                </div>
                <div className="rounded-2xl border border-[#3a4661] bg-[#111a2b] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Direct message</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Send a public inquiry and the owner will see it in their Theta-Space storefront inbox.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 border-t border-white/5 px-6 py-6 md:px-8 lg:grid-cols-2">
              <StorefrontList title="Market listings" empty="No public listings yet.">
                {marketListings.map((listing) => (
                  <article key={listing.id} className="rounded-xl border border-[#3a4661] bg-[#111a2b] p-3">
                    <p className="font-semibold text-slate-100">{listing.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{listing.category || "Market"} - {listing.currency} {listing.price.toFixed(2)}</p>
                    {listing.description ? <p className="mt-2 line-clamp-2 text-sm text-slate-300">{listing.description}</p> : null}
                  </article>
                ))}
              </StorefrontList>
              <StorefrontList title="Job listings" empty="No public jobs yet.">
                {jobListings.map((job) => (
                  <article key={job.id} className="rounded-xl border border-[#3a4661] bg-[#111a2b] p-3">
                    <p className="font-semibold text-slate-100">{job.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{job.companyName} - {job.location || "Remote/unspecified"} - {job.employmentType || "Role"}</p>
                  </article>
                ))}
              </StorefrontList>
              <StorefrontList title="Events" empty="No public events yet.">
                {events.map((event) => (
                  <article key={event.id} className="rounded-xl border border-[#3a4661] bg-[#111a2b] p-3">
                    <p className="font-semibold text-slate-100">{event.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{event.startsAt.toLocaleDateString()} - {event.locationName || "Location pending"}</p>
                  </article>
                ))}
              </StorefrontList>
              <StorefrontList title="Fundraisers" empty="No public fundraisers yet.">
                {fundraisers.map((fundraiser) => (
                  <article key={fundraiser.id} className="rounded-xl border border-[#3a4661] bg-[#111a2b] p-3">
                    <p className="font-semibold text-slate-100">{fundraiser.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{fundraiser.fundraiserType} - Goal ${fundraiser.goalAmount.toFixed(2)}</p>
                  </article>
                ))}
              </StorefrontList>
            </div>
          </section>

          <BusinessStorefrontPublicClient storefrontSlug={slug} />
        </div>
      </div>
    </main>
  );
}
