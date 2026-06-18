"use client";

import { AdPlacement, ScientologyClassification } from "@prisma/client";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  adClassificationOptions,
  adPlacementOptions,
  type AdCampaignCardView,
  type AdsManagerView
} from "@/modules/ads-credits/types";

export function CreateAdCampaignForm({ adsManager }: { adsManager: AdsManagerView }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [placement, setPlacement] = useState<AdPlacement>(AdPlacement.RIGHT_STREAM);
  const [targetLocation, setTargetLocation] = useState("");
  const [targetClassification, setTargetClassification] = useState("");
  const [totalBudgetCredits, setTotalBudgetCredits] = useState("10");
  const [dailyBudgetCredits, setDailyBudgetCredits] = useState("");
  const [error, setError] = useState(adsManager.canCreate ? "" : adsManager.reason ?? "This account cannot create ads.");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/ads/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          destinationUrl,
          placement,
          targetLocation,
          targetClassification: targetClassification || null,
          totalBudgetCredits,
          dailyBudgetCredits: dailyBudgetCredits || null
        })
      });
      const payload = (await response.json()) as { error?: string; campaign?: AdCampaignCardView };

      if (!response.ok || !payload.campaign) {
        setError(payload.error ?? "Could not create ad campaign.");
        return;
      }

      window.location.href = "/ads";
    });
  }

  if (!adsManager.canCreate) {
    return (
      <section className="surface rounded-md p-8 text-center">
        <h1 className="text-3xl font-semibold text-[var(--gold)]">Create Ad</h1>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--muted)]">{error}</p>
        <Link className="btn-secondary mt-5 inline-block" href="/ads">
          Back to ads
        </Link>
      </section>
    );
  }

  return (
    <form className="surface grid gap-5 rounded-md p-6" onSubmit={submit}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Ads Credits</p>
        <h1 className="mt-3 text-3xl font-semibold">Create an ad</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Use reserved placements only. Targeting is limited to permitted, privacy-aware fields.
        </p>
        <p className="mt-3 text-sm text-[var(--gold)]">{adsManager.platformCredits} platform credits available.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Headline</span>
          <input className="form-field" onChange={(event) => setTitle(event.target.value)} value={title} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Destination URL</span>
          <input className="form-field" onChange={(event) => setDestinationUrl(event.target.value)} placeholder="https://..." value={destinationUrl} />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="form-label">Ad text</span>
        <textarea className="form-field min-h-28 resize-y" onChange={(event) => setBody(event.target.value)} value={body} />
      </label>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-2">
          <span className="form-label">Placement</span>
          <select className="form-field" onChange={(event) => setPlacement(event.target.value as AdPlacement)} value={placement}>
            {adPlacementOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="form-label">Total credits</span>
          <input className="form-field" inputMode="numeric" onChange={(event) => setTotalBudgetCredits(event.target.value)} value={totalBudgetCredits} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Daily cap, optional</span>
          <input className="form-field" inputMode="numeric" onChange={(event) => setDailyBudgetCredits(event.target.value)} value={dailyBudgetCredits} />
        </label>
      </div>

      <section className="rounded-md border border-[var(--line)] bg-black/10 p-4">
        <h2 className="font-semibold text-[var(--gold)]">Targeting</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          This phase supports location text and My Scientology classification only when users allow ad targeting.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <input
            className="form-field"
            onChange={(event) => setTargetLocation(event.target.value)}
            placeholder="Location text, optional"
            value={targetLocation}
          />
          <select className="form-field" onChange={(event) => setTargetClassification(event.target.value)} value={targetClassification}>
            <option value="">Any classification</option>
            {adClassificationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <Link className="btn-secondary" href="/ads">
          Cancel
        </Link>
        <button className="btn-primary" disabled={isPending || title.trim().length < 2 || body.trim().length < 8} type="submit">
          {isPending ? "Creating..." : "Create campaign"}
        </button>
      </div>
    </form>
  );
}
