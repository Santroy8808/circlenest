"use client";

import { MediaVisibility } from "@prisma/client";
import Link from "next/link";
import { useRef, useState } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";

type UploadItem = {
  id: string;
  file: File;
  previewUrl: string;
  assetId?: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function GalleryUploadClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [visibility, setVisibility] = useState<MediaVisibility>(MediaVisibility.PRIVATE);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  function addFiles(files: FileList | File[]) {
    const next = Array.from(files).map((file) => ({
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

  async function uploadAll() {
    setError("");
    setIsUploading(true);

    for (const item of items.filter((candidate) => candidate.status !== "done")) {
      try {
        updateItem(item.id, { status: "uploading", progress: 1 });
        const intentResponse = await fetch("/api/media/upload-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: item.file.name,
            mimeType: item.file.type,
            sizeBytes: item.file.size,
            visibility
          })
        });
        const intent = await readJsonResponse<{ error?: string; uploadUrl?: string; storageKey?: string }>(intentResponse);

        if (!intentResponse.ok || !intent?.uploadUrl || !intent.storageKey) {
          throw new Error(intent?.error ?? "Could not prepare upload.");
        }

        await uploadWithResilientFallback({
          uploadUrl: intent.uploadUrl,
          storageKey: intent.storageKey,
          file: item.file,
          onProgress: (progress) => updateItem(item.id, { progress })
        });

        const completeResponse = await fetch("/api/media/complete-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storageKey: intent.storageKey,
            fileName: item.file.name,
            mimeType: item.file.type,
            sizeBytes: item.file.size,
            visibility,
            tags: []
          })
        });
        const complete = await readJsonResponse<{ error?: string; asset?: { id: string } }>(completeResponse);

        if (!completeResponse.ok) {
          throw new Error(complete?.error ?? "Could not save photo record.");
        }

        if (!complete?.asset?.id) {
          throw new Error("Photo uploaded, but the gallery record was not returned.");
        }

        updateItem(item.id, { assetId: complete.asset.id, status: "done", progress: 100 });
      } catch (caught) {
        updateItem(item.id, {
          status: "error",
          error: caught instanceof Error ? caught.message : "Upload failed."
        });
      }
    }

    setIsUploading(false);
  }

  return (
    <section className="surface rounded-md p-6">
      <div
        className="upload-drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
      >
        <h2 className="text-3xl font-semibold text-[var(--gold)]">Drop photos here</h2>
        <p className="mt-2 text-[var(--muted)]">JPG, PNG, GIF, and WEBP images up to 10MB each.</p>
        <button className="btn-primary mt-5" onClick={() => inputRef.current?.click()} type="button">
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

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto]">
        <select className="form-field" onChange={(event) => setVisibility(event.target.value as MediaVisibility)} value={visibility}>
          <option value={MediaVisibility.PRIVATE}>Private</option>
          <option value={MediaVisibility.MEMBERS}>Members</option>
          <option value={MediaVisibility.PUBLIC}>Public</option>
        </select>
        <div className="flex gap-3">
          <Link className="btn-secondary" href="/profile/gallery">
            Back
          </Link>
          <button className="btn-primary" disabled={items.length === 0 || isUploading} onClick={uploadAll} type="button">
            {isUploading ? "Uploading..." : "Upload photos"}
          </button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

      {items.length > 0 ? (
        <div className="mt-6 grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="upload-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src={item.previewUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate font-semibold">{item.file.name}</p>
                  <span className="text-sm text-[var(--muted)]">{item.progress}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
                  <div className="h-full rounded-full bg-[var(--blue)]" style={{ width: `${item.progress}%` }} />
                </div>
                {item.error ? <p className="mt-2 text-sm text-red-100">{item.error}</p> : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
