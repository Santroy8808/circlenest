"use client";

import { AdDestinationKind, AdPlacement, InterestCategory, MediaVisibility } from "@prisma/client";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import {
  adPlacementOptions,
  interestCategoryOptions,
  type AdCampaignCardView,
  type AdsManagerView
} from "@/modules/ads-credits/types";

type AdImageAttachment = {
  file: File;
  previewUrl: string;
  mediaAssetId?: string;
  progress: number;
  status: "ready" | "uploading" | "done" | "error";
  error?: string;
};

export type InitialAdCampaignDraft = {
  title?: string;
  body?: string;
  destinationKind?: AdDestinationKind;
  marketListingId?: string;
  businessArticleId?: string;
  customDestinationUrl?: string;
  subscriberTargetManuscriptId?: string;
  targetInterestCategories?: InterestCategory[];
};

const MAX_AD_IMAGE_BYTES = 10 * 1024 * 1024;
const AD_IMAGE_GUIDANCE = "Recommended: 1200 x 675px, minimum 600 x 338px. JPG, PNG, GIF, or WEBP up to 10MB.";
const CREDIT_BUDGET_PRESETS = [10, 25, 50, 100, 250, 500];
const CAMPAIGN_DURATION_PRESETS = [1, 3, 7, 14, 30, 60, 90];

async function uploadAdImage(image: AdImageAttachment, onUpdate: (patch: Partial<AdImageAttachment>) => void) {
  if (image.mediaAssetId) return image.mediaAssetId;

  onUpdate({ status: "uploading", progress: 1, error: undefined });

  const intentResponse = await fetch("/api/media/upload-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: image.file.name,
      mimeType: image.file.type || "application/octet-stream",
      sizeBytes: image.file.size,
      visibility: MediaVisibility.PUBLIC
    })
  });
  const intent = (await intentResponse.json()) as { error?: string; uploadUrl?: string; storageKey?: string };

  if (!intentResponse.ok || !intent.uploadUrl || !intent.storageKey) {
    throw new Error(intent.error ?? "Could not prepare ad image upload.");
  }

  await uploadWithResilientFallback({
    uploadUrl: intent.uploadUrl,
    storageKey: intent.storageKey,
    file: image.file,
    onProgress: (progress) => onUpdate({ progress })
  });

  const completeResponse = await fetch("/api/media/complete-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storageKey: intent.storageKey,
      fileName: image.file.name,
      mimeType: image.file.type || "application/octet-stream",
      sizeBytes: image.file.size,
      visibility: MediaVisibility.PUBLIC,
      caption: "Ad creative",
      tags: ["ad"]
    })
  });
  const complete = (await completeResponse.json()) as { error?: string; asset?: { id: string } };

  if (!completeResponse.ok || !complete.asset?.id) {
    throw new Error(complete.error ?? "Could not save ad image.");
  }

  onUpdate({ status: "done", progress: 100, mediaAssetId: complete.asset.id });
  return complete.asset.id;
}

function initialDestinationKind(adsManager: AdsManagerView, initialDraft?: InitialAdCampaignDraft) {
  if (adsManager.fundraiserOnly) return AdDestinationKind.EXTERNAL_URL;
  if (initialDraft?.destinationKind) return initialDraft.destinationKind;
  if (adsManager.destinationOptions.storefronts.length > 0) return AdDestinationKind.STOREFRONT;
  if (adsManager.destinationOptions.marketListings.length > 0) return AdDestinationKind.MARKET_LISTING;
  if (adsManager.destinationOptions.businessArticles.length > 0) return AdDestinationKind.BUSINESS_ARTICLE;
  return AdDestinationKind.EXTERNAL_URL;
}

function durationLabel(days: number | null) {
  if (!days) return "action based";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function packageCreditCost(pricingPackage: { creditCost: number } | undefined, fundraiserOnly: boolean) {
  if (!pricingPackage) return 1;
  return fundraiserOnly ? Math.ceil(pricingPackage.creditCost / 2) : pricingPackage.creditCost;
}

function packageDurationDays(pricingPackage: { durationDays: number | null } | undefined) {
  return pricingPackage?.durationDays && pricingPackage.durationDays > 0 ? pricingPackage.durationDays : 7;
}

export function CreateAdCampaignForm({ adsManager, initialDraft }: { adsManager: AdsManagerView; initialDraft?: InitialAdCampaignDraft }) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [destinationKind, setDestinationKind] = useState<AdDestinationKind>(() => initialDestinationKind(adsManager, initialDraft));
  const [marketListingId, setMarketListingId] = useState(initialDraft?.marketListingId ?? adsManager.destinationOptions.marketListings[0]?.id ?? "");
  const [businessArticleId, setBusinessArticleId] = useState(initialDraft?.businessArticleId ?? adsManager.destinationOptions.businessArticles[0]?.id ?? "");
  const [customDestinationUrl, setCustomDestinationUrl] = useState(initialDraft?.customDestinationUrl ?? "");
  const [subscriberTargetManuscriptId, setSubscriberTargetManuscriptId] = useState(initialDraft?.subscriberTargetManuscriptId ?? "");
  const initialPricingPackage = adsManager.pricingPackages.find((pricingPackage) => pricingPackage.placement === AdPlacement.RIGHT_STREAM) ?? adsManager.pricingPackages[0];
  const [placement, setPlacement] = useState<AdPlacement>(initialPricingPackage?.placement ?? AdPlacement.RIGHT_STREAM);
  const [pricingRuleKey, setPricingRuleKey] = useState(initialPricingPackage?.key ?? "");
  const [campaignCredits, setCampaignCredits] = useState(() => packageCreditCost(initialPricingPackage, adsManager.fundraiserOnly));
  const [campaignDurationDays, setCampaignDurationDays] = useState(() => packageDurationDays(initialPricingPackage));
  const [targetLocation, setTargetLocation] = useState("");
  const [targetInterestCategories, setTargetInterestCategories] = useState<InterestCategory[]>(initialDraft?.targetInterestCategories ?? []);
  const [image, setImage] = useState<AdImageAttachment | null>(null);
  const [externalImageUrl, setExternalImageUrl] = useState("");
  const [error, setError] = useState(adsManager.canCreate ? "" : adsManager.reason ?? "This account cannot create ads.");
  const [isPending, startTransition] = useTransition();
  const placementPackages = useMemo(
    () => adsManager.pricingPackages.filter((pricingPackage) => pricingPackage.placement === placement),
    [adsManager.pricingPackages, placement]
  );
  const selectedPricingPackage = placementPackages.find((pricingPackage) => pricingPackage.key === pricingRuleKey) ?? placementPackages[0];
  const selectedPackageCreditCost = packageCreditCost(selectedPricingPackage, adsManager.fundraiserOnly);
  const campaignDailyWeight = campaignDurationDays > 0 ? campaignCredits / campaignDurationDays : 0;
  const canAffordBudget = selectedPricingPackage ? adsManager.platformCredits >= campaignCredits : false;

  const hasDestination =
    (destinationKind === AdDestinationKind.STOREFRONT && adsManager.destinationOptions.storefronts.length > 0) ||
    (destinationKind === AdDestinationKind.MARKET_LISTING && marketListingId.length > 0) ||
    (destinationKind === AdDestinationKind.BUSINESS_ARTICLE && businessArticleId.length > 0) ||
    (destinationKind === AdDestinationKind.EXTERNAL_URL && customDestinationUrl.trim().length > 0);

  function updateImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a JPG, PNG, GIF, or WEBP image.");
      return;
    }
    if (file.size > MAX_AD_IMAGE_BYTES) {
      setError("Ad images can be up to 10MB.");
      return;
    }
    if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
    setImage({
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: "ready"
    });
    setError("");
  }

  function patchImage(patch: Partial<AdImageAttachment>) {
    setImage((current) => (current ? { ...current, ...patch } : current));
  }

  function toggleInterest(category: InterestCategory) {
    setTargetInterestCategories((current) =>
      current.includes(category) ? current.filter((value) => value !== category) : [...current, category].slice(0, 6)
    );
  }

  function applyPricingPreset(pricingPackage: AdsManagerView["pricingPackages"][number] | undefined) {
    if (!pricingPackage) return;
    setPricingRuleKey(pricingPackage.key);
    setCampaignCredits(packageCreditCost(pricingPackage, adsManager.fundraiserOnly));
    setCampaignDurationDays(packageDurationDays(pricingPackage));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        if (!image && !externalImageUrl.trim()) {
          setError("Upload an ad image or enter an image URL before creating the campaign.");
          return;
        }
        if (!hasDestination) {
          setError("Choose a valid internal destination for this ad.");
          return;
        }
        if (!selectedPricingPackage) {
          setError("Choose an active ad package.");
          return;
        }
        if (campaignCredits < 1 || campaignCredits > 100000) {
          setError("Choose a credit budget between 1 and 100,000 credits.");
          return;
        }
        if (campaignDurationDays < 1 || campaignDurationDays > 365) {
          setError("Choose a campaign length between 1 and 365 days.");
          return;
        }
        if (!canAffordBudget) {
          setError("Not enough platform credits for this campaign budget.");
          return;
        }

        const imageMediaAssetId = image ? await uploadAdImage(image, patchImage) : "";
        const response = await fetch("/api/ads/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            body,
            imageMediaAssetId,
            externalImageUrl: imageMediaAssetId ? "" : externalImageUrl,
            destinationKind,
            marketListingId: destinationKind === AdDestinationKind.MARKET_LISTING ? marketListingId : "",
            businessArticleId: destinationKind === AdDestinationKind.BUSINESS_ARTICLE ? businessArticleId : "",
            customDestinationUrl: destinationKind === AdDestinationKind.EXTERNAL_URL ? customDestinationUrl : "",
            subscriberTargetManuscriptId,
            placement,
            pricingRuleKey: selectedPricingPackage.key,
            targetLocation,
            targetInterestCategories,
            totalBudgetCredits: campaignCredits,
            campaignDurationDays
          })
        });
        const payload = (await response.json()) as { error?: string; campaign?: AdCampaignCardView };

        if (!response.ok || !payload.campaign) {
          setError(payload.error ?? "Could not create ad campaign.");
          return;
        }

        window.location.href = "/ads";
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Could not create ad campaign.";
        patchImage({ status: "error", error: message });
        setError(message);
      }
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
          Ads use uploaded creative and a defined click-through destination. They never appear inside listings, events, posts, or detail content.
        </p>
        {adsManager.fundraiserOnly ? (
          <p className="mt-3 max-w-2xl rounded-md border border-[var(--gold)]/40 bg-[var(--gold)]/10 p-3 text-sm leading-6 text-[var(--gold)]">
            Org accounts can create fundraiser ads only. Credits count double here, so the displayed package cost is half the normal platform price.
          </p>
        ) : null}
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-4 py-2 text-sm font-semibold text-[var(--gold)]">
          <span>{adsManager.platformCredits.toLocaleString()} credits available</span>
        </div>
      </div>

      <section className="ad-creative-picker">
        <input
          accept="image/*"
          className="sr-only"
          onChange={(event) => updateImage(event.target.files?.[0])}
          ref={imageInputRef}
          type="file"
        />
        <div>
          <span className="form-label">Ad image</span>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Upload the image people will see in the reserved ad stream, or paste an image URL below. If both are provided, the uploaded image is used.
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">{AD_IMAGE_GUIDANCE}</p>
        </div>
        <button className="btn-secondary" onClick={() => imageInputRef.current?.click()} type="button">
          {image ? "Change image" : "Upload image"}
        </button>
        {image ? (
          <div className="ad-creative-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Selected ad creative preview" src={image.previewUrl} />
            <div>
              <p className="font-semibold">{image.file.name}</p>
              <p className="text-sm text-[var(--muted)]">{Math.max(1, Math.round(image.file.size / 1024))} KB</p>
              {image.status === "uploading" ? (
                <div className="feed-upload-meter">
                  <span style={{ width: `${image.progress}%` }} />
                </div>
              ) : null}
              {image.error ? <p className="mt-2 text-sm text-red-100">{image.error}</p> : null}
            </div>
          </div>
        ) : null}
        <label className="grid gap-2">
          <span className="form-label">Image URL fallback</span>
          <input
            className="form-field"
            onChange={(event) => setExternalImageUrl(event.target.value)}
            placeholder="https://example.com/ad-image.jpg"
            value={externalImageUrl}
          />
          <small className="text-[var(--muted)]">Use this when the creative is hosted elsewhere. Uploaded files are preferred for reliability.</small>
        </label>
        {!image && externalImageUrl.trim() ? (
          <div className="ad-creative-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Linked ad creative preview" src={externalImageUrl} />
            <div>
              <p className="font-semibold">Linked image preview</p>
              <p className="text-sm text-[var(--muted)]">The server will validate this as an HTTP(S) image URL when the campaign is created.</p>
            </div>
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Headline</span>
          <input className="form-field" onChange={(event) => setTitle(event.target.value)} value={title} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Ad text</span>
          <input className="form-field" onChange={(event) => setBody(event.target.value)} value={body} />
        </label>
      </div>

      <section className="grid gap-4 rounded-md border border-[var(--line)] bg-black/10 p-4">
        <div>
          <h2 className="font-semibold text-[var(--gold)]">Destination</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Choose what opens when someone clicks the ad.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <button
            className={`destination-choice ${destinationKind === AdDestinationKind.STOREFRONT ? "is-active" : ""}`}
            disabled={adsManager.fundraiserOnly || adsManager.destinationOptions.storefronts.length === 0}
            onClick={() => setDestinationKind(AdDestinationKind.STOREFRONT)}
            type="button"
          >
            <span>Storefront</span>
            <small>{adsManager.destinationOptions.storefronts[0]?.label ?? "Publish a storefront first"}</small>
          </button>
          <button
            className={`destination-choice ${destinationKind === AdDestinationKind.MARKET_LISTING ? "is-active" : ""}`}
            disabled={adsManager.fundraiserOnly || adsManager.destinationOptions.marketListings.length === 0}
            onClick={() => setDestinationKind(AdDestinationKind.MARKET_LISTING)}
            type="button"
          >
            <span>Listing ad</span>
            <small>{adsManager.destinationOptions.marketListings.length} active listing(s)</small>
          </button>
          <button
            className={`destination-choice ${destinationKind === AdDestinationKind.BUSINESS_ARTICLE ? "is-active" : ""}`}
            disabled={adsManager.fundraiserOnly || adsManager.destinationOptions.businessArticles.length === 0}
            onClick={() => setDestinationKind(AdDestinationKind.BUSINESS_ARTICLE)}
            type="button"
          >
            <span>Article</span>
            <small>{adsManager.destinationOptions.businessArticles.length} published article(s)</small>
          </button>
          <button
            className={`destination-choice ${destinationKind === AdDestinationKind.EXTERNAL_URL ? "is-active" : ""}`}
            onClick={() => setDestinationKind(AdDestinationKind.EXTERNAL_URL)}
            type="button"
          >
            <span>Custom URL</span>
            <small>Use your website or one of your own internal pages</small>
          </button>
        </div>

        {destinationKind === AdDestinationKind.MARKET_LISTING ? (
          <label className="grid gap-2">
            <span className="form-label">Market listing</span>
            <select className="form-field" onChange={(event) => setMarketListingId(event.target.value)} value={marketListingId}>
              {adsManager.destinationOptions.marketListings.map((listing) => (
                <option key={listing.id} value={listing.id}>
                  {listing.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {destinationKind === AdDestinationKind.BUSINESS_ARTICLE ? (
          <label className="grid gap-2">
            <span className="form-label">Storefront article</span>
            <select className="form-field" onChange={(event) => setBusinessArticleId(event.target.value)} value={businessArticleId}>
              {adsManager.destinationOptions.businessArticles.map((article) => (
                <option key={article.id} value={article.id}>
                  {article.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {destinationKind === AdDestinationKind.EXTERNAL_URL ? (
          <label className="grid gap-2">
            <span className="form-label">Click-through URL</span>
            <input
              className="form-field"
              onChange={(event) => setCustomDestinationUrl(event.target.value)}
              placeholder={adsManager.fundraiserOnly ? "/fundraisers/your-fundraiser" : "https://example.com/page or /market/your-listing"}
              value={customDestinationUrl}
            />
            <small className="text-[var(--muted)]">
              {adsManager.fundraiserOnly
                ? "Org ads must point to one of your own fundraiser pages."
                : "Internal Theta-Space destinations must belong to you: your storefront, listings, jobs, events, fundraisers, or manuscripts."}
            </small>
          </label>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-md border border-[var(--line)] bg-black/10 p-4">
        <div>
          <h2 className="font-semibold text-[var(--gold)]">Budget and schedule</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Pick a placement and preset, then set how many credits and days this campaign should use.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Placement</span>
            <select
              className="form-field"
              onChange={(event) => {
                const nextPlacement = event.target.value as AdPlacement;
                const nextPackage = adsManager.pricingPackages.find((pricingPackage) => pricingPackage.placement === nextPlacement);
                setPlacement(nextPlacement);
                applyPricingPreset(nextPackage);
              }}
              value={placement}
            >
              {adPlacementOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="form-label">Preset package</span>
            <select
              className="form-field"
              onChange={(event) => {
                const nextPackage = placementPackages.find((pricingPackage) => pricingPackage.key === event.target.value);
                applyPricingPreset(nextPackage);
              }}
              value={selectedPricingPackage?.key ?? ""}
            >
              {placementPackages.map((pricingPackage) => (
                <option key={pricingPackage.key} value={pricingPackage.key}>
                  {pricingPackage.label}
                </option>
              ))}
            </select>
            <small className="text-[var(--muted)]">
              Presets fill a starting budget and duration. You can adjust both before creating the campaign.
            </small>
          </label>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_0.9fr]">
          <label className="grid gap-2">
            <span className="form-label">Credits to designate</span>
            <input
              className="form-field"
              max={100000}
              min={1}
              onChange={(event) => setCampaignCredits(Math.max(1, Math.min(100000, Number(event.target.value) || 1)))}
              type="number"
              value={campaignCredits}
            />
            <div className="flex flex-wrap gap-2">
              {CREDIT_BUDGET_PRESETS.map((credits) => (
                <button
                  className={`interest-chip ${campaignCredits === credits ? "is-active" : ""}`}
                  disabled={credits > adsManager.platformCredits}
                  key={credits}
                  onClick={() => setCampaignCredits(credits)}
                  type="button"
                >
                  {credits}
                </button>
              ))}
            </div>
          </label>
          <label className="grid gap-2">
            <span className="form-label">Campaign length</span>
            <input
              className="form-field"
              max={365}
              min={1}
              onChange={(event) => setCampaignDurationDays(Math.max(1, Math.min(365, Number(event.target.value) || 1)))}
              type="number"
              value={campaignDurationDays}
            />
            <div className="flex flex-wrap gap-2">
              {CAMPAIGN_DURATION_PRESETS.map((days) => (
                <button
                  className={`interest-chip ${campaignDurationDays === days ? "is-active" : ""}`}
                  key={days}
                  onClick={() => setCampaignDurationDays(days)}
                  type="button"
                >
                  {durationLabel(days)}
                </button>
              ))}
            </div>
          </label>
          <div className="ad-cost-estimate">
            <span>Campaign budget</span>
            <strong>{selectedPricingPackage ? `${campaignCredits.toLocaleString()} credits` : "No package"}</strong>
            <small>
              {selectedPricingPackage
                ? `${durationLabel(campaignDurationDays)} | ${campaignDailyWeight.toFixed(1)} credits/day weight | preset ${selectedPackageCreditCost} credits`
                : "Ask an admin to activate a package."}
            </small>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-[var(--line)] bg-black/10 p-4">
        <h2 className="font-semibold text-[var(--gold)]">Targeting</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Optional targeting narrows delivery using member-declared interests and broad location text. It does not read private mail, chat, or post content.
        </p>
        <input
          className="form-field mt-4"
          onChange={(event) => setTargetLocation(event.target.value)}
          placeholder="Location text, optional"
          value={targetLocation}
        />
        <div className="mt-4">
          <span className="form-label">Interest categories</span>
          <div className="mt-3 flex flex-wrap gap-2">
            {interestCategoryOptions.map((option) => {
              const active = targetInterestCategories.includes(option.value);

              return (
                <button
                  className={`interest-chip ${active ? "is-active" : ""}`}
                  key={option.value}
                  onClick={() => toggleInterest(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            Leave blank for broad delivery. Choose up to 6 categories for interest-targeted placement.
          </p>
        </div>
        {adsManager.destinationOptions.writerManuscripts.length > 0 ? (
          <label className="mt-4 grid gap-2">
            <span className="form-label">Subscriber audience</span>
            <select
              className="form-field"
              onChange={(event) => setSubscriberTargetManuscriptId(event.target.value)}
              value={subscriberTargetManuscriptId}
            >
              <option value="">No subscriber audience</option>
              {adsManager.destinationOptions.writerManuscripts.map((manuscript) => (
                <option key={manuscript.id} value={manuscript.id}>
                  {manuscript.label} ({manuscript.subscriberCount} subscribers)
                </option>
              ))}
            </select>
            <small className="text-[var(--muted)]">Choose a manuscript to limit delivery to members subscribed to that manuscript.</small>
          </label>
        ) : null}
      </section>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <Link className="btn-secondary" href="/ads">
          Cancel
        </Link>
        <button
          className="btn-primary"
          disabled={
            isPending ||
            title.trim().length < 2 ||
            body.trim().length < 8 ||
            (!image && !externalImageUrl.trim()) ||
            !hasDestination ||
            !selectedPricingPackage ||
            !canAffordBudget ||
            campaignCredits < 1 ||
            campaignDurationDays < 1
          }
          type="submit"
        >
          {isPending ? "Creating..." : "Create campaign"}
        </button>
      </div>
    </form>
  );
}
