"use client";

import { AdDestinationKind, AdPlacement, InterestCategory, MediaVisibility } from "@prisma/client";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
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

const MAX_AD_IMAGE_BYTES = 10 * 1024 * 1024;
const AD_IMAGE_GUIDANCE = "Recommended: 1200 x 675px, minimum 600 x 338px. JPG, PNG, GIF, or WEBP up to 10MB.";

function uploadWithProgress(uploadUrl: string, file: File, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error("The image upload did not finish."));
      }
    });
    request.addEventListener("error", () => reject(new Error("The image upload could not reach storage.")));
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.send(file);
  });
}

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

  await uploadWithProgress(intent.uploadUrl, image.file, (progress) => onUpdate({ progress }));

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

function initialDestinationKind(adsManager: AdsManagerView) {
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

export function CreateAdCampaignForm({ adsManager }: { adsManager: AdsManagerView }) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [destinationKind, setDestinationKind] = useState<AdDestinationKind>(() => initialDestinationKind(adsManager));
  const [marketListingId, setMarketListingId] = useState(adsManager.destinationOptions.marketListings[0]?.id ?? "");
  const [businessArticleId, setBusinessArticleId] = useState(adsManager.destinationOptions.businessArticles[0]?.id ?? "");
  const [customDestinationUrl, setCustomDestinationUrl] = useState("");
  const initialPricingPackage = adsManager.pricingPackages.find((pricingPackage) => pricingPackage.placement === AdPlacement.RIGHT_STREAM) ?? adsManager.pricingPackages[0];
  const [placement, setPlacement] = useState<AdPlacement>(initialPricingPackage?.placement ?? AdPlacement.RIGHT_STREAM);
  const [pricingRuleKey, setPricingRuleKey] = useState(initialPricingPackage?.key ?? "");
  const [targetLocation, setTargetLocation] = useState("");
  const [targetInterestCategories, setTargetInterestCategories] = useState<InterestCategory[]>([]);
  const [image, setImage] = useState<AdImageAttachment | null>(null);
  const [externalImageUrl, setExternalImageUrl] = useState("");
  const [error, setError] = useState(adsManager.canCreate ? "" : adsManager.reason ?? "This account cannot create ads.");
  const [isPending, startTransition] = useTransition();
  const placementPackages = useMemo(
    () => adsManager.pricingPackages.filter((pricingPackage) => pricingPackage.placement === placement),
    [adsManager.pricingPackages, placement]
  );
  const selectedPricingPackage = placementPackages.find((pricingPackage) => pricingPackage.key === pricingRuleKey) ?? placementPackages[0];
  const canAffordPackage = selectedPricingPackage ? adsManager.platformCredits >= selectedPricingPackage.creditCost : false;

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
        if (!canAffordPackage) {
          setError("Not enough platform credits for this ad package.");
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
            placement,
            pricingRuleKey: selectedPricingPackage.key,
            targetLocation,
            targetInterestCategories,
            totalBudgetCredits: selectedPricingPackage.creditCost
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
        <p className="mt-3 text-sm text-[var(--gold)]">{adsManager.platformCredits} platform credits available.</p>
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
            disabled={adsManager.destinationOptions.storefronts.length === 0}
            onClick={() => setDestinationKind(AdDestinationKind.STOREFRONT)}
            type="button"
          >
            <span>Storefront</span>
            <small>{adsManager.destinationOptions.storefronts[0]?.label ?? "Publish a storefront first"}</small>
          </button>
          <button
            className={`destination-choice ${destinationKind === AdDestinationKind.MARKET_LISTING ? "is-active" : ""}`}
            disabled={adsManager.destinationOptions.marketListings.length === 0}
            onClick={() => setDestinationKind(AdDestinationKind.MARKET_LISTING)}
            type="button"
          >
            <span>Listing ad</span>
            <small>{adsManager.destinationOptions.marketListings.length} active listing(s)</small>
          </button>
          <button
            className={`destination-choice ${destinationKind === AdDestinationKind.BUSINESS_ARTICLE ? "is-active" : ""}`}
            disabled={adsManager.destinationOptions.businessArticles.length === 0}
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
            <small>Send clicks to a defined page</small>
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
              placeholder="https://example.com/page or /market/listing"
              value={customDestinationUrl}
            />
            <small className="text-[var(--muted)]">The ad image and card will redirect here when clicked.</small>
          </label>
        ) : null}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-2">
          <span className="form-label">Placement</span>
          <select
            className="form-field"
            onChange={(event) => {
              const nextPlacement = event.target.value as AdPlacement;
              const nextPackage = adsManager.pricingPackages.find((pricingPackage) => pricingPackage.placement === nextPlacement);
              setPlacement(nextPlacement);
              setPricingRuleKey(nextPackage?.key ?? "");
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
          <span className="form-label">Package</span>
          <select className="form-field" onChange={(event) => setPricingRuleKey(event.target.value)} value={selectedPricingPackage?.key ?? ""}>
            {placementPackages.map((pricingPackage) => (
              <option key={pricingPackage.key} value={pricingPackage.key}>
                {pricingPackage.label}
              </option>
            ))}
          </select>
        </label>
        <div className="ad-cost-estimate">
          <span>Estimated cost</span>
          <strong>{selectedPricingPackage ? `${selectedPricingPackage.creditCost} credits` : "No package"}</strong>
          <small>{selectedPricingPackage ? `${durationLabel(selectedPricingPackage.durationDays)} | ${selectedPricingPackage.unitLabel}` : "Ask an admin to activate a package."}</small>
        </div>
      </div>

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
      </section>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <Link className="btn-secondary" href="/ads">
          Cancel
        </Link>
        <button
          className="btn-primary"
          disabled={isPending || title.trim().length < 2 || body.trim().length < 8 || (!image && !externalImageUrl.trim()) || !hasDestination || !selectedPricingPackage || !canAffordPackage}
          type="submit"
        >
          {isPending ? "Creating..." : "Create campaign"}
        </button>
      </div>
    </form>
  );
}
