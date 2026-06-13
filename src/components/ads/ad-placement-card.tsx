import type { AdPlacementSummary } from "@/lib/ads/ads";

type AdPlacementCardProps = {
  ad: AdPlacementSummary | null;
  targetLabel: string;
  slotLabel?: string;
};

export function AdPlacementCard({ ad, targetLabel, slotLabel = "Sponsored" }: AdPlacementCardProps) {
  const boostFactor = typeof ad?.boostFactor === "number" ? ad.boostFactor : 1;

  return (
    <article className="flex h-full flex-col rounded border border-amber-400/30 bg-amber-300/10 p-3 text-sm text-amber-100">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-amber-200">{slotLabel}</p>
          <p className="text-lg font-semibold">{ad ? ad.headline : `Promote in ${targetLabel}`}</p>
        </div>
        <span className="rounded-full border border-amber-200/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-amber-100">
          Ad
        </span>
      </div>
      <p className="mt-2 text-sm text-amber-50/90">{ad?.body || `One ad card per six ${targetLabel.toLowerCase()} listings.`}</p>
      {ad ? <p className="mt-3 text-xs text-amber-100/80">by @{ad.creator.username}{boostFactor !== 1 ? ` • boost x${boostFactor.toFixed(2)}` : ""}</p> : null}
    </article>
  );
}
