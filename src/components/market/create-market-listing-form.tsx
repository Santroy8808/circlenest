"use client";

import { MarketListingCategory } from "@prisma/client";
import Link from "next/link";
import { useRef, useState } from "react";
import { CityLocationAutocomplete } from "@/components/location/city-location-autocomplete";
import { CarouselGuidance } from "@/components/media/carousel-guidance";
import { MarkdownRichTextEditor } from "@/components/rich-text/markdown-rich-text-editor";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import { marketCategoryOptions, type MarketCreateState, type MarketListingDetailView } from "@/modules/market/types";

type UploadItem = {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  mediaAssetId?: string;
  error?: string;
};

function parsePriceCents(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const amount = Number(clean);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function CreateMarketListingForm({
  createState,
  initialListing,
  mode = "create"
}: {
  createState: MarketCreateState;
  initialListing?: MarketListingDetailView;
  mode?: "create" | "edit";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const existingPhotoCount = initialListing?.photos.length ?? 0;
  const [title, setTitle] = useState(initialListing?.title ?? "");
  const [description, setDescription] = useState(initialListing?.description ?? "");
  const [category, setCategory] = useState<MarketListingCategory>(initialListing?.category ?? marketCategoryOptions[0]?.value ?? MarketListingCategory.OTHER);
  const [location, setLocation] = useState(initialListing?.location ?? "");
  const [price, setPrice] = useState(initialListing?.priceCents ? (initialListing.priceCents / 100).toFixed(2) : "");
  const [contactEmail, setContactEmail] = useState(initialListing?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(initialListing?.contactPhone ?? "");
  const [contactNotes, setContactNotes] = useState(initialListing?.contactNotes ?? "");
  const [allowMessages, setAllowMessages] = useState(initialListing?.allowMessages ?? true);
  const [carouselEnabled, setCarouselEnabled] = useState(initialListing?.carouselEnabled ?? false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [error, setError] = useState(createState.viewerCanCreate ? "" : createState.reason ?? "This tier cannot create Market listings.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function addFiles(files: FileList | File[]) {
    const remaining = Math.max(0, createState.photoCap - existingPhotoCount - items.length);
    const candidates = Array.from(files);
    const validFiles = candidates.filter(
      (file) => /^image\/(jpeg|png|webp)$/.test(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024
    );
    if (validFiles.length !== candidates.length) {
      setError("Listing photos must be JPG, PNG, or WEBP files no larger than 10MB.");
    }

    const next = validFiles
      .slice(0, remaining)
      .map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: "queued" as const
      }));

    setItems((current) => [...current, ...next]);
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function uploadPhotos() {
    const uploadedIds: string[] = [];

    for (const item of items) {
      if (item.mediaAssetId) {
        uploadedIds.push(item.mediaAssetId);
        continue;
      }

      updateItem(item.id, { status: "uploading", progress: 1 });
      const intentResponse = await fetch("/api/market/photos/upload-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: item.file.name,
          mimeType: item.file.type,
          sizeBytes: item.file.size
        })
      });
      const intent = (await intentResponse.json()) as {
        error?: string;
        intentId?: string;
        uploadUrl?: string;
        uploadHeaders?: Record<string, string>;
        storageKey?: string;
      };

      if (!intentResponse.ok || !intent.intentId || !intent.uploadUrl || !intent.uploadHeaders || !intent.storageKey) {
        throw new Error(intent.error ?? "Could not prepare photo upload.");
      }

      await uploadWithResilientFallback({
        uploadUrl: intent.uploadUrl,
        storageKey: intent.storageKey,
        uploadHeaders: intent.uploadHeaders,
        file: item.file,
        onProgress: (progress) => updateItem(item.id, { progress })
      });

      const completeResponse = await fetch("/api/market/photos/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentId: intent.intentId,
          storageKey: intent.storageKey,
          fileName: item.file.name,
          mimeType: item.file.type,
          sizeBytes: item.file.size
        })
      });
      const complete = (await completeResponse.json()) as { error?: string; asset?: { id: string } };

      if (!completeResponse.ok || !complete.asset?.id) {
        throw new Error(complete.error ?? "Could not save listing photo.");
      }

      updateItem(item.id, { status: "done", progress: 100, mediaAssetId: complete.asset.id });
      uploadedIds.push(complete.asset.id);
    }

    return uploadedIds;
  }

  async function submitListing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const photoMediaAssetIds = await uploadPhotos();
      const response = await fetch(mode === "edit" && initialListing ? `/api/market/${initialListing.slug}` : "/api/market", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          category,
          location,
          contactEmail,
          contactPhone,
          contactNotes,
          allowMessages,
          carouselEnabled,
          priceCents: parsePriceCents(price),
          photoMediaAssetIds
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; listing?: { slug: string } };

      if (!response.ok || !payload.listing) {
        throw new Error(payload.error ?? `Could not create listing (HTTP ${response.status}).`);
      }

      window.location.href = `/market/${payload.listing.slug}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create listing.");
      setIsSubmitting(false);
    }
  }

  if (!createState.viewerCanCreate) {
    return (
      <section className="surface rounded-md p-8 text-center">
        <h1 className="text-3xl font-semibold text-[var(--gold)]">Create Listing</h1>
        <p className="mt-3 text-[var(--muted)]">{error}</p>
        <Link className="btn-secondary mt-5 inline-block" href="/market">
          Browse The Market
        </Link>
      </section>
    );
  }

  return (
    <form className="surface market-listing-form grid gap-4 rounded-md p-5" onSubmit={submitListing}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">The Market</p>
        <h1 className="mt-2 text-3xl font-semibold">{mode === "edit" ? "Edit listing" : "Create a listing"}</h1>
        <p className="mt-2 max-w-3xl leading-6 text-[var(--muted)]">
          Add clear details, photos, and seller contact options. Buyers can message you inside Theta-Space or use the contact info you choose to show.
        </p>
        {createState.listingLimit !== null ? (
          <p className="mt-3 text-sm text-[var(--gold)]">
            {createState.listingLimitKind === "active"
              ? `${createState.listingsRemaining} of ${createState.listingLimit} active listing slots available.`
              : `${createState.listingsRemaining} of ${createState.listingLimit} listings left this 14-day period.`}
          </p>
        ) : null}
      </div>

      <div className="market-listing-fields grid gap-3 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Title</span>
          <input className="form-field" onChange={(event) => setTitle(event.target.value)} value={title} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Price</span>
          <input className="form-field" inputMode="decimal" onChange={(event) => setPrice(event.target.value)} placeholder="25.00" value={price} />
        </label>
      </div>

      <div className="market-listing-fields grid gap-3 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Category</span>
          <select className="form-field" onChange={(event) => setCategory(event.target.value as MarketListingCategory)} value={category}>
            {marketCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <CityLocationAutocomplete
          helperText="Use the city for pickup/service area. Do not enter a street address."
          label="City"
          onChange={setLocation}
          placeholder="Start typing a city..."
          value={location}
        />
      </div>

      <div className="market-listing-fields grid gap-3 md:grid-cols-3">
        <label className="grid gap-2">
          <span className="form-label">Seller email</span>
          <input className="form-field" onChange={(event) => setContactEmail(event.target.value)} placeholder="Optional public email" type="email" value={contactEmail} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Seller phone</span>
          <input className="form-field" onChange={(event) => setContactPhone(event.target.value)} placeholder="Optional public phone" value={contactPhone} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Contact note</span>
          <input className="form-field" onChange={(event) => setContactNotes(event.target.value)} placeholder="Best times, shipping, pickup..." value={contactNotes} />
        </label>
      </div>

      <label className="market-message-toggle">
        <input checked={allowMessages} onChange={(event) => setAllowMessages(event.target.checked)} type="checkbox" />
        <span>Allow buyers to send me a Theta-Space message about this listing.</span>
      </label>

      <div className="grid gap-2">
        <span className="form-label">Description</span>
        <MarkdownRichTextEditor
          disabled={isSubmitting}
          onChange={setDescription}
          placeholder="Condition, details, pickup/shipping notes, and anything the buyer should know."
          value={description}
        />
      </div>

      <section className="market-photo-panel rounded-md border border-[var(--line)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--gold)]">Photos</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Up to {createState.photoCap} photos. {mode === "edit" ? `${existingPhotoCount} already attached; new photos append.` : "First photo becomes the thumbnail."}
            </p>
          </div>
          <button className="btn-secondary" disabled={existingPhotoCount + items.length >= createState.photoCap} onClick={() => inputRef.current?.click()} type="button">
            Choose photos
          </button>
          <input
            ref={inputRef}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            multiple
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
            }}
            type="file"
          />
        </div>

        <CarouselGuidance
          firstImageText="It becomes the Market thumbnail and is the first carousel image visitors see."
          imageCount={existingPhotoCount + items.length}
          maxImages={createState.photoCap}
          orderText="Photos appear in the order you add them. New photos added while editing go at the end."
          title="Plan your listing photos"
        />

        {existingPhotoCount + items.length > 1 ? (
          <label className="market-message-toggle mt-4">
            <input checked={carouselEnabled} onChange={(event) => setCarouselEnabled(event.target.checked)} type="checkbox" />
            <span>Display these photos as an automatically advancing carousel. Visitors can also use the left and right controls.</span>
          </label>
        ) : null}

        {items.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {items.map((item) => (
              <article className="upload-item" key={item.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={item.previewUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.file.name}</p>
                  <div
                    aria-label={`${item.file.name} upload progress`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={item.progress}
                    className="mt-2 h-2 overflow-hidden rounded-full bg-black/30"
                    role="progressbar"
                  >
                    <div className="h-full rounded-full bg-[var(--blue)]" style={{ width: `${item.progress}%` }} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <Link className="btn-secondary" href={mode === "edit" && initialListing ? `/market/${initialListing.slug}` : "/market"}>
          Cancel
        </Link>
        <button className="btn-primary" disabled={isSubmitting || title.trim().length < 2 || description.trim().length < 5} type="submit">
          {isSubmitting ? (mode === "edit" ? "Saving..." : "Creating...") : mode === "edit" ? "Save listing" : "Create listing"}
        </button>
      </div>
    </form>
  );
}
