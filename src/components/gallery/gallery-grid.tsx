"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GalleryAssetView } from "@/modules/gallery-media-storage/types";

const DEFAULT_TAGS = ["Family", "Friends", "Events"];

function assetImageUrl(asset: GalleryAssetView) {
  return asset.publicUrl ?? `/api/media/assets/${asset.id}`;
}

export function GalleryGrid({ assets }: { assets: GalleryAssetView[] }) {
  const router = useRouter();
  const [galleryAssets, setGalleryAssets] = useState(assets);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterTag, setFilterTag] = useState("");
  const [tagChoice, setTagChoice] = useState(DEFAULT_TAGS[0]);
  const [customTag, setCustomTag] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const tagName = tagChoice === "Custom" ? customTag.trim() : tagChoice;
  const availableTags = useMemo(() => {
    const byName = new Map<string, string>();

    [...DEFAULT_TAGS, ...galleryAssets.flatMap((asset) => asset.tags)].forEach((tag) => {
      const clean = tag.trim();

      if (clean && !byName.has(clean.toLowerCase())) {
        byName.set(clean.toLowerCase(), clean);
      }
    });

    return [...byName.values()].sort((left, right) => left.localeCompare(right));
  }, [galleryAssets]);
  const visibleAssets = useMemo(() => {
    if (!filterTag) return galleryAssets;
    return galleryAssets.filter((asset) => asset.tags.some((tag) => tag.toLowerCase() === filterTag.toLowerCase()));
  }, [filterTag, galleryAssets]);
  const visibleIds = visibleAssets.map((asset) => asset.id);
  const selectedVisibleIds = selectedIds.filter((id) => visibleIds.includes(id));

  function toggleSelected(assetId: string) {
    setSelectedIds((current) => (current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]));
  }

  function replaceUpdatedAssets(updatedAssets: GalleryAssetView[]) {
    const byId = new Map(updatedAssets.map((asset) => [asset.id, asset]));
    setGalleryAssets((current) => current.map((asset) => byId.get(asset.id) ?? asset));
  }

  function applyTag(targetIds: string[]) {
    setError("");
    setMessage("");

    if (!tagName) {
      setError("Choose or enter a tag first.");
      return;
    }

    if (targetIds.length === 0) {
      setError("Choose at least one photo first.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/media/assets/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaAssetIds: targetIds, tags: [tagName], mode: "add" })
      });
      const payload = (await response.json()) as { error?: string; assets?: GalleryAssetView[] };

      if (!response.ok || !payload.assets) {
        setError(payload.error ?? "Could not tag photos.");
        return;
      }

      replaceUpdatedAssets(payload.assets);
      setMessage(`Tagged ${targetIds.length} photo${targetIds.length === 1 ? "" : "s"} as ${tagName}.`);
      router.refresh();
    });
  }

  function deleteAssets(targetIds: string[]) {
    setError("");
    setMessage("");

    if (targetIds.length === 0) {
      setError("Choose at least one photo first.");
      return;
    }

    if (!window.confirm(`Delete ${targetIds.length} photo${targetIds.length === 1 ? "" : "s"} from My Pics?`)) {
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/media/assets/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaAssetIds: targetIds })
      });
      const payload = (await response.json()) as { error?: string; deletedMediaAssetIds?: string[]; deletedCount?: number };

      if (!response.ok || !payload.deletedMediaAssetIds) {
        setError(payload.error ?? "Could not delete photos.");
        return;
      }

      setGalleryAssets((current) => current.filter((asset) => !payload.deletedMediaAssetIds?.includes(asset.id)));
      setSelectedIds((current) => current.filter((id) => !payload.deletedMediaAssetIds?.includes(id)));
      setMessage(`Deleted ${payload.deletedCount ?? targetIds.length} photo${(payload.deletedCount ?? targetIds.length) === 1 ? "" : "s"}.`);
      router.refresh();
    });
  }

  if (galleryAssets.length === 0) {
    return (
      <section className="surface rounded-md p-6 text-center">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">No photos yet</h2>
        <p className="mt-2 text-[var(--muted)]">Upload your first photo to start building My Pics.</p>
        <Link className="btn-primary mt-5 inline-block" href="/profile/gallery/upload">
          Upload photos
        </Link>
      </section>
    );
  }

  return (
    <section className="grid gap-5">
      <div className="surface rounded-md p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" disabled={visibleAssets.length === 0 || isPending} onClick={() => setSelectedIds(visibleIds)} type="button">
                Select all visible
              </button>
              <button className="btn-secondary" disabled={selectedIds.length === 0 || isPending} onClick={() => setSelectedIds([])} type="button">
                Clear selection
              </button>
              <button className="btn-secondary" disabled={selectedVisibleIds.length === 0 || isPending} onClick={() => deleteAssets(selectedVisibleIds)} type="button">
                Delete selected
              </button>
            </div>
            <label className="grid gap-2">
              <span className="form-label">Filter by tag</span>
              <select className="form-field" onChange={(event) => setFilterTag(event.target.value)} value={filterTag}>
                <option value="">All photos</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
              <label className="grid gap-2">
                <span className="form-label">Tag</span>
                <select className="form-field" onChange={(event) => setTagChoice(event.target.value)} value={tagChoice}>
                  {DEFAULT_TAGS.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                  <option value="Custom">Custom</option>
                </select>
              </label>
              <label className="grid gap-2">
                <span className="form-label">Custom tag</span>
                <input
                  className="form-field"
                  disabled={tagChoice !== "Custom" || isPending}
                  maxLength={40}
                  onChange={(event) => setCustomTag(event.target.value)}
                  placeholder="Type a tag"
                  value={customTag}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={selectedVisibleIds.length === 0 || isPending || !tagName} onClick={() => applyTag(selectedVisibleIds)} type="button">
                Tag selected
              </button>
              <button className="btn-secondary" disabled={visibleAssets.length === 0 || isPending || !tagName} onClick={() => applyTag(visibleIds)} type="button">
                Tag all visible
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
          <span>{selectedVisibleIds.length} selected</span>
          <span>{visibleAssets.length} shown</span>
        </div>
        {message ? <p className="mt-4 rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      </div>

      {visibleAssets.length === 0 ? (
        <section className="surface rounded-md p-6 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No photos match that tag</h2>
          <button className="btn-secondary mt-5" onClick={() => setFilterTag("")} type="button">
            Show all photos
          </button>
        </section>
      ) : (
        <section className="gallery-grid">
          {visibleAssets.map((asset) => {
            const selected = selectedIds.includes(asset.id);

            return (
              <article key={asset.id} className={selected ? "gallery-tile is-selected" : "gallery-tile"}>
                <label className="gallery-select">
                  <input checked={selected} disabled={isPending} onChange={() => toggleSelected(asset.id)} type="checkbox" />
                  <span>Select</span>
                </label>
                <button className="gallery-delete-button" disabled={isPending} onClick={() => deleteAssets([asset.id])} type="button">
                  Delete
                </button>
                <Link className="gallery-tile-link" href={`/profile/gallery/${asset.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={asset.originalName ?? "Gallery photo"} src={assetImageUrl(asset)} />
                  <div className="gallery-tile-meta">
                    <p className="truncate font-semibold">{asset.originalName ?? "Photo"}</p>
                    <p className="text-xs text-[var(--muted)]">{new Date(asset.createdAt).toLocaleDateString()}</p>
                    {asset.tags.length > 0 ? <p className="mt-1 truncate text-xs text-[var(--gold)]">{asset.tags.join(", ")}</p> : null}
                  </div>
                </Link>
              </article>
            );
          })}
        </section>
      )}
    </section>
  );
}
