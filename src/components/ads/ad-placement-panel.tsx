"use client";

import { useEffect, useState } from "react";
import type { AdPlacementSummary, AdTargetType } from "@/lib/ads/ads";

const AD_FIELD_CLASS =
  "w-full rounded-lg border border-[#52647f] bg-[#253145] px-3 py-2 font-sans text-sm leading-5 text-[#f3f6fb] shadow-inner shadow-black/10 placeholder:text-slate-400 focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/25";

type AdPlacementPanelProps = {
  targetType: AdTargetType;
  createEndpoint: string;
  targetLabel: string;
  canCreate: boolean;
  ownsTarget: boolean;
  requiresCredits: boolean;
  creditBalance: number | null;
  ads: AdPlacementSummary[];
  slotIndex?: number;
};

export function AdPlacementPanel({
  targetType,
  createEndpoint,
  targetLabel,
  canCreate,
  ownsTarget,
  requiresCredits,
  creditBalance,
  ads,
  slotIndex,
}: AdPlacementPanelProps) {
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [slotsPerViewport, setSlotsPerViewport] = useState(1);

  useEffect(() => {
    const updateSlots = () => {
      const estimatedCardHeight = 380;
      setSlotsPerViewport(Math.max(1, Math.floor(window.innerHeight / estimatedCardHeight)));
    };

    updateSlots();
    window.addEventListener("resize", updateSlots);
    return () => window.removeEventListener("resize", updateSlots);
  }, []);

  if (typeof slotIndex === "number" && slotIndex % slotsPerViewport !== 0) {
    return null;
  }

  async function submitAd() {
    setSending(true);
    setStatus("");
    try {
      const response = await fetch(createEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: headline.trim(),
          body: body.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not create ad");
        return;
      }
      setHeadline("");
      setBody("");
      window.location.reload();
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded border border-[var(--border)] p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Ads</p>
          <p className="font-medium text-slate-100">{targetLabel}</p>
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
          Listing ads separate
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-400">Use this panel to place an ad on the listing itself.</p>

      {!canCreate ? (
        <p className="mt-2 text-xs text-amber-200">Upgrade to Biz or Auditor to create ads.</p>
      ) : !ownsTarget ? (
        <p className="mt-2 text-xs text-slate-400">Only the owner can create ads here.</p>
      ) : null}
      {canCreate && ownsTarget ? (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2">
            <input
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
              placeholder={`Ad headline for ${targetType.toLowerCase().replaceAll("_", " ")}`}
              className={AD_FIELD_CLASS}
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Short ad copy"
              className={`${AD_FIELD_CLASS} min-h-20`}
            />
          </div>
          {requiresCredits && creditBalance !== null && creditBalance <= 0 ? (
            <p className="text-xs text-rose-200">No ad credits left.</p>
          ) : !headline.trim() ? (
            <p className="text-xs text-slate-400">Add a headline to enable Create ad.</p>
          ) : null}
          <button
            type="button"
            disabled={sending || !headline.trim() || (requiresCredits && creditBalance !== null && creditBalance <= 0)}
            onClick={() => void submitAd()}
            className="rounded bg-[#8f7228] px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "Creating..." : "Create ad"}
          </button>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Current ads</p>
        {ads.length ? (
          <div className="space-y-2">
            {ads.map((ad) => {
              const boostFactor = typeof ad.boostFactor === "number" ? ad.boostFactor : 1;
              return (
                <article key={ad.id} className="rounded border border-[var(--border)] bg-[#0d1320] p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-100">{ad.headline}</p>
                    <span className="rounded-full border border-slate-400/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                      {ad.status}
                    </span>
                  </div>
                  {ad.body ? <p className="mt-1 text-xs text-slate-300">{ad.body}</p> : null}
                  <p className="mt-1 text-[11px] text-slate-500">
                    {ad.creditCost > 0 ? `${ad.creditCost} credit${ad.creditCost === 1 ? "" : "s"}` : "No credit cost"}  -  @{ad.creator.username}  -  {new Date(ad.createdAt).toLocaleString()}
                    {boostFactor !== 1 ? ` - boost x${boostFactor.toFixed(2)}` : ""}
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No ads yet.</p>
        )}
      </div>

      {status ? <p className="mt-2 text-xs text-slate-400">{status}</p> : null}
    </section>
  );
}
