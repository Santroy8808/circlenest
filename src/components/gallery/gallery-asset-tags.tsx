"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GalleryAssetView } from "@/modules/gallery-media-storage/types";

const DEFAULT_TAGS = ["Family", "Friends", "Events"];

export function GalleryAssetTags({ asset }: { asset: GalleryAssetView }) {
  const router = useRouter();
  const [tags, setTags] = useState(asset.tags);
  const [tagChoice, setTagChoice] = useState(DEFAULT_TAGS[0]);
  const [customTag, setCustomTag] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const tagName = tagChoice === "Custom" ? customTag.trim() : tagChoice;

  function saveTags(mode: "add" | "replace") {
    setError("");
    setMessage("");

    if (!tagName) {
      setError("Choose or enter a tag first.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/media/assets/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaAssetIds: [asset.id], tags: [tagName], mode })
      });
      const payload = (await response.json()) as { error?: string; assets?: GalleryAssetView[] };
      const updatedAsset = payload.assets?.[0];

      if (!response.ok || !updatedAsset) {
        setError(payload.error ?? "Could not save tags.");
        return;
      }

      setTags(updatedAsset.tags);
      setMessage(mode === "replace" ? "Tags replaced." : "Tag added.");
      router.refresh();
    });
  }

  return (
    <section className="surface rounded-md p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Tags</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.length > 0 ? (
          tags.map((tag) => (
            <span className="pill rounded-full px-3 py-1 text-xs" key={tag}>
              {tag}
            </span>
          ))
        ) : (
          <p className="text-sm text-[var(--muted)]">No tags yet.</p>
        )}
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-2">
          <span className="form-label">Tag type</span>
          <select className="form-field" disabled={isPending} onChange={(event) => setTagChoice(event.target.value)} value={tagChoice}>
            {DEFAULT_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
            <option value="Custom">Custom</option>
          </select>
        </label>
        {tagChoice === "Custom" ? (
          <label className="grid gap-2">
            <span className="form-label">Custom tag</span>
            <input
              className="form-field"
              disabled={isPending}
              maxLength={40}
              onChange={(event) => setCustomTag(event.target.value)}
              placeholder="Type a tag"
              value={customTag}
            />
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={isPending || !tagName} onClick={() => saveTags("add")} type="button">
            Add tag
          </button>
          <button className="btn-secondary" disabled={isPending || !tagName} onClick={() => saveTags("replace")} type="button">
            Replace tags
          </button>
        </div>
      </div>

      {message ? <p className="mt-4 rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
    </section>
  );
}
