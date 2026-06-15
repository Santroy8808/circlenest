import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { getProAdCreditBalance, readAdBoostFactor } from "@/lib/ads/ads";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

function parseJsonList(value: string | null | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function matchesTargetList(targets: string[], candidate: string | null | undefined) {
  if (!targets.length) return true;
  if (!candidate?.trim()) return true;
  return targets.includes(candidate.trim().toLowerCase());
}

function campaignMatchesViewer(
  campaign: {
    targetCountriesJson: string | null;
    targetStatesJson: string | null;
    targetCitiesJson: string | null;
    targetGendersJson: string | null;
    targetScientologyClassificationsJson: string | null;
    targetMinAge: number | null;
    targetMaxAge: number | null;
  } | null,
  viewer: {
    country: string | null;
    state: string | null;
    city: string | null;
    genderIdentity: string | null;
    birthYear: number | null;
    scientologyTrainingLevel: string | null;
    scientologyCaseLevel: string | null;
  } | null,
) {
  if (!campaign) return true;

  const countries = parseJsonList(campaign.targetCountriesJson);
  const states = parseJsonList(campaign.targetStatesJson);
  const cities = parseJsonList(campaign.targetCitiesJson);
  const genders = parseJsonList(campaign.targetGendersJson);
  const classifications = parseJsonList(campaign.targetScientologyClassificationsJson);

  if (!matchesTargetList(countries, viewer?.country)) return false;
  if (!matchesTargetList(states, viewer?.state)) return false;
  if (!matchesTargetList(cities, viewer?.city)) return false;
  if (!matchesTargetList(genders, viewer?.genderIdentity)) return false;

  if (classifications.length) {
    const viewerClassifications = [viewer?.scientologyTrainingLevel, viewer?.scientologyCaseLevel]
      .map((entry) => entry?.trim().toLowerCase())
      .filter(Boolean);
    if (viewerClassifications.length && !viewerClassifications.some((entry) => classifications.includes(entry!))) {
      return false;
    }
  }

  if (viewer?.birthYear && (campaign.targetMinAge !== null || campaign.targetMaxAge !== null)) {
    const age = new Date().getFullYear() - viewer.birthYear;
    if (campaign.targetMinAge !== null && age < campaign.targetMinAge) return false;
    if (campaign.targetMaxAge !== null && age > campaign.targetMaxAge) return false;
  }

  return true;
}

function getAdContext(ad: {
  targetType: string;
  bazaarListing: { id: string; title: string } | null;
  event: { id: string; title: string } | null;
  jobListing: { id: string; title: string } | null;
}) {
  if (ad.bazaarListing) {
    return { label: "The Market", href: "/market" };
  }
  if (ad.event) {
    return { label: "Event", href: "/events" };
  }
  if (ad.jobListing) {
    return { label: "Hiring", href: "/jobs" };
  }
  return { label: ad.targetType.replaceAll("_", " "), href: "/home" };
}

export async function AdStreamSidebar() {
  const now = new Date();
  const session = await auth();
  const [ads, user] = await Promise.all([
    prisma.adPlacement.findMany({
      where: {
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      include: {
        creator: { select: { username: true } },
        bazaarListing: { select: { id: true, title: true } },
        event: { select: { id: true, title: true } },
        jobListing: { select: { id: true, title: true } },
        campaign: {
          select: {
            targetCountriesJson: true,
            targetStatesJson: true,
            targetCitiesJson: true,
            targetGendersJson: true,
            targetScientologyClassificationsJson: true,
            targetMinAge: true,
            targetMaxAge: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 40,
    }),
    session?.user?.id
      ? prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            role: true,
            subscriptionTier: true,
            country: true,
            state: true,
            city: true,
            profile: {
              select: {
                genderIdentity: true,
                birthYear: true,
                scientologyTrainingLevel: true,
                scientologyCaseLevel: true,
              },
            },
          },
        })
      : null,
  ]);
  const policy = session?.user?.id ? resolveMemberAccessPolicy(session.user.id, user) : null;
  const creditBalance = session?.user?.id && policy && (policy.tier === "PRO" || policy.tier === "AUDITOR")
    ? await getProAdCreditBalance(session.user.id, policy)
    : null;

  const viewerContext = user
    ? {
        country: user.country,
        state: user.state,
        city: user.city,
        genderIdentity: user.profile?.genderIdentity ?? null,
        birthYear: user.profile?.birthYear ?? null,
        scientologyTrainingLevel: user.profile?.scientologyTrainingLevel ?? null,
        scientologyCaseLevel: user.profile?.scientologyCaseLevel ?? null,
      }
    : null;
  const visibleAds = ads.filter((ad) => campaignMatchesViewer(ad.campaign, viewerContext)).slice(0, 12);

  return (
    <section className="space-y-3 text-sm">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-strong)]">Ad stream</p>
        <p className="text-xs text-slate-400">
          {creditBalance !== null ? `${creditBalance} ad credits ready.` : "Paid placements on the right."}
        </p>
      </div>

      {visibleAds.length ? (
        <div className="space-y-2">
          {visibleAds.map((ad) => {
            const context = getAdContext(ad);
            const boostFactor = readAdBoostFactor(ad as Record<string, unknown>);
            return (
              <article key={ad.id} className="rounded border border-[var(--border)] bg-[#0d1320] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{context.label}</p>
                    <Link href={context.href} className="font-medium text-slate-100 hover:underline">
                      {ad.headline}
                    </Link>
                  </div>
                  <span className="rounded-full border border-slate-400/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                    {ad.creditCost > 0 ? `${ad.creditCost} credit${ad.creditCost === 1 ? "" : "s"}` : "Free"}
                  </span>
                </div>
                {ad.body ? <p className="mt-2 text-xs text-slate-300">{ad.body}</p> : null}
                <p className="mt-2 text-[11px] text-slate-500">
                  by @{ad.creator.username} - {new Date(ad.createdAt).toLocaleString()}
                  {boostFactor !== 1 ? ` - boost x${boostFactor.toFixed(2)}` : ""}
                </p>
              </article>
            );
          })}
        </div>
      ) : (
        <article className="rounded border border-[var(--border)] bg-[#0d1320] p-3 text-xs text-slate-300">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Sample placement</p>
          <p className="mt-1 font-semibold text-slate-100">Promote a Market listing, event, or job post.</p>
          <p className="mt-2 text-slate-400">Active ads will rotate here once members start running promotions.</p>
          <Link href="/market" className="mt-3 inline-flex rounded border border-[var(--border)] px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-300/10">
            Open The Market
          </Link>
        </article>
      )}
    </section>
  );
}
