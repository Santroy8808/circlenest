"use client";

import { MediaVisibility } from "@prisma/client";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useBackgroundGalleryUploads } from "@/components/gallery/background-gallery-upload-provider";
import type { GalleryAssetView } from "@/modules/gallery-media-storage/types";

const DEFAULT_TAGS = ["Family", "Friends", "Events"];
const SYSTEM_GALLERY_TAGS = new Set(["stream images", "stream post images", "stream reply images", "ad", "ad images", "ad creative"]);

function assetImageUrl(asset: GalleryAssetView) {
  return asset.thumbnailUrl ?? asset.publicUrl ?? `/api/media/assets/${asset.id}`;
}

function handleGalleryImageError(event: React.SyntheticEvent<HTMLImageElement>, assetId: string) {
  const image = event.currentTarget;
  if (image.dataset.mediaFallbackApplied === "true") return;

  image.dataset.mediaFallbackApplied = "true";
  image.src = `/api/media/assets/${assetId}`;
}

function isSystemGalleryAsset(asset: GalleryAssetView) {
  if (asset.source && asset.source !== "GALLERY") return true;
  return asset.tags.some((tag) => SYSTEM_GALLERY_TAGS.has(tag.trim().toLowerCase()));
}

function includesSearch(value: string | null | undefined, query: string) {
  return !query || (value ?? "").toLowerCase().includes(query.toLowerCase());
}

function createdDateKey(asset: GalleryAssetView) {
  return asset.createdAt.slice(0, 10);
}

export function GalleryGrid({ assets }: { assets: GalleryAssetView[] }) {
  const router = useRouter();
  const quickUploadInputRef = useRef<HTMLInputElement>(null);
  const { addFilesAndUpload, isUploading } = useBackgroundGalleryUploads();
  const [galleryAssets, setGalleryAssets] = useState(assets);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [tagChoice, setTagChoice] = useState(DEFAULT_TAGS[0]);
  const [tagTarget, setTagTarget] = useState<"selected" | "visible">("selected");
  const [customTag, setCustomTag] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [controlsOpen, setControlsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const tagName = tagChoice === "Custom" ? customTag.trim() : tagChoice;
  const hasSearch = Boolean(searchQuery.trim() || dateFrom || dateTo);
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
    return galleryAssets.filter((asset) => {
      const cleanSearchQuery = searchQuery.trim();
      if (isSystemGalleryAsset(asset) && !cleanSearchQuery) return false;

      const createdDate = createdDateKey(asset);
      const matchesSearch =
        !cleanSearchQuery ||
        includesSearch(asset.originalName, cleanSearchQuery) ||
        includesSearch(asset.commentSearchText, cleanSearchQuery) ||
        asset.tags.some((tag) => includesSearch(tag, cleanSearchQuery));
      const matchesDateFrom = !dateFrom || createdDate >= dateFrom;
      const matchesDateTo = !dateTo || createdDate <= dateTo;

      return matchesSearch && matchesDateFrom && matchesDateTo;
    });
  }, [dateFrom, dateTo, galleryAssets, searchQuery]);
  const hiddenSystemCount = galleryAssets.filter(isSystemGalleryAsset).length;
  const visibleIds = visibleAssets.map((asset) => asset.id);
  const selectedVisibleIds = selectedIds.filter((id) => visibleIds.includes(id));
  const tagTargetIds = tagTarget === "visible" ? visibleIds : selectedVisibleIds;

  function clearSearch() {
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
  }

  function toggleSelected(assetId: string) {
    setSelectedIds((current) => (current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]));
  }

  function replaceUpdatedAssets(updatedAssets: GalleryAssetView[]) {
    const byId = new Map(updatedAssets.map((asset) => [asset.id, asset]));
    setGalleryAssets((current) => current.map((asset) => byId.get(asset.id) ?? asset));
  }

  function updateTag(targetIds: string[], mode: "add" | "remove") {
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
        body: JSON.stringify({ mediaAssetIds: targetIds, tags: [tagName], mode })
      });
      const payload = (await response.json()) as { error?: string; assets?: GalleryAssetView[] };

      if (!response.ok || !payload.assets) {
        setError(payload.error ?? "Could not update tags.");
        return;
      }

      replaceUpdatedAssets(payload.assets);
      setMessage(
        mode === "remove"
          ? `Removed ${tagName} from ${targetIds.length} photo${targetIds.length === 1 ? "" : "s"}.`
          : `Tagged ${targetIds.length} photo${targetIds.length === 1 ? "" : "s"} as ${tagName}.`
      );
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

  function queuePrivateUploads(files: FileList | null) {
    if (!files || files.length === 0) return;

    addFilesAndUpload(files, {
      visibility: MediaVisibility.PRIVATE,
      commentsEnabled: false
    });
    setMessage(`${files.length} photo${files.length === 1 ? "" : "s"} queued for background upload.`);
  }

  const quickUploadInput = (
    <input
      ref={quickUploadInputRef}
      accept="image/jpeg,image/png,image/gif,image/webp"
      className="hidden"
      multiple
      onChange={(event) => {
        queuePrivateUploads(event.target.files);
        event.currentTarget.value = "";
      }}
      type="file"
    />
  );

  if (galleryAssets.length === 0) {
    return (
      <section className="surface rounded-md p-6 text-center">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">No photos yet</h2>
        <p className="mt-2 text-[var(--muted)]">Upload your first photo to start building My Pics.</p>
        {quickUploadInput}
        <button
          className="btn-primary mt-5 inline-block"
          data-tooltip="Choose photos and upload them in the background."
          disabled={isUploading}
          onClick={() => quickUploadInputRef.current?.click()}
          type="button"
        >
          Upload
        </button>
      </section>
    );
  }

  return (
    <section className="grid gap-5">
      <div className="surface rounded-md p-4 sm:p-5">
        <div className="gallery-toolbar">
          <div className="gallery-toolbar-summary">
            <button
              aria-expanded={controlsOpen}
              className="btn-secondary"
              data-tooltip="Show gallery search, selection, delete, and tag controls."
              onClick={() => setControlsOpen((current) => !current)}
              type="button"
            >
              Controls
            </button>
            <span className="text-sm text-[var(--muted)]">
              {visibleAssets.length} shown{selectedVisibleIds.length > 0 ? `, ${selectedVisibleIds.length} selected` : ""}
            </span>
          </div>
          {quickUploadInput}
          <button
            className="btn-primary gallery-upload-link"
            data-tooltip="Choose photos and upload them in the background."
            disabled={isUploading}
            onClick={() => quickUploadInputRef.current?.click()}
            type="button"
          >
            Upload
          </button>
        </div>

        {controlsOpen ? (
          <div className="gallery-controls-panel">
            <div className="gallery-selection-actions">
              <button
                className="btn-secondary"
                data-tooltip="Select every photo currently shown."
                disabled={visibleAssets.length === 0 || isPending}
                onClick={() => setSelectedIds(visibleIds)}
                title="Select all visible photos"
                type="button"
              >
                Select
              </button>
              <button
                className="btn-secondary"
                data-tooltip="Clear the selected photos."
                disabled={selectedIds.length === 0 || isPending}
                onClick={() => setSelectedIds([])}
                title="Clear selected photos"
                type="button"
              >
                Clear
              </button>
              <button
                className="btn-secondary"
                data-tooltip="Delete the selected photos."
                disabled={selectedVisibleIds.length === 0 || isPending}
                onClick={() => deleteAssets(selectedVisibleIds)}
                title="Delete selected photos"
                type="button"
              >
                Delete
              </button>
            </div>

            <div className="gallery-control-layout">
              <section aria-labelledby="gallery-search-heading" className="gallery-search-panel">
                <div className="gallery-panel-heading">
                  <p className="form-label" id="gallery-search-heading">
                    Search
                  </p>
                  <button className="btn-secondary gallery-compact-button" data-tooltip="Clear all gallery search fields." disabled={!hasSearch} onClick={clearSearch} type="button">
                    Clear
                  </button>
                </div>
                <div className="gallery-search-grid">
                  <label className="gallery-search-main grid gap-2">
                    <span className="form-label">Search gallery</span>
                    <input
                      className="form-field"
                      list="gallery-tag-suggestions"
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search filenames, tags, or comments"
                      value={searchQuery}
                    />
                    <datalist id="gallery-tag-suggestions">
                      {availableTags.map((tag) => (
                        <option key={tag} value={tag} />
                      ))}
                    </datalist>
                  </label>
                  <label className="grid gap-2">
                    <span className="form-label">From</span>
                    <input className="form-field" onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} />
                  </label>
                  <label className="grid gap-2">
                    <span className="form-label">To</span>
                    <input className="form-field" onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} />
                  </label>
                </div>
              </section>

              <section aria-labelledby="gallery-tags-heading" className="gallery-tag-panel">
                <p className="form-label" id="gallery-tags-heading">
                  Tags
                </p>
                <div className="gallery-tag-fields">
                  <label className="grid gap-2">
                    <span className="form-label">Tag</span>
                    <select className="form-field" onChange={(event) => setTagChoice(event.target.value)} value={tagChoice}>
                      {availableTags.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                      <option value="Custom">Custom</option>
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="form-label">Custom</span>
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
                <div className="gallery-tag-footer">
                  <div aria-label="Tag target" className="gallery-tag-scope" role="group">
                    <button
                      aria-pressed={tagTarget === "selected"}
                      className={tagTarget === "selected" ? "is-active" : ""}
                      data-tooltip="Apply tag actions only to checked photos."
                      onClick={() => setTagTarget("selected")}
                      type="button"
                    >
                      Selected
                    </button>
                    <button
                      aria-pressed={tagTarget === "visible"}
                      className={tagTarget === "visible" ? "is-active" : ""}
                      data-tooltip="Apply tag actions to every photo currently shown."
                      onClick={() => setTagTarget("visible")}
                      type="button"
                    >
                      Visible
                    </button>
                  </div>
                  <div className="gallery-tag-actions">
                    <button className="btn-primary" data-tooltip="Add this tag to the chosen photos." disabled={tagTargetIds.length === 0 || isPending || !tagName} onClick={() => updateTag(tagTargetIds, "add")} type="button">
                      Apply
                    </button>
                    <button className="btn-secondary" data-tooltip="Remove this tag from the chosen photos." disabled={tagTargetIds.length === 0 || isPending || !tagName} onClick={() => updateTag(tagTargetIds, "remove")} type="button">
                      Remove
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
          <span>{selectedVisibleIds.length} selected</span>
          <span>
            {visibleAssets.length} shown{!searchQuery.trim() && hiddenSystemCount > 0 ? `, ${hiddenSystemCount} stream/ad hidden` : ""}
          </span>
        </div>
        {message ? <p className="mt-4 rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      </div>

      {visibleAssets.length === 0 ? (
        <section className="surface rounded-md p-6 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No photos match your search</h2>
          <button className="btn-secondary mt-5" data-tooltip="Clear all gallery search fields." onClick={clearSearch} type="button">
            Clear
          </button>
        </section>
      ) : (
        <section className="gallery-grid">
          {visibleAssets.map((asset) => {
            const selected = selectedIds.includes(asset.id);

            return (
              <article key={asset.id} className={selected ? "gallery-tile is-selected" : "gallery-tile"}>
                <label className="gallery-select" data-tooltip="Select this photo.">
                  <input checked={selected} disabled={isPending} onChange={() => toggleSelected(asset.id)} type="checkbox" />
                  <span>Select</span>
                </label>
                <button className="gallery-delete-button" data-tooltip="Delete this photo." disabled={isPending} onClick={() => deleteAssets([asset.id])} type="button">
                  Delete
                </button>
                <Link className="gallery-tile-link" data-tooltip="Open this photo." href={`/profile/gallery/${asset.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={asset.originalName ?? "Gallery photo"}
                    decoding="async"
                    loading="lazy"
                    onError={(event) => handleGalleryImageError(event, asset.id)}
                    src={assetImageUrl(asset)}
                  />
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
