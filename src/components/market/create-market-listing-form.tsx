"use client";

import { MarketListingCategory } from "@prisma/client";
import Link from "next/link";
import { useRef, useState } from "react";
import { CityLocationAutocomplete } from "@/components/location/city-location-autocomplete";
import { CarouselGuidance } from "@/components/media/carousel-guidance";
import { ThetaLoading } from "@/components/platform/theta-loading";
import { MarkdownRichTextEditor } from "@/components/rich-text/markdown-rich-text-editor";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import { isMarketSellingCategory, marketCategoryOptions, type MarketCreateState, type MarketListingDetailView } from "@/modules/market/types";
import styles from "@/components/marketplace/marketplace.module.css";

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

function parseOptionalNumber(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const amount = Number(clean);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function CreateMarketListingForm({
  createState,
  initialListing,
  listingKind = "general",
  mode = "create"
}: {
  createState: MarketCreateState;
  initialListing?: MarketListingDetailView;
  listingKind?: "general" | "rental";
  mode?: "create" | "edit";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const existingPhotoCount = initialListing?.photos.length ?? 0;
  const initialCategory = initialListing?.category;
  const [title, setTitle] = useState(initialListing?.title ?? "");
  const [description, setDescription] = useState(initialListing?.description ?? "");
  const [category, setCategory] = useState<MarketListingCategory>(
    isMarketSellingCategory(initialCategory)
      ? initialCategory
      : (listingKind === "rental" ? MarketListingCategory.RENTALS : marketCategoryOptions[0]?.value) ?? MarketListingCategory.OTHER
  );
  const [location, setLocation] = useState(initialListing?.location ?? "");
  const [price, setPrice] = useState(initialListing?.priceCents ? (initialListing.priceCents / 100).toFixed(2) : "");
  const [rentalPropertyType, setRentalPropertyType] = useState(initialListing?.rentalPropertyType ?? "");
  const [rentalBedrooms, setRentalBedrooms] = useState(initialListing?.rentalBedrooms?.toString() ?? "");
  const [rentalBathrooms, setRentalBathrooms] = useState(initialListing?.rentalBathrooms?.toString() ?? "");
  const [rentalSquareFeet, setRentalSquareFeet] = useState(initialListing?.rentalSquareFeet?.toString() ?? "");
  const [rentalDeposit, setRentalDeposit] = useState(initialListing?.rentalDepositCents ? (initialListing.rentalDepositCents / 100).toFixed(2) : "");
  const [rentalAvailableAt, setRentalAvailableAt] = useState(initialListing?.rentalAvailableAt?.slice(0, 10) ?? "");
  const [rentalLeaseTerm, setRentalLeaseTerm] = useState(initialListing?.rentalLeaseTerm ?? "");
  const [rentalPetsAllowed, setRentalPetsAllowed] = useState<boolean | null>(initialListing?.rentalPetsAllowed ?? null);
  const [rentalFurnished, setRentalFurnished] = useState<boolean | null>(initialListing?.rentalFurnished ?? null);
  const [contactEmail, setContactEmail] = useState(initialListing?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(initialListing?.contactPhone ?? "");
  const [contactNotes, setContactNotes] = useState(initialListing?.contactNotes ?? "");
  const [allowMessages, setAllowMessages] = useState(initialListing?.allowMessages ?? true);
  const [carouselEnabled, setCarouselEnabled] = useState(initialListing?.carouselEnabled ?? false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isPhotoDropActive, setIsPhotoDropActive] = useState(false);
  const [error, setError] = useState(createState.viewerCanCreate ? "" : createState.reason ?? "This tier cannot create Market listings.");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRental = category === MarketListingCategory.RENTALS;
  const canAddPhotos = existingPhotoCount + items.length < createState.photoCap;

  function addFiles(files: FileList | File[]) {
    const remaining = Math.max(0, createState.photoCap - existingPhotoCount - items.length);
    const candidates = Array.from(files);
    if (remaining <= 0) {
      setError(`This listing already has the maximum of ${createState.photoCap} photos.`);
      return;
    }
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

  function handlePhotoDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsPhotoDropActive(false);
    if (!canAddPhotos) {
      setError(`This listing already has the maximum of ${createState.photoCap} photos.`);
      return;
    }
    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
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
          rentalPropertyType,
          rentalBedrooms: parseOptionalNumber(rentalBedrooms),
          rentalBathrooms: parseOptionalNumber(rentalBathrooms),
          rentalSquareFeet: parseOptionalNumber(rentalSquareFeet),
          rentalDepositCents: parsePriceCents(rentalDeposit),
          rentalAvailableAt: rentalAvailableAt ? new Date(`${rentalAvailableAt}T00:00:00`).toISOString() : "",
          rentalLeaseTerm,
          rentalPetsAllowed,
          rentalFurnished,
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
        <Link className={`${styles.secondaryButton} mt-5 inline-block`} href="/market">
          Browse The Market
        </Link>
      </section>
    );
  }

  return (
    <form className="surface market-listing-form grid gap-4 rounded-md p-5" onSubmit={submitListing}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">The Market</p>
        <h1 className="mt-2 text-3xl font-semibold">{mode === "edit" ? "Edit listing" : isRental ? "List a home or apartment for rent" : "Create a listing"}</h1>
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
          <span className="form-label">{isRental ? "Monthly rent" : "Price"}</span>
          <input className="form-field" inputMode="decimal" onChange={(event) => setPrice(event.target.value)} placeholder="25.00" value={price} />
        </label>
      </div>

      <div className="market-listing-fields grid gap-3 md:grid-cols-2">
        {listingKind === "rental" ? (
          <input name="category" type="hidden" value={MarketListingCategory.RENTALS} />
        ) : <label className="grid gap-2">
          <span className="form-label">Category</span>
          <select className="form-field" onChange={(event) => setCategory(event.target.value as MarketListingCategory)} value={category}>
            {marketCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>}
        <CityLocationAutocomplete
          helperText="Use the city for pickup/service area. Do not enter a street address."
          helperTextPlacement="label"
          label="City"
          onChange={setLocation}
          placeholder="Start typing a city..."
          value={location}
        />
      </div>

      {isRental ? (
        <section className="grid gap-4 rounded-md border border-[var(--line)] p-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--gold)]">Rental details</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Provide enough information for members to understand the property before contacting you.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-2">
              <span className="form-label">Property type</span>
              <select className="form-field" onChange={(event) => setRentalPropertyType(event.target.value)} required value={rentalPropertyType}>
                <option value="">Choose type</option>
                <option>House</option><option>Apartment</option><option>Condo</option><option>Townhome</option><option>Room</option><option>Guesthouse</option><option>Other</option>
              </select>
            </label>
            <label className="grid gap-2"><span className="form-label">Bedrooms</span><input className="form-field" min="0" onChange={(event) => setRentalBedrooms(event.target.value)} required step="1" type="number" value={rentalBedrooms} /></label>
            <label className="grid gap-2"><span className="form-label">Bathrooms</span><input className="form-field" min="0" onChange={(event) => setRentalBathrooms(event.target.value)} required step="0.5" type="number" value={rentalBathrooms} /></label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-2"><span className="form-label">Square feet</span><input className="form-field" min="0" onChange={(event) => setRentalSquareFeet(event.target.value)} step="1" type="number" value={rentalSquareFeet} /></label>
            <label className="grid gap-2"><span className="form-label">Security deposit</span><input className="form-field" inputMode="decimal" onChange={(event) => setRentalDeposit(event.target.value)} placeholder="1500.00" value={rentalDeposit} /></label>
            <label className="grid gap-2"><span className="form-label">Available date</span><input className="form-field" onChange={(event) => setRentalAvailableAt(event.target.value)} required type="date" value={rentalAvailableAt} /></label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-2"><span className="form-label">Lease term</span><input className="form-field" onChange={(event) => setRentalLeaseTerm(event.target.value)} placeholder="12 months, month-to-month..." value={rentalLeaseTerm} /></label>
            <label className="grid gap-2"><span className="form-label">Pets</span><select className="form-field" onChange={(event) => setRentalPetsAllowed(event.target.value === "" ? null : event.target.value === "yes")} value={rentalPetsAllowed === null ? "" : rentalPetsAllowed ? "yes" : "no"}><option value="">Not specified</option><option value="yes">Allowed</option><option value="no">Not allowed</option></select></label>
            <label className="grid gap-2"><span className="form-label">Furnished</span><select className="form-field" onChange={(event) => setRentalFurnished(event.target.value === "" ? null : event.target.value === "yes")} value={rentalFurnished === null ? "" : rentalFurnished ? "yes" : "no"}><option value="">Not specified</option><option value="yes">Furnished</option><option value="no">Unfurnished</option></select></label>
          </div>
        </section>
      ) : null}

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

      <section
        className={isPhotoDropActive ? "market-photo-panel is-drag-active rounded-md border border-[var(--line)] p-4" : "market-photo-panel rounded-md border border-[var(--line)] p-4"}
        onDragEnter={(event) => {
          event.preventDefault();
          if (canAddPhotos) setIsPhotoDropActive(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsPhotoDropActive(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (canAddPhotos) event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={handlePhotoDrop}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--gold)]">Photos</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Up to {createState.photoCap} photos. {mode === "edit" ? `${existingPhotoCount} already attached; new photos append.` : "First photo becomes the thumbnail."}
            </p>
          </div>
          <button className={styles.secondaryButton} disabled={existingPhotoCount + items.length >= createState.photoCap} onClick={() => inputRef.current?.click()} type="button">
            Choose photos
          </button>
          <input
            ref={inputRef}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            multiple
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = "";
            }}
            type="file"
          />
        </div>

        <button
          className="market-photo-dropzone mt-4"
          disabled={!canAddPhotos}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <strong>{canAddPhotos ? "Drag photos here" : "Photo limit reached"}</strong>
          <span>{canAddPhotos ? "or choose JPG, PNG, or WEBP files from your device." : `This listing has ${createState.photoCap} photos.`}</span>
        </button>

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
        <Link className={styles.secondaryButton} href={mode === "edit" && initialListing ? `/market/${initialListing.slug}` : "/market"}>
          Cancel
        </Link>
        <button className={styles.primaryButton} disabled={isSubmitting || title.trim().length < 2 || description.trim().length < 5} type="submit">
          {isSubmitting ? <ThetaLoading inline label={mode === "edit" ? "Saving" : "Creating"} size="sm" /> : mode === "edit" ? "Save listing" : "Create listing"}
        </button>
      </div>
    </form>
  );
}
