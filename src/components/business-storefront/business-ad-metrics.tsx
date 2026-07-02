"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdPlacement } from "@prisma/client";
import { adPlacementOptions, type AdsManagerView } from "@/modules/ads-credits/types";

type Timeframe = "hourly" | "daily" | "weekly" | "monthly";

function bucketDate(value: string, timeframe: Timeframe) {
  const date = new Date(value);

  if (timeframe === "hourly") {
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" });
  }

  if (timeframe === "weekly") {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
    return `Week of ${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }

  if (timeframe === "monthly") {
    return date.toLocaleString(undefined, { month: "long", year: "numeric" });
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function BusinessAdMetrics({ adsManager }: { adsManager: AdsManagerView }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("daily");
  const [campaignId, setCampaignId] = useState("all");
  const [placement, setPlacement] = useState<AdPlacement | "all">("all");
  const [status, setStatus] = useState("all");
  const [location, setLocation] = useState("");
  const [interest, setInterest] = useState("all");
  const interestOptions = useMemo(
    () => [...new Set(adsManager.campaigns.flatMap((campaign) => campaign.targetInterestLabels))].sort(),
    [adsManager.campaigns]
  );

  const filteredCampaigns = useMemo(
    () =>
      adsManager.campaigns.filter((campaign) => {
        if (campaignId !== "all" && campaign.id !== campaignId) return false;
        if (placement !== "all" && campaign.placement !== placement) return false;
        if (status !== "all" && campaign.status !== status) return false;
        if (interest !== "all" && !campaign.targetInterestLabels.includes(interest)) return false;
        if (location.trim() && !(campaign.targetLocation ?? "").toLowerCase().includes(location.trim().toLowerCase())) return false;
        return true;
      }),
    [adsManager.campaigns, campaignId, interest, location, placement, status]
  );

  const campaignIds = useMemo(() => new Set(filteredCampaigns.map((campaign) => campaign.id)), [filteredCampaigns]);
  const filteredEvents = useMemo(
    () =>
      adsManager.metrics.events.filter((event) => {
        if (!campaignIds.has(event.campaignId)) return false;
        if (placement !== "all" && event.placement !== placement) return false;
        if (location.trim() && !(event.viewerLocation ?? "").toLowerCase().includes(location.trim().toLowerCase())) return false;
        return true;
      }),
    [adsManager.metrics.events, campaignIds, location, placement]
  );

  const totals = useMemo(() => {
    const impressions = filteredEvents.filter((event) => event.eventType === "IMPRESSION").length;
    const clicks = filteredEvents.filter((event) => event.eventType === "CLICK").length;
    const spentCredits = filteredCampaigns.reduce((sum, campaign) => sum + campaign.spentCredits, 0);
    const budgetCredits = filteredCampaigns.reduce((sum, campaign) => sum + campaign.totalBudgetCredits, 0);
    const clickRate = impressions > 0 ? (clicks / impressions) * 100 : 0;

    return { budgetCredits, clickRate, clicks, impressions, spentCredits };
  }, [filteredCampaigns, filteredEvents]);

  const buckets = useMemo(() => {
    const map = new Map<string, { clicks: number; impressions: number }>();

    for (const event of filteredEvents) {
      const key = bucketDate(event.createdAt, timeframe);
      const current = map.get(key) ?? { clicks: 0, impressions: 0 };
      if (event.eventType === "CLICK") current.clicks += 1;
      if (event.eventType === "IMPRESSION") current.impressions += 1;
      map.set(key, current);
    }

    return [...map.entries()].map(([label, value]) => ({ label, ...value })).slice(0, 24);
  }, [filteredEvents, timeframe]);

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Business Center</p>
            <h1 className="mt-3 text-3xl font-semibold">Ad metrics</h1>
            <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
              Performance from recorded delivery events. Filters use real campaign and profile signals currently collected by Theta-Space.
            </p>
          </div>
          <Link className="btn-secondary" href="/business-center">
            Center
          </Link>
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <div className="business-metrics-filters">
          <label>
            <span className="form-label">Timeframe</span>
            <select className="form-field" onChange={(event) => setTimeframe(event.target.value as Timeframe)} value={timeframe}>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label>
            <span className="form-label">Campaign</span>
            <select className="form-field" onChange={(event) => setCampaignId(event.target.value)} value={campaignId}>
              <option value="all">All campaigns</option>
              {adsManager.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">Placement</span>
            <select className="form-field" onChange={(event) => setPlacement(event.target.value as AdPlacement | "all")} value={placement}>
              <option value="all">All placements</option>
              {adPlacementOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">Status</span>
            <select className="form-field" onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value="all">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="ENDED">Ended</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <label>
            <span className="form-label">Location</span>
            <input className="form-field" onChange={(event) => setLocation(event.target.value)} placeholder="Target or viewer location" value={location} />
          </label>
          <label>
            <span className="form-label">Interest</span>
            <select className="form-field" onChange={(event) => setInterest(event.target.value)} value={interest}>
              <option value="all">All interests</option>
              {interestOptions.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="business-metrics-summary">
        <article>
          <span>Impressions</span>
          <strong>{totals.impressions.toLocaleString()}</strong>
        </article>
        <article>
          <span>Clicks</span>
          <strong>{totals.clicks.toLocaleString()}</strong>
        </article>
        <article>
          <span>Click rate</span>
          <strong>{totals.clickRate.toFixed(1)}%</strong>
        </article>
        <article>
          <span>Credits</span>
          <strong>
            {totals.spentCredits.toLocaleString()} / {totals.budgetCredits.toLocaleString()}
          </strong>
        </article>
      </section>

      <section className="surface rounded-md p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Delivery by {timeframe}</h2>
          <p className="text-xs text-[var(--muted)]">Updated {new Date(adsManager.metrics.generatedAt).toLocaleString()}</p>
        </div>
        {buckets.length > 0 ? (
          <div className="business-metrics-table mt-4">
            <div className="business-metrics-row is-head">
              <span>Period</span>
              <span>Impressions</span>
              <span>Clicks</span>
            </div>
            {buckets.map((bucket) => (
              <div className="business-metrics-row" key={bucket.label}>
                <span>{bucket.label}</span>
                <span>{bucket.impressions.toLocaleString()}</span>
                <span>{bucket.clicks.toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-dashed border-[var(--line)] p-5 text-[var(--muted)]">
            No delivery events match these filters yet. Campaign setup and budget metrics still appear above.
          </p>
        )}
      </section>
    </div>
  );
}
