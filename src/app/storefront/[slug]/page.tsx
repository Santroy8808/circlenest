import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { normalizeStorefrontSlug } from "@/lib/business/storefront";
import { BusinessStorefrontPublicClient } from "@/components/business/business-storefront-public-client";

function normalizeWebsiteUrl(value: string | null | undefined) {
  if (!value) return null;
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
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
          <section className="overflow-hidden rounded-3xl border border-[#4e5d7a] bg-[#0f1726] shadow-[0_20px_80px_rgba(0,0,0,0.32)]">
            <div className="border-b border-white/5 bg-[linear-gradient(135deg,rgba(143,114,40,0.18),rgba(14,18,28,0.04))] px-6 py-5 md:px-8">
              <div className="flex flex-wrap items-center gap-3">
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
                      {[profile.city, profile.state, profile.country].filter(Boolean).join(", ") || "Not provided"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#3a4661] bg-[#111a2b] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Owner</p>
                    <p className="mt-1 text-sm text-slate-200">@{profile.owner.username}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {profile.contactEmail ? (
                    <a
                      href={`mailto:${profile.contactEmail}`}
                      className="rounded-2xl border border-[#3a4661] bg-[#111a2b] p-4 text-sm text-slate-200 transition hover:border-amber-300/40 hover:bg-[#141f33]"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Email</p>
                      <p className="mt-1 break-all">{profile.contactEmail}</p>
                    </a>
                  ) : null}
                  {profile.contactPhone ? (
                    <a
                      href={`tel:${profile.contactPhone}`}
                      className="rounded-2xl border border-[#3a4661] bg-[#111a2b] p-4 text-sm text-slate-200 transition hover:border-amber-300/40 hover:bg-[#141f33]"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Phone</p>
                      <p className="mt-1">{profile.contactPhone}</p>
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
          </section>

          <BusinessStorefrontPublicClient storefrontSlug={slug} />
        </div>
      </div>
    </main>
  );
}
