"use client";

import { MarketListingCategory } from "@prisma/client";
import Link from "next/link";
import { useRef, useState } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import { marketCategoryOptions, type MarketCreateState } from "@/modules/market/types";

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

export function CreateMarketListingForm({ createState }: { createState: MarketCreateState }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<MarketListingCategory>(marketCategoryOptions[0]?.value ?? MarketListingCategory.OTHER);
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [error, setError] = useState(createState.viewerCanCreate ? "" : createState.reason ?? "This tier cannot create Market listings.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function addFiles(files: FileList | File[]) {
    const remaining = Math.max(0, createState.photoCap - items.length);
    const next = Array.from(files)
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
      const intent = (await intentResponse.json()) as { error?: string; uploadUrl?: string; storageKey?: string };

      if (!intentResponse.ok || !intent.uploadUrl || !intent.storageKey) {
        throw new Error(intent.error ?? "Could not prepare photo upload.");
      }

      await uploadWithResilientFallback({
        uploadUrl: intent.uploadUrl,
        storageKey: intent.storageKey,
        file: item.file,
        onProgress: (progress) => updateItem(item.id, { progress })
      });

      const completeResponse = await fetch("/api/market/photos/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      const response = await fetch("/api/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          category,
          location,
          priceCents: parsePriceCents(price),
          photoMediaAssetIds
        })
      });
      const payload = (await response.json()) as { error?: string; listing?: { slug: string } };

      if (!response.ok || !payload.listing) {
        throw new Error(payload.error ?? "Could not create listing.");
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
    <form className="surface grid gap-5 rounded-md p-6" onSubmit={submitListing}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">The Market</p>
        <h1 className="mt-3 text-3xl font-semibold">Create a listing</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Listings browse as square thumbnails. Categories are fixed so search stays clean.
        </p>
        {createState.listingLimit !== null ? (
          <p className="mt-3 text-sm text-[var(--gold)]">
            {createState.listingsRemaining} of {createState.listingLimit} listings left this 14-day period.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Title</span>
          <input className="form-field" onChange={(event) => setTitle(event.target.value)} value={title} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Price</span>
          <input className="form-field" inputMode="decimal" onChange={(event) => setPrice(event.target.value)} placeholder="25.00" value={price} />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
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
        <label className="grid gap-2">
          <span className="form-label">Location</span>
          <input className="form-field" onChange={(event) => setLocation(event.target.value)} placeholder="Austin, TX / Online / Local pickup" value={location} />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="form-label">Description</span>
        <textarea
          className="form-field min-h-40 resize-y"
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Condition, details, pickup/shipping notes, and anything the buyer should know."
          value={description}
        />
      </label>

      <section className="rounded-md border border-[var(--line)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--gold)]">Photos</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Up to {createState.photoCap} photos. First photo becomes the thumbnail.</p>
          </div>
          <button className="btn-secondary" disabled={items.length >= createState.photoCap} onClick={() => inputRef.current?.click()} type="button">
            Choose photos
          </button>
          <input
            ref={inputRef}
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            multiple
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
            }}
            type="file"
          />
        </div>

        {items.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {items.map((item) => (
              <article className="upload-item" key={item.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={item.previewUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.file.name}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
                    <div className="h-full rounded-full bg-[var(--blue)]" style={{ width: `${item.progress}%` }} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <Link className="btn-secondary" href="/market">
          Cancel
        </Link>
        <button className="btn-primary" disabled={isSubmitting || title.trim().length < 2 || description.trim().length < 5} type="submit">
          {isSubmitting ? "Creating..." : "Create listing"}
        </button>
      </div>
    </form>
  );
}
