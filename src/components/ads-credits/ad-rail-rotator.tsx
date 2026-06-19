"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AdPlacementCardView } from "@/modules/ads-credits/types";

const AD_POOL_REFRESH_MS = 45000;
const RIGHT_STREAM_PLACEMENT = "RIGHT_STREAM";
const IMPRESSION_EVENT = "IMPRESSION";
const CLICK_EVENT = "CLICK";

function visibleSlotCount(totalAds: number) {
  if (totalAds <= 2) return 1;
  return 2;
}

function postDeliveryEvent(ad: AdPlacementCardView, eventType: typeof IMPRESSION_EVENT | typeof CLICK_EVENT, slot: number) {
  const payload = JSON.stringify({
    campaignId: ad.id,
    placement: RIGHT_STREAM_PLACEMENT,
    eventType,
    metadata: {
      slot,
      source: "right-ad-rail"
    }
  });

  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    navigator.sendBeacon("/api/ads/delivery", new Blob([payload], { type: "application/json" }));
    return;
  }

  void fetch("/api/ads/delivery", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: payload,
    keepalive: true
  });
}

export function AdRailRotator({ initialAds }: { initialAds: AdPlacementCardView[] }) {
  const [ads, setAds] = useState(initialAds);
  const [startIndex, setStartIndex] = useState(0);
  const lastImpressionKey = useRef("");
  const slotCount = visibleSlotCount(ads.length);
  const visibleAds = useMemo(() => {
    if (ads.length === 0) return [];

    return Array.from({ length: Math.min(slotCount, ads.length) }, (_, index) => ads[(startIndex + index) % ads.length]);
  }, [ads, slotCount, startIndex]);

  useEffect(() => {
    setAds(initialAds);
    setStartIndex(0);
  }, [initialAds]);

  useEffect(() => {
    if (ads.length <= 1) return;

    const holdMs = visibleAds[0]?.rotationHoldMs ?? 12000;
    const timer = window.setTimeout(() => {
      setStartIndex((current) => (current + 1) % ads.length);
    }, holdMs);

    return () => window.clearTimeout(timer);
  }, [ads.length, visibleAds]);

  useEffect(() => {
    const refresh = window.setInterval(async () => {
      const response = await fetch(`/api/ads/placements?placement=${RIGHT_STREAM_PLACEMENT}`, {
        cache: "no-store"
      }).catch(() => null);

      if (!response?.ok) return;

      const payload = (await response.json().catch(() => null)) as { ads?: AdPlacementCardView[] } | null;

      if (!Array.isArray(payload?.ads)) return;

      setAds(payload.ads);
      setStartIndex((current) => (payload.ads && payload.ads.length > 0 ? current % payload.ads.length : 0));
    }, AD_POOL_REFRESH_MS);

    return () => window.clearInterval(refresh);
  }, []);

  useEffect(() => {
    const impressionKey = visibleAds.map((ad) => ad.id).join(":");

    if (!impressionKey || impressionKey === lastImpressionKey.current) return;

    lastImpressionKey.current = impressionKey;
    visibleAds.forEach((ad, slot) => postDeliveryEvent(ad, IMPRESSION_EVENT, slot));
  }, [visibleAds]);

  if (visibleAds.length === 0) {
    return (
      <article className="ad-placement-card">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Reserved</span>
        <strong className="mt-2 block">Right stream placement</strong>
        <span className="mt-2 block text-sm leading-6 text-[var(--muted)]">Active ads will appear here.</span>
      </article>
    );
  }

  return (
    <div className="ad-rail-rotator">
      {visibleAds.map((ad, slot) =>
        ad.destinationUrl ? (
          <a className="ad-placement-card" href={ad.destinationUrl} key={`${ad.id}-${slot}`} onClick={() => postDeliveryEvent(ad, CLICK_EVENT, slot)}>
            {ad.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={ad.imageAlt} className="ad-placement-image" src={ad.imageUrl} />
            ) : null}
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Sponsored</span>
            <strong className="mt-2 block">{ad.title}</strong>
            <span className="mt-2 block text-sm leading-6 text-[var(--muted)]">{ad.body}</span>
            <span className="ad-rotation-meta">{Math.ceil(ad.rotationHoldMs / 1000)}s paid hold | {ad.totalBudgetCredits} credits reserved</span>
          </a>
        ) : (
          <article className="ad-placement-card" key={`${ad.id}-${slot}`}>
            {ad.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={ad.imageAlt} className="ad-placement-image" src={ad.imageUrl} />
            ) : null}
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Sponsored</span>
            <strong className="mt-2 block">{ad.title}</strong>
            <span className="mt-2 block text-sm leading-6 text-[var(--muted)]">{ad.body}</span>
            <span className="ad-rotation-meta">{Math.ceil(ad.rotationHoldMs / 1000)}s paid hold | {ad.totalBudgetCredits} credits reserved</span>
          </article>
        )
      )}
    </div>
  );
}
