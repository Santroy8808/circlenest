import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { readAdBoostFactor } from "@/lib/ads/ads";

function getAdContext(ad: {
  targetType: string;
  bazaarListing: { id: string; title: string } | null;
  event: { id: string; title: string } | null;
  jobListing: { id: string; title: string } | null;
}) {
  if (ad.bazaarListing) {
    return { label: "Market", href: "/bazaar" };
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
  const ads = await prisma.adPlacement.findMany({
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
    },
    orderBy: [{ createdAt: "desc" }],
    take: 12,
  });

  return (
    <section className="space-y-3 text-sm">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-strong)]">Ad stream</p>
        <p className="text-xs text-slate-400">Paid placements on the right.</p>
      </div>

      {ads.length ? (
        <div className="space-y-2">
          {ads.map((ad) => {
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
        <p className="rounded border border-[var(--border)] bg-[#0d1320] p-3 text-xs text-slate-400">No active ads yet.</p>
      )}
    </section>
  );
}
