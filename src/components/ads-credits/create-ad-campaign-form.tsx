"use client";

import { AdDestinationKind, AdPlacement, InterestCategory, MediaVisibility } from "@prisma/client";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
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

type WizardStepKey = "heading" | "text" | "image" | "destination" | "audience" | "budget" | "preview";

const MAX_AD_IMAGE_BYTES = 10 * 1024 * 1024;
const AD_IMAGE_GUIDANCE = "Recommended: 1200 x 675px, minimum 600 x 338px. JPG, PNG, GIF, or WEBP up to 10MB.";
const CREDIT_BUDGET_PRESETS = [10, 25, 50, 100, 250, 500];
const CAMPAIGN_DURATION_PRESETS = [1, 3, 7, 14, 30, 60, 90];

const wizardSteps: Array<{ key: WizardStepKey; label: string; title: string; helper: string }> = [
  {
    key: "heading",
    label: "Heading",
    title: "Write the headline",
    helper: "This is the first line people scan. Keep it direct and specific."
  },
  {
    key: "text",
    label: "Ad Text",
    title: "Write the message",
    helper: "Say what the viewer gets and why they should click."
  },
  {
    key: "image",
    label: "Upload Image",
    title: "Choose the ad image",
    helper: "Use a clear image that still reads well when shown as a compact ad card."
  },
  {
    key: "destination",
    label: "Click Target",
    title: "Choose where the ad opens",
    helper: "The ad should only land on your storefront, your content, your listing, or a trusted URL."
  },
  {
    key: "audience",
    label: "Audience",
    title: "Choose the target audience",
    helper: "Leave targeting broad, or narrow delivery by location, interests, and subscriber group."
  },
  {
    key: "budget",
    label: "Budget",
    title: "Set credits and campaign length",
    helper: "Credits determine how much ad time this campaign receives during the scheduled run."
  },
  {
    key: "preview",
    label: "Preview",
    title: "Review and publish",
    helper: "Check the rendered ad, jump back to edit anything, then publish when all requirements are met."
  }
];

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
      visibility: MediaVisibility.PUBLIC,
      source: "AD_CREATIVE"
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
      source: "AD_CREATIVE",
      tags: ["Ad Images", "Ad Creative"]
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

function variantCampaignTitle(label: "A" | "B", value: string) {
  return `[${label}] ${value.trim()}`.slice(0, 120).trim();
}

export function CreateAdCampaignForm({
  adsManager,
  cancelHref = "/ads",
  initialDraft,
  successHref = "/ads"
}: {
  adsManager: AdsManagerView;
  cancelHref?: string;
  initialDraft?: InitialAdCampaignDraft;
  successHref?: string;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [hasVisitedPreview, setHasVisitedPreview] = useState(false);
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [destinationKind, setDestinationKind] = useState<AdDestinationKind>(() => initialDestinationKind(adsManager, initialDraft));
  const [marketListingId, setMarketListingId] = useState(initialDraft?.marketListingId ?? adsManager.destinationOptions.marketListings[0]?.id ?? "");
  const [businessArticleId, setBusinessArticleId] = useState(initialDraft?.businessArticleId ?? adsManager.destinationOptions.businessArticles[0]?.id ?? "");
  const [customDestinationUrl, setCustomDestinationUrl] = useState(initialDraft?.customDestinationUrl ?? "");
  const [subscriberTargetManuscriptId, setSubscriberTargetManuscriptId] = useState(initialDraft?.subscriberTargetManuscriptId ?? "");
  const initialPricingPackage =
    adsManager.pricingPackages.find((pricingPackage) => pricingPackage.placement === AdPlacement.RIGHT_STREAM) ?? adsManager.pricingPackages[0];
  const [placement, setPlacement] = useState<AdPlacement>(initialPricingPackage?.placement ?? AdPlacement.RIGHT_STREAM);
  const [pricingRuleKey, setPricingRuleKey] = useState(initialPricingPackage?.key ?? "");
  const [campaignCredits, setCampaignCredits] = useState(() => packageCreditCost(initialPricingPackage, adsManager.fundraiserOnly));
  const [campaignDurationDays, setCampaignDurationDays] = useState(() => packageDurationDays(initialPricingPackage));
  const [targetLocation, setTargetLocation] = useState("");
  const [targetInterestCategories, setTargetInterestCategories] = useState<InterestCategory[]>(initialDraft?.targetInterestCategories ?? []);
  const [image, setImage] = useState<AdImageAttachment | null>(null);
  const [externalImageUrl, setExternalImageUrl] = useState("");
  const [abTestingEnabled, setAbTestingEnabled] = useState(false);
  const [variantBTitle, setVariantBTitle] = useState("");
  const [variantBBody, setVariantBBody] = useState("");
  const [variantBExternalImageUrl, setVariantBExternalImageUrl] = useState("");
  const [error, setError] = useState(adsManager.canCreate ? "" : adsManager.reason ?? "This account cannot create ads.");
  const [isPending, startTransition] = useTransition();
  const currentStep = wizardSteps[stepIndex] ?? wizardSteps[0];
  const placementPackages = useMemo(
    () => adsManager.pricingPackages.filter((pricingPackage) => pricingPackage.placement === placement),
    [adsManager.pricingPackages, placement]
  );
  const selectedPricingPackage = placementPackages.find((pricingPackage) => pricingPackage.key === pricingRuleKey) ?? placementPackages[0];
  const selectedPackageCreditCost = packageCreditCost(selectedPricingPackage, adsManager.fundraiserOnly);
  const campaignDailyWeight = campaignDurationDays > 0 ? campaignCredits / campaignDurationDays : 0;
  const canAffordBudget = selectedPricingPackage ? adsManager.platformCredits >= campaignCredits : false;
  const placementLabel = adPlacementOptions.find((option) => option.value === placement)?.label ?? "Ad placement";
  const previewImageUrl = image?.previewUrl ?? externalImageUrl.trim();
  const previewTitle = title.trim() || "Your ad headline";
  const previewBody = body.trim() || "Your ad text will appear here.";
  const previewDestinationLabel =
    destinationKind === AdDestinationKind.STOREFRONT
      ? adsManager.destinationOptions.storefronts[0]?.label ?? "Storefront"
      : destinationKind === AdDestinationKind.MARKET_LISTING
        ? adsManager.destinationOptions.marketListings.find((listing) => listing.id === marketListingId)?.label ?? "Market listing"
        : destinationKind === AdDestinationKind.BUSINESS_ARTICLE
          ? adsManager.destinationOptions.businessArticles.find((article) => article.id === businessArticleId)?.label ?? "Storefront article"
          : customDestinationUrl.trim() || "Custom URL";

  const hasDestination =
    (destinationKind === AdDestinationKind.STOREFRONT && adsManager.destinationOptions.storefronts.length > 0) ||
    (destinationKind === AdDestinationKind.MARKET_LISTING && marketListingId.length > 0) ||
    (destinationKind === AdDestinationKind.BUSINESS_ARTICLE && businessArticleId.length > 0) ||
    (destinationKind === AdDestinationKind.EXTERNAL_URL && customDestinationUrl.trim().length > 0);

  const publishBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (title.trim().length < 2) blockers.push("Add a headline.");
    if (body.trim().length < 8) blockers.push("Write at least 8 characters of ad text.");
    if (!image && !externalImageUrl.trim()) blockers.push("Upload an ad image or enter an image URL.");
    if (!hasDestination) blockers.push("Choose a valid click target.");
    if (!selectedPricingPackage) blockers.push("Choose an active ad package.");
    if (campaignCredits < 1 || campaignCredits > 100000) blockers.push("Choose a credit budget between 1 and 100,000 credits.");
    if (campaignDurationDays < 1 || campaignDurationDays > 365) blockers.push("Choose a campaign length between 1 and 365 days.");
    if (abTestingEnabled && campaignCredits < 2) blockers.push("A/B testing needs at least 2 credits.");
    if (abTestingEnabled && (variantBTitle.trim().length < 2 || variantBBody.trim().length < 8)) {
      blockers.push("Complete Variant B headline and ad text.");
    }
    if (!canAffordBudget) blockers.push("You do not have enough platform credits for this budget.");
    return blockers;
  }, [
    abTestingEnabled,
    body,
    campaignCredits,
    campaignDurationDays,
    canAffordBudget,
    externalImageUrl,
    hasDestination,
    image,
    selectedPricingPackage,
    title,
    variantBBody,
    variantBTitle
  ]);

  function stepNote(stepKey: WizardStepKey) {
    if (stepKey === "heading" && title.trim().length < 2) return "Needed before publishing: a clear headline.";
    if (stepKey === "text" && body.trim().length < 8) return "Needed before publishing: a short ad message.";
    if (stepKey === "image" && !image && !externalImageUrl.trim()) return "Needed before publishing: an uploaded image or image URL.";
    if (stepKey === "destination" && !hasDestination) return "Needed before publishing: a valid click target.";
    if (stepKey === "budget" && !canAffordBudget) return "Needed before publishing: a budget covered by your available credits.";
    if (stepKey === "budget" && !selectedPricingPackage) return "Needed before publishing: an active package.";
    return "";
  }

  function goToStep(stepKey: WizardStepKey) {
    const nextIndex = wizardSteps.findIndex((step) => step.key === stepKey);
    if (nextIndex < 0) return;
    setError("");
    setStepIndex(nextIndex);
    if (stepKey === "preview") setHasVisitedPreview(true);
  }

  function goNext() {
    const nextIndex = Math.min(stepIndex + 1, wizardSteps.length - 1);
    setError("");
    setStepIndex(nextIndex);
    if (wizardSteps[nextIndex]?.key === "preview") setHasVisitedPreview(true);
  }

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

  function enableAbTesting() {
    setAbTestingEnabled(true);
    setVariantBTitle((current) => current || title);
    setVariantBBody((current) => current || body);
    setVariantBExternalImageUrl((current) => current || externalImageUrl);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasVisitedPreview(true);
    setStepIndex(wizardSteps.findIndex((step) => step.key === "preview"));
    setError("");

    if (publishBlockers.length > 0) {
      setError(publishBlockers[0] ?? "Complete the ad before publishing.");
      return;
    }

    startTransition(async () => {
      try {
        const imageMediaAssetId = image ? await uploadAdImage(image, patchImage) : "";
        const primaryBudgetCredits = abTestingEnabled ? Math.ceil(campaignCredits / 2) : campaignCredits;
        const secondaryBudgetCredits = campaignCredits - primaryBudgetCredits;
        const sharedPayload = {
          destinationKind,
          marketListingId: destinationKind === AdDestinationKind.MARKET_LISTING ? marketListingId : "",
          businessArticleId: destinationKind === AdDestinationKind.BUSINESS_ARTICLE ? businessArticleId : "",
          customDestinationUrl: destinationKind === AdDestinationKind.EXTERNAL_URL ? customDestinationUrl : "",
          subscriberTargetManuscriptId,
          placement,
          pricingRuleKey: selectedPricingPackage?.key,
          targetLocation,
          targetInterestCategories,
          campaignDurationDays
        };

        async function createCampaign(payload: Record<string, unknown>) {
          const response = await fetch("/api/ads/campaigns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const created = (await response.json()) as { error?: string; campaign?: AdCampaignCardView };

          if (!response.ok || !created.campaign) {
            throw new Error(created.error ?? "Could not create ad campaign.");
          }

          return created.campaign;
        }

        await createCampaign({
          ...sharedPayload,
          title: abTestingEnabled ? variantCampaignTitle("A", title) : title,
          body,
          imageMediaAssetId,
          externalImageUrl: imageMediaAssetId ? "" : externalImageUrl,
          totalBudgetCredits: primaryBudgetCredits
        });

        if (abTestingEnabled) {
          await createCampaign({
            ...sharedPayload,
            title: variantCampaignTitle("B", variantBTitle),
            body: variantBBody,
            imageMediaAssetId: variantBExternalImageUrl.trim() ? "" : imageMediaAssetId,
            externalImageUrl: variantBExternalImageUrl.trim() || (imageMediaAssetId ? "" : externalImageUrl),
            totalBudgetCredits: secondaryBudgetCredits
          });
        }

        window.location.href = successHref;
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

  const note = stepNote(currentStep.key);

  return (
    <form className="surface ad-wizard rounded-md" onSubmit={submit}>
      <div className="ad-wizard-header">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Ads Credits</p>
          <h1 className="mt-2 text-3xl font-semibold">Create an ad</h1>
        </div>
        <div className="ad-wizard-credit-pill">
          <span>Credits available</span>
          <strong>{adsManager.platformCredits.toLocaleString()}</strong>
        </div>
      </div>

      <nav className="ad-wizard-steps" aria-label="Ad creation steps">
        {wizardSteps.map((step, index) => (
          <button
            className={index === stepIndex ? "ad-wizard-step is-active" : "ad-wizard-step"}
            key={step.key}
            onClick={() => goToStep(step.key)}
            type="button"
          >
            <span>{index + 1}</span>
            <strong>{step.label}</strong>
          </button>
        ))}
      </nav>

      <section className="ad-wizard-page">
        <div className="ad-wizard-page-heading">
          <div>
            <h2>{currentStep.title}</h2>
            <p>{currentStep.helper}</p>
          </div>
          {note ? <small>{note}</small> : null}
        </div>

        {currentStep.key === "heading" ? (
          <div className="ad-wizard-two-column">
            <label className="grid gap-2">
              <span className="form-label">Heading</span>
              <input
                autoFocus
                className="form-field ad-wizard-large-input"
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Example: Course supply kits ready now"
                value={title}
              />
              <small className="text-[var(--muted)]">{Math.max(0, 120 - title.length)} characters left.</small>
            </label>
            <div className="ad-wizard-tip">
              <strong>Good headline pattern</strong>
              <span>Product or service + clear outcome. Avoid vague titles like &quot;Check this out&quot;.</span>
            </div>
          </div>
        ) : null}

        {currentStep.key === "text" ? (
          <div className="ad-wizard-two-column">
            <label className="grid gap-2">
              <span className="form-label">Ad text</span>
              <textarea
                className="form-field ad-wizard-textarea"
                maxLength={280}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Tell people what you are promoting and why it matters."
                value={body}
              />
              <small className="text-[var(--muted)]">{Math.max(0, 280 - body.length)} characters left.</small>
            </label>
            <div className="ad-wizard-ab-panel">
              <div>
                <strong>A/B Testing</strong>
                <span>Optional. Split the budget between two text/image variants.</span>
              </div>
              <button className="btn-secondary" onClick={enableAbTesting} type="button">
                {abTestingEnabled ? "Enabled" : "Enable"}
              </button>
              {abTestingEnabled ? (
                <div className="ad-wizard-ab-fields">
                  <p>Change only one major thing on Variant B so the comparison is useful.</p>
                  <input className="form-field" onChange={(event) => setVariantBTitle(event.target.value)} placeholder="Variant B heading" value={variantBTitle} />
                  <input className="form-field" onChange={(event) => setVariantBBody(event.target.value)} placeholder="Variant B text" value={variantBBody} />
                  <input
                    className="form-field"
                    onChange={(event) => setVariantBExternalImageUrl(event.target.value)}
                    placeholder="Variant B image URL, optional"
                    value={variantBExternalImageUrl}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {currentStep.key === "image" ? (
          <div className="ad-wizard-two-column">
            <input
              accept="image/*"
              className="sr-only"
              onChange={(event) => updateImage(event.target.files?.[0])}
              ref={imageInputRef}
              type="file"
            />
            <div className="ad-wizard-image-control">
              <span className="form-label">Ad image</span>
              <p>{AD_IMAGE_GUIDANCE}</p>
              <button className="btn-primary" onClick={() => imageInputRef.current?.click()} type="button">
                {image ? "Change" : "Upload"}
              </button>
              <label className="grid gap-2">
                <span className="form-label">Image URL fallback</span>
                <input
                  className="form-field"
                  onChange={(event) => setExternalImageUrl(event.target.value)}
                  placeholder="https://example.com/ad-image.jpg"
                  value={externalImageUrl}
                />
              </label>
            </div>
            <div className="ad-wizard-image-preview">
              {previewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="Selected ad creative preview" src={previewImageUrl} />
              ) : (
                <span>Image preview</span>
              )}
              {image ? (
                <div>
                  <strong>{image.file.name}</strong>
                  <small>{Math.max(1, Math.round(image.file.size / 1024))} KB</small>
                  {image.status === "uploading" ? (
                    <div className="feed-upload-meter">
                      <span style={{ width: `${image.progress}%` }} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {currentStep.key === "destination" ? (
          <div className="ad-wizard-destination">
            <div className="ad-wizard-choice-grid">
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
                <span>Listing</span>
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
                <span>URL</span>
                <small>External site or owned internal page</small>
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
                    : "Internal Theta-Space destinations must belong to you."}
                </small>
              </label>
            ) : null}
          </div>
        ) : null}

        {currentStep.key === "audience" ? (
          <div className="ad-wizard-two-column">
            <label className="grid gap-2">
              <span className="form-label">Location</span>
              <input
                className="form-field"
                onChange={(event) => setTargetLocation(event.target.value)}
                placeholder="Optional city, state, region, or leave blank"
                value={targetLocation}
              />
              <small className="text-[var(--muted)]">Location is broad text targeting. Leave it blank for wider delivery.</small>
            </label>
            <div>
              <span className="form-label">Interest categories</span>
              <div className="ad-wizard-interest-grid">
                {interestCategoryOptions.map((option) => {
                  const active = targetInterestCategories.includes(option.value);

                  return (
                    <button className={`interest-chip ${active ? "is-active" : ""}`} key={option.value} onClick={() => toggleInterest(option.value)} type="button">
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Choose up to 6 categories, or leave blank for broad delivery.</p>
            </div>
            {adsManager.destinationOptions.writerManuscripts.length > 0 ? (
              <label className="ad-wizard-span grid gap-2">
                <span className="form-label">Subscriber audience</span>
                <select className="form-field" onChange={(event) => setSubscriberTargetManuscriptId(event.target.value)} value={subscriberTargetManuscriptId}>
                  <option value="">No subscriber audience</option>
                  {adsManager.destinationOptions.writerManuscripts.map((manuscript) => (
                    <option key={manuscript.id} value={manuscript.id}>
                      {manuscript.label} ({manuscript.subscriberCount} subscribers)
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        {currentStep.key === "budget" ? (
          <div className="ad-wizard-budget-grid">
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
              <span className="form-label">Preset</span>
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
            </label>
            <label className="grid gap-2">
              <span className="form-label">Credits</span>
              <input
                className="form-field"
                max={100000}
                min={1}
                onChange={(event) => setCampaignCredits(Math.max(1, Math.min(100000, Number(event.target.value) || 1)))}
                type="number"
                value={campaignCredits}
              />
              <div className="ad-wizard-chip-row">
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
              <span className="form-label">Length</span>
              <input
                className="form-field"
                max={365}
                min={1}
                onChange={(event) => setCampaignDurationDays(Math.max(1, Math.min(365, Number(event.target.value) || 1)))}
                type="number"
                value={campaignDurationDays}
              />
              <div className="ad-wizard-chip-row">
                {CAMPAIGN_DURATION_PRESETS.map((days) => (
                  <button className={`interest-chip ${campaignDurationDays === days ? "is-active" : ""}`} key={days} onClick={() => setCampaignDurationDays(days)} type="button">
                    {durationLabel(days)}
                  </button>
                ))}
              </div>
            </label>
            <div className="ad-cost-estimate ad-wizard-span">
              <span>Campaign budget</span>
              <strong>{selectedPricingPackage ? `${campaignCredits.toLocaleString()} credits` : "No package"}</strong>
              <small>
                {selectedPricingPackage
                  ? `${durationLabel(campaignDurationDays)} | ${campaignDailyWeight.toFixed(1)} credits/day weight | preset ${selectedPackageCreditCost} credits`
                  : "Ask an admin to activate a package."}
              </small>
            </div>
          </div>
        ) : null}

        {currentStep.key === "preview" ? (
          <div className="ad-wizard-preview-grid">
            <div className="ad-render-preview ad-wizard-preview">
              <div className="ad-render-preview-heading">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Ad Preview</p>
                  <h2 className="mt-2 text-xl font-semibold">Rendered campaign</h2>
                </div>
                <div className="ad-render-preview-meta">
                  <span>{placementLabel}</span>
                  <strong>{campaignCredits.toLocaleString()} credits</strong>
                  <small>{durationLabel(campaignDurationDays)}</small>
                </div>
              </div>
              <div className="ad-render-stage">
                <div className="ad-render-context">
                  <span className="form-label">Destination</span>
                  <strong>{previewDestinationLabel}</strong>
                  <small>
                    {selectedPricingPackage
                      ? `${campaignDailyWeight.toFixed(1)} credits/day weight | ${targetInterestCategories.length} interest filter${targetInterestCategories.length === 1 ? "" : "s"}`
                      : "Choose an active ad package"}
                  </small>
                </div>
                <article className="ad-placement-card ad-render-card">
                  {previewImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="Ad preview creative" className="ad-placement-image" src={previewImageUrl} />
                  ) : (
                    <div className="ad-render-image-placeholder">
                      <span>Creative</span>
                    </div>
                  )}
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Sponsored</span>
                  <strong className="mt-2 block">{previewTitle}</strong>
                  <span className="mt-2 block text-sm leading-6 text-[var(--muted)]">{previewBody}</span>
                  <span className="ad-rotation-meta">
                    {selectedPricingPackage ? `Preview render | ${campaignCredits.toLocaleString()} credits queued` : "Package needed"}
                  </span>
                </article>
              </div>
            </div>
            <aside className="ad-wizard-review-panel">
              <h3>Review</h3>
              <div className="ad-wizard-edit-grid">
                {wizardSteps.filter((step) => step.key !== "preview").map((step) => (
                  <button key={step.key} onClick={() => goToStep(step.key)} type="button">
                    <span>{step.label}</span>
                    <strong>Edit</strong>
                  </button>
                ))}
              </div>
              {publishBlockers.length > 0 ? (
                <div className="ad-wizard-blockers">
                  <strong>Cannot publish yet</strong>
                  <ul>
                    {publishBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="ad-wizard-ready">
                  <strong>Ready to publish</strong>
                  <span>The campaign can be submitted now.</span>
                </div>
              )}
            </aside>
          </div>
        ) : null}
      </section>

      {error ? <p className="ad-wizard-error">{error}</p> : null}

      <div className="ad-wizard-footer">
        <Link className="btn-secondary" href={cancelHref}>
          Cancel
        </Link>
        <div className="ad-wizard-footer-actions">
          <button className="btn-secondary" disabled={stepIndex === 0 || isPending} onClick={() => setStepIndex((current) => Math.max(0, current - 1))} type="button">
            Back
          </button>
          {hasVisitedPreview && currentStep.key !== "preview" ? (
            <button className="btn-secondary" disabled={isPending} onClick={() => goToStep("preview")} type="button">
              Return to preview
            </button>
          ) : null}
          {currentStep.key === "preview" ? (
            <button className="btn-primary" disabled={isPending || publishBlockers.length > 0} type="submit">
              {isPending ? "Publishing..." : "Publish Ad"}
            </button>
          ) : (
            <button className="btn-primary" disabled={isPending} onClick={goNext} type="button">
              Next
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
