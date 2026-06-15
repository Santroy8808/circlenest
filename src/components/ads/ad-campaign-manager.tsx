"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdCampaignSummary } from "@/lib/ads/campaigns";

const FIELD_CLASS =
  "w-full rounded-lg border border-[#52647f] bg-[#253145] px-3 py-2 font-sans text-sm leading-5 text-[#f3f6fb] shadow-inner shadow-black/10 placeholder:text-slate-400 focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/25";

type AdCampaignManagerProps = {
  campaigns: AdCampaignSummary[];
  canCreate: boolean;
  profileReady: boolean;
  creditBalance: number;
  initialDraft?: {
    title?: string;
    targetType?: string;
    targetId?: string;
    articleTitle?: string;
    articleBody?: string;
  };
};

export function AdCampaignManager({ campaigns, canCreate, profileReady, creditBalance, initialDraft }: AdCampaignManagerProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [targetType, setTargetType] = useState(initialDraft?.targetType ?? "BUSINESS_PROFILE");
  const [targetId, setTargetId] = useState(initialDraft?.targetId ?? "");
  const [imageUrl, setImageUrl] = useState("");
  const [articleTitle, setArticleTitle] = useState(initialDraft?.articleTitle ?? "");
  const [articleBody, setArticleBody] = useState(initialDraft?.articleBody ?? "");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [platformCreditBudget, setPlatformCreditBudget] = useState("0");
  const [budgetAmountCents, setBudgetAmountCents] = useState("0");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [targetCountries, setTargetCountries] = useState("");
  const [targetStates, setTargetStates] = useState("");
  const [targetCities, setTargetCities] = useState("");
  const [targetGenders, setTargetGenders] = useState("");
  const [targetScientologyClassifications, setTargetScientologyClassifications] = useState("");
  const [targetMinAge, setTargetMinAge] = useState("");
  const [targetMaxAge, setTargetMaxAge] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE").length;
  const totalImpressions = campaigns.reduce((sum, campaign) => sum + campaign.metrics.impressions, 0);
  const totalClicks = campaigns.reduce((sum, campaign) => sum + campaign.metrics.clicks, 0);
  const totalCreditsReserved = campaigns.reduce((sum, campaign) => sum + campaign.platformCreditBudget, 0);

  async function submitCampaign() {
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/ads/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          targetType,
          targetId: targetId || null,
          imageUrl: imageUrl || null,
          heroImageUrl: imageUrl || null,
          articleTitle: articleTitle || title,
          articleBody,
          ctaLabel: ctaLabel || null,
          ctaUrl: ctaUrl || null,
          targetCountries,
          targetStates,
          targetCities,
          targetGenders,
          targetScientologyClassifications,
          targetMinAge: targetMinAge || null,
          targetMaxAge: targetMaxAge || null,
          platformCreditBudget: Number.parseInt(platformCreditBudget || "0", 10),
          budgetAmountCents: Math.round(Number.parseFloat(budgetAmountCents || "0") * 100),
          startsAt: startsAt || null,
          endsAt: endsAt || null,
          status,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "Could not create campaign.");
        return;
      }
      setTitle("");
      setTargetType("BUSINESS_PROFILE");
      setTargetId("");
      setImageUrl("");
      setArticleTitle("");
      setArticleBody("");
      setCtaLabel("");
      setCtaUrl("");
      setTargetCountries("");
      setTargetStates("");
      setTargetCities("");
      setTargetGenders("");
      setTargetScientologyClassifications("");
      setTargetMinAge("");
      setTargetMaxAge("");
      setPlatformCreditBudget("0");
      setBudgetAmountCents("0");
      setStartsAt("");
      setEndsAt("");
      setStatus("DRAFT");
      setMessage("Campaign created.");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Campaigns", campaigns.length],
          ["Active", activeCampaigns],
          ["Impressions", totalImpressions],
          ["Clicks", totalClicks],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded border border-[#304058] bg-[#101a2c] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded border border-[var(--border)] bg-[#101a2c] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">Create campaign</h2>
            <p className="text-sm text-slate-400">Build the placement, landing article, duration, and platform-credit budget together.</p>
          </div>
          <div className="rounded border border-[#304058] bg-[#0d1626] px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">Platform credits</p>
            <p className="text-lg font-semibold text-[var(--text-strong)]">{creditBalance}</p>
            <p className="text-[11px] text-slate-500">{totalCreditsReserved} reserved in campaigns</p>
          </div>
        </div>

        {!canCreate ? (
          <p className="mt-3 rounded border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">Upgrade to Biz or Auditor to create ad campaigns.</p>
        ) : !profileReady ? (
          <p className="mt-3 rounded border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">Complete Company Profile before launching campaigns.</p>
        ) : (
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-300">Campaign title</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} className={FIELD_CLASS} placeholder="Summer bookstore feature" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-300">Target</span>
                <select value={targetType} onChange={(event) => setTargetType(event.target.value)} className={FIELD_CLASS}>
                  <option value="BUSINESS_PROFILE">Business Profile</option>
                  <option value="MARKET_LISTING">Market Listing</option>
                  <option value="EVENT_LISTING">Event Listing</option>
                  <option value="JOB_LISTING">Job Listing</option>
                  <option value="FUNDRAISER_LISTING">Fundraiser Listing</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-300">Target ID, optional</span>
                <input value={targetId} onChange={(event) => setTargetId(event.target.value)} className={FIELD_CLASS} placeholder="Specific listing/event/job ID" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-300">Campaign image URL</span>
                <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} className={FIELD_CLASS} placeholder="/uploads/..." />
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-300">Landing article title</span>
              <input value={articleTitle} onChange={(event) => setArticleTitle(event.target.value)} className={FIELD_CLASS} placeholder="Defaults to campaign title" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-300">Landing article body</span>
              <textarea value={articleBody} onChange={(event) => setArticleBody(event.target.value)} className={`${FIELD_CLASS} min-h-32`} placeholder="Tell members what this campaign is promoting." />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-300">Call-to-action label</span>
                <input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} className={FIELD_CLASS} placeholder="Learn more" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-300">Call-to-action URL</span>
                <input value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} className={FIELD_CLASS} placeholder="/storefront/your-business" />
              </label>
            </div>
            <section className="grid gap-3 rounded-lg border border-[#304058] bg-[#0d1626] p-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-strong)]">Audience targeting</p>
                <p className="text-xs text-slate-400">Use any combination of location, age, gender, or My Scientology classification. Leave fields blank for broad reach.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-300">Countries</span>
                  <input value={targetCountries} onChange={(event) => setTargetCountries(event.target.value)} className={FIELD_CLASS} placeholder="USA, Canada" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-300">States</span>
                  <input value={targetStates} onChange={(event) => setTargetStates(event.target.value)} className={FIELD_CLASS} placeholder="Texas, Florida" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-300">Cities</span>
                  <input value={targetCities} onChange={(event) => setTargetCities(event.target.value)} className={FIELD_CLASS} placeholder="Austin, Clearwater" />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-300">Gender</span>
                  <input value={targetGenders} onChange={(event) => setTargetGenders(event.target.value)} className={FIELD_CLASS} placeholder="Female, Male" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-300">My Scientology classification</span>
                  <input
                    value={targetScientologyClassifications}
                    onChange={(event) => setTargetScientologyClassifications(event.target.value)}
                    className={FIELD_CLASS}
                    placeholder="Class V, CLEAR, OT VIII"
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-300">Minimum age</span>
                  <input value={targetMinAge} onChange={(event) => setTargetMinAge(event.target.value)} className={FIELD_CLASS} inputMode="numeric" placeholder="21" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-300">Maximum age</span>
                  <input value={targetMaxAge} onChange={(event) => setTargetMaxAge(event.target.value)} className={FIELD_CLASS} inputMode="numeric" placeholder="65" />
                </label>
              </div>
            </section>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-300">Platform credits</span>
                <input value={platformCreditBudget} onChange={(event) => setPlatformCreditBudget(event.target.value)} className={FIELD_CLASS} inputMode="numeric" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-300">Budget note, dollars</span>
                <input value={budgetAmountCents} onChange={(event) => setBudgetAmountCents(event.target.value)} className={FIELD_CLASS} inputMode="decimal" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-300">Starts</span>
                <input value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={FIELD_CLASS} type="datetime-local" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-300">Ends</span>
                <input value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={FIELD_CLASS} type="datetime-local" />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-300">Launch state</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className={FIELD_CLASS}>
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                </select>
              </label>
              <button
                type="button"
                disabled={sending || !title.trim() || !articleBody.trim()}
                onClick={() => void submitCampaign()}
                className="rounded-full bg-[#3668ff] px-5 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#5781ff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "Creating..." : "Create campaign"}
              </button>
            </div>
            {message ? <p className="text-sm text-slate-300">{message}</p> : null}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Campaigns</h2>
        {campaigns.length ? (
          campaigns.map((campaign) => (
            <article key={campaign.id} className="rounded border border-[var(--border)] bg-[#101a2c] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)]/40">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-[var(--text-strong)]">{campaign.title}</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-[#f0d878]">{campaign.targetType.replaceAll("_", " ")}</p>
                </div>
                <span className="rounded-full border border-[#52647f] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">{campaign.status}</span>
              </div>
              {campaign.landingArticle ? <p className="mt-2 line-clamp-3 text-sm text-slate-300">{campaign.landingArticle.body}</p> : null}
              {campaign.targeting.countries.length || campaign.targeting.states.length || campaign.targeting.cities.length || campaign.targeting.genders.length || campaign.targeting.scientologyClassifications.length || campaign.targeting.minAge !== null || campaign.targeting.maxAge !== null ? (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
                  {campaign.targeting.countries.length ? <span className="rounded-full border border-[#304058] px-2 py-1">Country: {campaign.targeting.countries.join(", ")}</span> : null}
                  {campaign.targeting.states.length ? <span className="rounded-full border border-[#304058] px-2 py-1">State: {campaign.targeting.states.join(", ")}</span> : null}
                  {campaign.targeting.cities.length ? <span className="rounded-full border border-[#304058] px-2 py-1">City: {campaign.targeting.cities.join(", ")}</span> : null}
                  {campaign.targeting.genders.length ? <span className="rounded-full border border-[#304058] px-2 py-1">Gender: {campaign.targeting.genders.join(", ")}</span> : null}
                  {campaign.targeting.scientologyClassifications.length ? <span className="rounded-full border border-[#304058] px-2 py-1">Classification: {campaign.targeting.scientologyClassifications.join(", ")}</span> : null}
                  {campaign.targeting.minAge !== null || campaign.targeting.maxAge !== null ? (
                    <span className="rounded-full border border-[#304058] px-2 py-1">
                      Age: {campaign.targeting.minAge ?? "Any"}-{campaign.targeting.maxAge ?? "Any"}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-4">
                <p>Rank: {campaign.finalRankScore}</p>
                <p>Credits: {campaign.platformCreditBudget}</p>
                <p>Impressions: {campaign.metrics.impressions}</p>
                <p>Clicks: {campaign.metrics.clicks}</p>
              </div>
            </article>
          ))
        ) : (
          <p className="rounded border border-dashed border-[#304058] bg-[#101a2c] p-4 text-sm text-slate-400">No campaigns yet.</p>
        )}
      </section>
    </div>
  );
}
