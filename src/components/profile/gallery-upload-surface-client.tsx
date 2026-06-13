"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadImageWithCompression } from "@/lib/media/image-upload.client";

type Visibility = "PUBLIC" | "FRIENDS_FAMILY" | "PRIVATE";

type GalleryAlbumOption = {
  id: string;
  title: string;
};

type UploadProgressState = {
  phase: "uploading" | "saving";
  total: number;
  completed: number;
  currentName: string | null;
};

async function uploadOne(file: File, albumId: string): Promise<string | null> {
  const result = await uploadImageWithCompression(file, {
    purpose: "gallery-photo",
    albumId,
  });
  return result.url;
}

export function GalleryUploadSurfaceClient({
  albums,
  defaultAlbumId,
  mode,
  autoOpenPicker = false,
  onClose,
  onUploaded,
}: {
  albums: GalleryAlbumOption[];
  defaultAlbumId?: string;
  mode: "modal" | "page";
  autoOpenPicker?: boolean;
  onClose?: () => void;
  onUploaded?: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shellCardClass = "rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]";
  const inputClass = "rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)]/50";
  const ghostButtonClass = "rounded-full border border-[#304058] px-4 py-2 text-sm text-slate-200 transition hover:border-[#4a5a78] hover:text-white";
  const primaryButtonClass = "rounded-full bg-[#376ef8] px-4 py-2 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:shadow-[0_10px_24px_rgba(55,110,248,0.28)]";
  const [selectedAlbumId, setSelectedAlbumId] = useState(defaultAlbumId ?? albums[0]?.id ?? "");
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [notifyFriendsAndFamily, setNotifyFriendsAndFamily] = useState(true);
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgressState | null>(null);

  const queuePreview = useMemo(
    () => queuedFiles.map((file) => ({ key: `${file.name}-${file.lastModified}-${file.size}`, file, url: URL.createObjectURL(file) })),
    [queuedFiles],
  );

  useEffect(() => {
    return () => {
      queuePreview.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [queuePreview]);

  useEffect(() => {
    if (!autoOpenPicker) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 699px)").matches) return;
    const timer = window.setTimeout(() => {
      fileInputRef.current?.click();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [autoOpenPicker]);

  useEffect(() => {
    if (mode !== "modal") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, onClose]);

  function addFiles(list: FileList | File[]) {
    const next = Array.from(list).filter((file) => file.type.startsWith("image/"));
    if (!next.length) return;
    setQueuedFiles((previous) => {
      const seen = new Set(previous.map((file) => `${file.name}-${file.lastModified}-${file.size}`));
      return [...previous, ...next.filter((file) => !seen.has(`${file.name}-${file.lastModified}-${file.size}`))];
    });
    setStatus("");
  }

  async function ensureAlbumId() {
    if (selectedAlbumId) return selectedAlbumId;
    const createdAlbumRes = await fetch("/api/gallery/albums", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "My Pics" }),
    });
    if (!createdAlbumRes.ok) return null;
    const created = (await createdAlbumRes.json()) as { id: string };
    setSelectedAlbumId(created.id);
    return created.id;
  }

  async function submitUpload() {
    if (!queuedFiles.length || busy) return;
    setBusy(true);
    setStatus("");
    const albumId = await ensureAlbumId();
    if (!albumId) {
      setBusy(false);
      setStatus("Could not create a photo album.");
      return;
    }

    const urls: string[] = [];
    for (const [index, file] of queuedFiles.entries()) {
      setProgress({
        phase: "uploading",
        total: queuedFiles.length,
        completed: index,
        currentName: file.name,
      });
      const uploaded = await uploadOne(file, albumId);
      if (uploaded) urls.push(uploaded);
      setProgress({
        phase: "uploading",
        total: queuedFiles.length,
        completed: index + 1,
        currentName: file.name,
      });
    }

    if (!urls.length) {
      setBusy(false);
      setProgress(null);
      setStatus("Upload failed.");
      return;
    }

    setProgress({
      phase: "saving",
      total: queuedFiles.length,
      completed: urls.length,
      currentName: null,
    });

    const saveRes = await fetch("/api/gallery/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumId,
        urls,
        notifyFriendsAndFamily,
        visibility,
      }),
    });

    if (!saveRes.ok) {
      const body = (await saveRes.json().catch(() => null)) as { error?: string } | null;
      setBusy(false);
      setProgress(null);
      setStatus(body?.error ?? "Could not save uploaded photos.");
      return;
    }

    setBusy(false);
    setProgress(null);
    setQueuedFiles([]);
    setStatus("Photos uploaded.");
    router.refresh();
    if (mode === "page") {
      router.push("/profile/gallery");
      return;
    }
    onUploaded?.();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (busy) return;
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
  }

  const content = (
    <article className={mode === "modal" ? "rounded-[24px] border border-[var(--border)] bg-[#0f1523] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.45)]" : shellCardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-strong)]">Upload photos</h1>
          <p className="text-sm text-slate-400">Pick photos, then upload them into your gallery.</p>
        </div>
        {onClose ? (
          <button type="button" className={ghostButtonClass} onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`mt-5 rounded-[26px] border-2 border-dashed px-6 py-10 text-center transition ${dragActive ? "border-[#4a7cff] bg-[#162033]" : "border-[#304058] bg-[#111a2a]"}`}
      >
        <div className="mx-auto max-w-[520px] space-y-4">
          <p className="text-3xl font-semibold text-[var(--text-strong)]">Drop photos here</p>
          <p className="text-sm text-slate-400">JPG, PNG, GIF, and WEBP images are supported.</p>
          <button type="button" className={primaryButtonClass} onClick={() => fileInputRef.current?.click()}>
            Choose photos
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              if (!event.currentTarget.files) return;
              addFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_190px]">
        <select value={selectedAlbumId} onChange={(event) => setSelectedAlbumId(event.target.value)} className={inputClass}>
          <option value="">My Pics</option>
          {albums.map((album) => (
            <option key={album.id} value={album.id}>
              {album.title}
            </option>
          ))}
        </select>
        <select value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)} className={inputClass}>
          <option value="PUBLIC">Public</option>
          <option value="FRIENDS_FAMILY">Friends & Family</option>
          <option value="PRIVATE">Private</option>
        </select>
        <label className="flex items-center gap-2 rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-200">
          <input type="checkbox" checked={notifyFriendsAndFamily} onChange={(event) => setNotifyFriendsAndFamily(event.target.checked)} />
          Notify feed
        </label>
      </div>

      {queuePreview.length ? (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {queuePreview.map((item, index) => (
            <div key={item.key} className="overflow-hidden rounded-[18px] border border-[#273449] bg-[#111a2a]">
              <Image src={item.url} alt={item.file.name} width={320} height={320} unoptimized className="aspect-square w-full object-cover" />
              <div className="flex items-center justify-between gap-2 p-2">
                <p className="truncate text-xs text-slate-300">{item.file.name}</p>
                <button
                  type="button"
                  className="rounded-full border border-[#304058] px-2 py-1 text-[11px] text-slate-200"
                  onClick={() => setQueuedFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {progress ? (
        <div className="mt-5 rounded-[16px] bg-[#111a2a] px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
            <span>{progress.phase === "saving" ? "Saving photos" : `Uploading ${progress.completed} of ${progress.total}`}</span>
            <span className="text-xs text-slate-400">{progress.completed}/{progress.total}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#1a2538]">
            <div
              className="h-full rounded-full bg-[#376ef8] transition-all duration-300"
              style={{ width: `${Math.max(progress.phase === "saving" ? 96 : Math.round((progress.completed / Math.max(progress.total, 1)) * 100), 8)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">{progress.currentName ?? "Finalizing your upload..."}</p>
        </div>
      ) : status ? (
        <p className="mt-5 text-sm text-slate-300">{status}</p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        {onClose ? (
          <button type="button" className={ghostButtonClass} onClick={onClose}>
            Cancel
          </button>
        ) : null}
        <button type="button" className={primaryButtonClass} onClick={() => void submitUpload()} disabled={!queuedFiles.length || busy}>
          Upload photos
        </button>
      </div>
    </article>
  );

  if (mode === "modal") {
    return (
      <div className="fixed inset-0 z-50 hidden bg-black/70 p-6 md:block" onClick={onClose}>
        <div className="mx-auto max-w-4xl" onClick={(event) => event.stopPropagation()}>
          {content}
        </div>
      </div>
    );
  }

  return content;
}
