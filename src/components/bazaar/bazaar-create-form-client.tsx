"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadImageWithCompression } from "@/lib/media/image-upload.client";

type BazaarCreateFormClientProps = {
  canCreate: boolean;
  maxImages: number | null;
  listingLimitNote: string | null;
};

const BAZAAR_FIELD_CLASS =
  "w-full rounded-lg border border-[#52647f] bg-[#253145] px-3 py-2 font-sans text-sm leading-5 text-[#f3f6fb] shadow-inner shadow-black/10 placeholder:text-slate-400 focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/25 disabled:cursor-not-allowed disabled:bg-[#1b2435] disabled:text-slate-400";

type SelectedImage = {
  file: File;
  previewUrl: string;
};

export function BazaarCreateFormClient({ canCreate, maxImages, listingLimitNote }: BazaarCreateFormClientProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canAttachImages = maxImages === null || maxImages > 0;
  const imageCountLabel = useMemo(() => {
    if (!canAttachImages) return "Images are not available on this tier.";
    return maxImages === null ? "Listing photos are unlimited on this tier." : `Up to ${maxImages} listing photos.`;
  }, [canAttachImages, maxImages]);

  useEffect(() => {
    return () => {
      selectedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    };
  }, [selectedImages]);

  if (!canCreate) {
    return (
      <section className="rounded border border-[var(--border)] bg-[#0d1320] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-amber-200">Create listing</p>
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">Post a listing on The Market</h2>
            <p className="text-sm text-slate-400">This is what a completed listing looks like.</p>
          </div>
          {listingLimitNote ? <p className="max-w-sm text-xs text-slate-400">{listingLimitNote}</p> : null}
        </div>
        <div className="mt-4 rounded border border-[var(--border)] bg-[#111a2a] p-4">
          <p className="text-base font-semibold text-[var(--text-strong)]">Example The Market listing</p>
          <p className="mt-1 text-sm text-slate-300">Vintage leather chair, $125, local pickup, 3 photos, 2 week run.</p>
          <p className="mt-2 text-xs text-slate-400">Browse is open to everyone. Contributor members can post 6 marketplace listings every 2 weeks. Biz members can post unlimited marketplace listings.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded border border-[var(--border)] bg-[#182232] px-3 py-2 text-xs text-slate-300">Clear title</div>
            <div className="rounded border border-[var(--border)] bg-[#182232] px-3 py-2 text-xs text-slate-300">Up to your tier&apos;s photo limit</div>
            <div className="rounded border border-[var(--border)] bg-[#182232] px-3 py-2 text-xs text-slate-300">Optional ad add-on after listing</div>
          </div>
        </div>
      </section>
    );
  }

  async function uploadListingPhoto(file: File) {
    const result = await uploadImageWithCompression(file, { purpose: "market-listing-photo" });
    if (!result.url) {
      throw new Error("Could not upload listing photo.");
    }
    return result.url;
  }

  async function submit() {
    setSubmitting(true);
    setStatus("");
    try {
      if (!title.trim() || Number.isNaN(Number(price)) || Number(price) < 0) {
        setStatus("Title and price are required.");
        return;
      }
      if (maxImages !== null && selectedImages.length > maxImages) {
        setStatus(`You can attach up to ${maxImages} photos.`);
        return;
      }

      const imageUrls: string[] = [];
      for (const image of selectedImages) {
        const url = await uploadListingPhoto(image.file);
        imageUrls.push(url);
      }

      const response = await fetch("/api/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          price: Number(price),
          location: location.trim() || null,
          category: category.trim() || null,
          imageUrls,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not create listing.");
        return;
      }
      router.push("/market?created=1");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create listing.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded border border-[var(--border)] bg-[#0d1320] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-amber-200">Create listing</p>
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">Post a listing on The Market</h2>
          <p className="text-sm text-slate-400">Keep it short, clear, and honest.</p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>{imageCountLabel}</p>
          {listingLimitNote ? <p className="mt-1 max-w-xs">{listingLimitNote}</p> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canCreate || submitting} className={BAZAAR_FIELD_CLASS} placeholder="Listing title" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Price</span>
          <input value={price} onChange={(event) => setPrice(event.target.value)} disabled={!canCreate || submitting} type="number" min="0" step="0.01" className={BAZAAR_FIELD_CLASS} placeholder="0.00" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Location</span>
          <input value={location} onChange={(event) => setLocation(event.target.value)} disabled={!canCreate || submitting} className={BAZAAR_FIELD_CLASS} placeholder="Optional" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Category</span>
          <input value={category} onChange={(event) => setCategory(event.target.value)} disabled={!canCreate || submitting} className={BAZAAR_FIELD_CLASS} placeholder="Optional" />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-slate-300">Description</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={!canCreate || submitting} className={`${BAZAAR_FIELD_CLASS} min-h-24`} placeholder="Tell people what you're listing" />
        </label>
        <label className="space-y-2 text-sm md:col-span-2">
          <span className="text-slate-300">Listing photos</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={!canCreate || submitting || !canAttachImages}
            className={BAZAAR_FIELD_CLASS}
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              const selectedFiles = maxImages === null ? files : files.slice(0, maxImages);
              setSelectedImages((previous) => {
                previous.forEach((image) => URL.revokeObjectURL(image.previewUrl));
                return selectedFiles.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
              });
              event.currentTarget.value = "";
            }}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            {selectedImages.map((image) => (
              <figure key={`${image.file.name}-${image.file.lastModified}`} className="overflow-hidden rounded border border-[var(--border)] bg-[#111a2a]">
                <Image src={image.previewUrl} alt={image.file.name} width={500} height={360} unoptimized className="h-28 w-full object-cover" />
                <figcaption className="px-2 py-1 text-[10px] text-slate-400">{image.file.name}</figcaption>
              </figure>
            ))}
          </div>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canCreate || submitting}
          onClick={() => void submit()}
          className="rounded bg-[#8f7228] px-4 py-2 text-sm font-semibold text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create listing"}
        </button>
        {status ? <p className="text-sm text-slate-400">{status}</p> : null}
      </div>
    </section>
  );
}
