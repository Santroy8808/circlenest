import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";
import { serializeBusinessProfile } from "@/lib/business/business-profile";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

function HubLink({
  href,
  title,
  description,
  locked = false,
}: {
  href: string;
  title: string;
  description: string;
  locked?: boolean;
}) {
  if (locked) {
    return (
      <div className="rounded border border-[#304058] bg-[#101a2c] p-4 opacity-80">
        <h2 className="text-base font-semibold text-[var(--text-strong)]">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Complete Company Profile first</p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="block rounded border border-[var(--border)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:bg-[color:var(--card-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
    >
      <h2 className="text-base font-semibold text-[var(--text-strong)]">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </Link>
  );
}

export default async function ProductionZoneBusinessPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, profile, counts, recentJobs, recentListings, recentAds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, subscriptionTier: true },
    }),
    prisma.businessProfile.findUnique({
      where: { ownerId: session.user.id },
      include: {
        owner: { select: { id: true, username: true, fullName: true } },
        complianceProfile: {
          select: { processorOnboardingStatus: true, processorChargesEnabled: true, processorPayoutsEnabled: true },
        },
      },
    }),
    Promise.all([
      prisma.jobListing.count({ where: { creatorId: session.user.id } }),
      prisma.bazaarListing.count({ where: { sellerId: session.user.id } }),
      prisma.event.count({ where: { creatorId: session.user.id } }),
      prisma.fundraiser.count({ where: { creatorId: session.user.id } }),
      prisma.adPlacement.count({ where: { creatorId: session.user.id, status: "ACTIVE" } }),
      prisma.adPlacement.count({ where: { creatorId: session.user.id, status: { in: ["DRAFT", "PAUSED"] } } }),
    ]),
    prisma.jobListing.findMany({
      where: { creatorId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, title: true, companyName: true, status: true, createdAt: true },
    }),
    prisma.bazaarListing.findMany({
      where: { sellerId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, title: true, status: true, price: true, currency: true, createdAt: true },
    }),
    prisma.adPlacement.findMany({
      where: { creatorId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, headline: true, targetType: true, status: true, creditCost: true, createdAt: true },
    }),
  ]);
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  if (!(policy.tier === "PRO" || policy.isAdmin)) {
    redirect("/production-zone");
  }

  const companyProfile = profile ? serializeBusinessProfile(profile) : null;
  const recentInquiries = profile
    ? await prisma.businessStorefrontInquiry.findMany({
        where: { businessProfileId: profile.id },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, visitorName: true, visitorEmail: true, visitorMessage: true, readAt: true, createdAt: true },
      })
    : [];
  const isReady = Boolean(companyProfile?.completion.reviewReady);
  const [jobCount, marketCount, eventCount, fundraiserCount, activeAds, draftAds] = counts;

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-strong)]">Production Zone: My Business</h1>
            <p className="text-sm text-slate-400">Company Profile comes first, then storefront, jobs, ads, and campaign tools.</p>
          </div>
          <div className="rounded border border-[#304058] bg-[#101a2c] px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">Company readiness</p>
            <p className="text-xl font-semibold text-[var(--text-strong)]">{companyProfile?.completion.percent ?? 0}%</p>
          </div>
        </div>

        {!isReady ? (
          <div className="rounded border border-amber-300/30 bg-amber-300/10 p-3">
            <p className="text-sm font-semibold text-amber-100">Company Profile setup is required for Biz tools.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {[
                ["Public identity", companyProfile?.completion.publicIdentity],
                ["Contact and location", companyProfile?.completion.contactLocation],
                ["Legal business info", companyProfile?.completion.legalBusinessInfo],
                ["Storefront slug", companyProfile?.completion.storefrontSetup],
                ["Review ready", companyProfile?.completion.reviewReady],
              ].map(([label, done]) => (
                <div key={String(label)} className="rounded border border-amber-200/20 bg-[#101a2c] px-3 py-2">
                  <p className="text-xs font-semibold text-slate-100">{label}</p>
                  <p className={done ? "text-xs text-emerald-200" : "text-xs text-amber-200"}>{done ? "Ready" : "Needs info"}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <HubLink
            href="/production-zone/business-profile"
            title="Company Profile"
            description="Create or update the public company sub-profile for your account."
          />
          <HubLink
            href="/production-zone/business/storefront"
            title="Storefront"
            description="Publish a public storefront for external visitors and manage inquiries."
            locked={!isReady}
          />
          <HubLink
            href="/jobs/new"
            title="Create a job listing"
            description="Post business job opportunities after the company profile is ready."
            locked={!isReady}
          />
          <HubLink
            href="/events"
            title="Create an event"
            description="Create the event first, then add event-specific ads from the event page."
            locked={!isReady}
          />
          <HubLink
            href="/production-zone/market"
            title="Marketplace seller tools"
            description="Manage marketplace listings with Biz-level posting capacity."
            locked={!isReady}
          />
          <HubLink
            href="/production-zone/business/ads"
            title="Ads and campaign prep"
            description="Build ad campaigns with a landing article, schedule, credits, and ranking snapshot."
            locked={!isReady}
          />
          <HubLink
            href="/production-zone/business/wallet"
            title="Business wallet"
            description="View real funds, platform credits, test money status, and processor-backed withdrawals."
            locked={!isReady}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Job listings", jobCount],
            ["Market listings", marketCount],
            ["Events", eventCount],
            ["Fundraisers", fundraiserCount],
            ["Active ads", activeAds],
            ["Draft/paused ads", draftAds],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded border border-[#304058] bg-[#101a2c] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded border border-[#304058] bg-[#101a2c] p-4">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">Recent business activity</h2>
            <div className="mt-3 space-y-2">
              {[...recentJobs.map((item) => ({
                key: `job-${item.id}`,
                title: item.title,
                meta: `${item.companyName} - ${item.status}`,
                date: item.createdAt,
              })), ...recentListings.map((item) => ({
                key: `market-${item.id}`,
                title: item.title,
                meta: `${item.currency} ${item.price.toFixed(2)} - ${item.status}`,
                date: item.createdAt,
              }))].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5).map((item) => (
                <article key={item.key} className="rounded border border-[#26354c] bg-[#0d1626] px-3 py-2">
                  <p className="truncate text-sm font-semibold text-slate-100">{item.title}</p>
                  <p className="text-xs text-slate-400">{item.meta}</p>
                </article>
              ))}
              {recentJobs.length + recentListings.length === 0 ? <p className="text-sm text-slate-400">No business activity yet.</p> : null}
            </div>
          </section>

          <section className="rounded border border-[#304058] bg-[#101a2c] p-4">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">Storefront and ads</h2>
            <div className="mt-3 space-y-2">
              {recentInquiries.map((inquiry) => (
                <article key={inquiry.id} className="rounded border border-[#26354c] bg-[#0d1626] px-3 py-2">
                  <p className="truncate text-sm font-semibold text-slate-100">{inquiry.visitorName}</p>
                  <p className="truncate text-xs text-slate-400">{inquiry.visitorEmail} - {inquiry.readAt ? "Read" : "Unread inquiry"}</p>
                </article>
              ))}
              {recentAds.map((ad) => (
                <article key={ad.id} className="rounded border border-[#26354c] bg-[#0d1626] px-3 py-2">
                  <p className="truncate text-sm font-semibold text-slate-100">{ad.headline}</p>
                  <p className="text-xs text-slate-400">{ad.targetType} - {ad.status} - {ad.creditCost} credits</p>
                </article>
              ))}
              {recentInquiries.length + recentAds.length === 0 ? <p className="text-sm text-slate-400">No storefront inquiries or ad activity yet.</p> : null}
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
