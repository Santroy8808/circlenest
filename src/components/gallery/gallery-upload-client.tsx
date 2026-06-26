"use client";

import { MediaVisibility } from "@prisma/client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useBackgroundGalleryUploads } from "@/components/gallery/background-gallery-upload-provider";

type GalleryAccess = "PRIVATE" | "MEMBERS_NO_COMMENTS" | "MEMBERS_COMMENTS" | "PUBLIC_NO_COMMENTS" | "PUBLIC_COMMENTS";

function accessToSettings(access: GalleryAccess) {
  if (access === "MEMBERS_COMMENTS") return { visibility: MediaVisibility.MEMBERS, commentsEnabled: true };
  if (access === "PUBLIC_NO_COMMENTS") return { visibility: MediaVisibility.PUBLIC, commentsEnabled: false };
  if (access === "PUBLIC_COMMENTS") return { visibility: MediaVisibility.PUBLIC, commentsEnabled: true };
  if (access === "MEMBERS_NO_COMMENTS") return { visibility: MediaVisibility.MEMBERS, commentsEnabled: false };
  return { visibility: MediaVisibility.PRIVATE, commentsEnabled: false };
}

export function GalleryUploadClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [access, setAccess] = useState<GalleryAccess>("PRIVATE");
  const { addFiles, clearFinished, isUploading, items, uploadAll } = useBackgroundGalleryUploads();
  const selectedSettings = accessToSettings(access);

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
        <select className="form-field" onChange={(event) => setAccess(event.target.value as GalleryAccess)} value={access}>
          <option value="PRIVATE">Private - only me, comments off</option>
          <option value="MEMBERS_NO_COMMENTS">Members can view, comments off</option>
          <option value="MEMBERS_COMMENTS">Members can view and comment</option>
          <option value="PUBLIC_NO_COMMENTS">Public can view, comments off</option>
          <option value="PUBLIC_COMMENTS">Public can view, members can comment</option>
        </select>
        <div className="flex gap-3">
          <Link className="btn-secondary" href="/profile/gallery">
            Back
          </Link>
          <button
            className="btn-primary"
            disabled={items.length === 0 || isUploading}
            onClick={() => uploadAll(selectedSettings)}
            type="button"
          >
            {isUploading ? "Uploading..." : "Upload photos"}
          </button>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="mt-6 grid gap-3">
          {items.some((item) => item.status === "done") ? (
            <div className="flex justify-end">
              <button className="btn-secondary px-3 py-2 text-sm" disabled={isUploading} onClick={clearFinished} type="button">
                Clear finished
              </button>
            </div>
          ) : null}
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
