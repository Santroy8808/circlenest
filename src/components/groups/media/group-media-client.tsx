"use client";

import { GroupAssetKind } from "@prisma/client";
import { useRef, useState } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import type { GroupAssetView } from "@/modules/group-media-docs/types";

type UploadItem = {
  id: string;
  file: File;
  previewUrl?: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

type GroupMediaClientProps = {
  group: {
    id: string;
    slug: string;
    name: string;
    storageLimitBytes: string;
  };
  initialAssets: GroupAssetView[];
  initialStorageUsedBytes: string;
  viewerCanUpload: boolean;
  viewerCanComment: boolean;
  viewerCanManageStorage: boolean;
};

function bytesLabel(value: string | number) {
  const bytes = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) return "0MB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fileAccept(kind: GroupAssetKind) {
  return kind === GroupAssetKind.PHOTO
    ? "image/jpeg,image/png,image/gif,image/webp"
    : ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,text/plain,application/pdf";
}

function kindLabel(kind: GroupAssetKind) {
  return kind === GroupAssetKind.PHOTO ? "Photos" : "Documents";
}

export function GroupMediaClient({
  group,
  initialAssets,
  initialStorageUsedBytes,
  viewerCanUpload,
  viewerCanComment,
  viewerCanManageStorage
}: GroupMediaClientProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState(initialAssets);
  const [selectedKind, setSelectedKind] = useState<GroupAssetKind>(GroupAssetKind.PHOTO);
  const [storageUsedBytes, setStorageUsedBytes] = useState(initialStorageUsedBytes);
  const [storageLimitBytes, setStorageLimitBytes] = useState(group.storageLimitBytes);
  const [storageLimitInputMb, setStorageLimitInputMb] = useState(() => String(Math.round(Number(group.storageLimitBytes) / 1024 / 1024)));
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dangerPassword, setDangerPassword] = useState("");
  const [dangerConfirmText, setDangerConfirmText] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const visibleAssets = assets.filter((asset) => asset.kind === selectedKind);
  const storageLimit = Number(storageLimitBytes);
  const storageUsed = Number(storageUsedBytes);
  const storagePercent = storageLimit > 0 ? Math.min(100, Math.round((storageUsed / storageLimit) * 100)) : 0;

  async function refreshAssets(kind = selectedKind) {
    const response = await fetch(`/api/groups/${group.slug}/media/assets?kind=${kind}`, { cache: "no-store" });
    const payload = (await response.json()) as {
      error?: string;
      assets?: GroupAssetView[];
      storageUsedBytes?: string;
    };

    if (!response.ok || !payload.assets) {
      setError(payload.error ?? "Could not refresh group media.");
      return;
    }

    setAssets(payload.assets);
    if (payload.storageUsedBytes) setStorageUsedBytes(payload.storageUsedBytes);
  }

  function addFiles(files: FileList | File[]) {
    const next = Array.from(files).map((file) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      progress: 0,
      status: "queued" as const
    }));

    setItems((current) => [...current, ...next]);
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  async function uploadAll() {
    setError("");
    setMessage("");
    setIsUploading(true);
    let hadError = false;

    for (const item of items.filter((candidate) => candidate.status !== "done")) {
      try {
        updateItem(item.id, { status: "uploading", progress: 1 });
        const intentResponse = await fetch(`/api/groups/${group.slug}/media/upload-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: item.file.name,
            mimeType: item.file.type,
            sizeBytes: item.file.size,
            kind: selectedKind
          })
        });
        const intent = (await intentResponse.json()) as { error?: string; uploadUrl?: string; storageKey?: string };

        if (!intentResponse.ok || !intent.uploadUrl || !intent.storageKey) {
          throw new Error(intent.error ?? "Could not prepare upload.");
        }

        await uploadWithResilientFallback({
          uploadUrl: intent.uploadUrl,
          storageKey: intent.storageKey,
          file: item.file,
          onProgress: (progress) => updateItem(item.id, { progress }),
          proxyUrl: `/api/groups/${group.slug}/media/proxy-upload`,
          fields: { kind: selectedKind }
        });

        const completeResponse = await fetch(`/api/groups/${group.slug}/media/complete-upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storageKey: intent.storageKey,
            fileName: item.file.name,
            mimeType: item.file.type,
            sizeBytes: item.file.size,
            kind: selectedKind,
            headline,
            description
          })
        });
        const complete = (await completeResponse.json()) as { error?: string };

        if (!completeResponse.ok) {
          throw new Error(complete.error ?? "Could not save group file.");
        }

        updateItem(item.id, { status: "done", progress: 100 });
      } catch (caught) {
        hadError = true;
        updateItem(item.id, {
          status: "error",
          error: caught instanceof Error ? caught.message : "Upload failed."
        });
      }
    }

    setIsUploading(false);
    await refreshAssets();

    if (!hadError) {
      setItems([]);
      setHeadline("");
      setDescription("");
      setIsUploadOpen(false);
      setMessage(`${kindLabel(selectedKind)} uploaded.`);
    }
  }

  async function submitComment(event: React.FormEvent<HTMLFormElement>, assetId: string) {
    event.preventDefault();
    setError("");
    const body = commentInputs[assetId]?.trim();
    if (!body) return;

    const response = await fetch(`/api/groups/${group.slug}/media/assets/${assetId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not add comment.");
      return;
    }

    setCommentInputs((current) => ({ ...current, [assetId]: "" }));
    await refreshAssets();
  }

  async function deleteAsset(assetId: string) {
    setError("");
    const response = await fetch(`/api/groups/${group.slug}/media/assets/${assetId}/delete`, {
      method: "POST"
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not delete file.");
      return;
    }

    await refreshAssets();
  }

  async function updateStorageLimit() {
    setError("");
    setMessage("");
    const storageLimitBytes = Math.max(0, Math.round(Number(storageLimitInputMb) * 1024 * 1024));
    const response = await fetch(`/api/groups/${group.slug}/media/storage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageLimitBytes })
    });
    const payload = (await response.json()) as { error?: string; storageLimitBytes?: string; usedBytes?: string };

    if (!response.ok || !payload.storageLimitBytes) {
      setError(payload.error ?? "Could not update storage assignment.");
      if (payload.usedBytes) setStorageUsedBytes(payload.usedBytes);
      return;
    }

    setStorageLimitBytes(payload.storageLimitBytes);
    setMessage("Storage assignment updated.");
  }

  async function purgeStorage(action: "PURGE_OLD_IMAGES_TO_LIMIT" | "PURGE_ALL_IMAGES" | "DELETE_ALL_CONTENT") {
    setError("");
    setMessage("");
    const response = await fetch(`/api/groups/${group.slug}/media/storage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        targetLimitBytes: Number(storageLimitBytes),
        password: dangerPassword,
        confirmationText: dangerConfirmText
      })
    });
    const payload = (await response.json()) as { error?: string; deletedCount?: number; freedBytes?: string; storageUsedBytes?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not purge storage.");
      return;
    }

    if (payload.storageUsedBytes) setStorageUsedBytes(payload.storageUsedBytes);
    setMessage(`Purged ${payload.deletedCount ?? 0} item(s), freed ${bytesLabel(payload.freedBytes ?? "0")}.`);
    setDangerPassword("");
    setDangerConfirmText("");
    await refreshAssets();
  }

  function changeKind(kind: GroupAssetKind) {
    setSelectedKind(kind);
    setItems([]);
    void refreshAssets(kind);
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Group Media</p>
            <h1 className="mt-3 text-3xl font-semibold">{group.name}</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Simple photos and documents for the group. No album maze, no admin-panel clutter.
            </p>
          </div>
          {viewerCanUpload ? (
            <button className="btn-primary" onClick={() => setIsUploadOpen((current) => !current)} type="button">
              {isUploadOpen ? "Close Upload" : "Upload"}
            </button>
          ) : null}
        </div>

        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
            <span>
              {bytesLabel(storageUsedBytes)} of {bytesLabel(storageLimitBytes)} used
            </span>
            <span>{storagePercent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
            <div className="h-full rounded-full bg-[var(--blue)]" style={{ width: `${storagePercent}%` }} />
          </div>
        </div>

        {viewerCanManageStorage ? (
          <div className="group-storage-controls mt-5">
            <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_auto_auto_auto]">
              <label className="grid gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">
                Assigned MB
                <input
                  className="form-field"
                  min={0}
                  onChange={(event) => setStorageLimitInputMb(event.target.value)}
                  type="number"
                  value={storageLimitInputMb}
                />
              </label>
              <button className="btn-primary self-end" onClick={updateStorageLimit} type="button">
                Save
              </button>
              <button className="btn-secondary self-end" onClick={() => purgeStorage("PURGE_OLD_IMAGES_TO_LIMIT")} type="button">
                Auto purge
              </button>
              <a className="btn-secondary self-end" href={`/groups/${group.slug}/media?kind=PHOTO`}>
                Manual
              </a>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="btn-secondary" onClick={() => purgeStorage("PURGE_ALL_IMAGES")} type="button">
                Purge images
              </button>
            </div>
            <div className="mt-4 rounded-md border border-red-400/40 bg-red-950/20 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-100">Irrevocable delete all group content</p>
              <p className="mt-2 text-sm text-red-100">
                This removes all group media plus all forum threads and replies. Warning 1: cannot undo. Warning 2: images are deleted.
                Warning 3: threads and replies are deleted.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <input
                  className="form-field"
                  onChange={(event) => setDangerPassword(event.target.value)}
                  placeholder="Password"
                  type="password"
                  value={dangerPassword}
                />
                <input
                  className="form-field"
                  onChange={(event) => setDangerConfirmText(event.target.value)}
                  placeholder='Type "DELETE ALL"'
                  value={dangerConfirmText}
                />
                <button className="btn-secondary" onClick={() => purgeStorage("DELETE_ALL_CONTENT")} type="button">
                  Delete all
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="surface rounded-md p-4">
        <div className="flex flex-wrap gap-3">
          {[GroupAssetKind.PHOTO, GroupAssetKind.DOCUMENT].map((kind) => (
            <button
              className={selectedKind === kind ? "btn-primary" : "btn-secondary"}
              key={kind}
              onClick={() => changeKind(kind)}
              type="button"
            >
              {kindLabel(kind)}
            </button>
          ))}
        </div>
      </section>

      {isUploadOpen && viewerCanUpload ? (
        <section className="surface rounded-md p-6">
          <div
            className="upload-drop-zone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              addFiles(event.dataTransfer.files);
            }}
          >
            <h2 className="text-3xl font-semibold text-[var(--gold)]">Drop {kindLabel(selectedKind).toLowerCase()} here</h2>
            <p className="mt-2 text-[var(--muted)]">
              {selectedKind === GroupAssetKind.PHOTO
                ? "JPG, PNG, GIF, and WEBP images up to 10MB each."
                : "PDF, Word, Excel, PowerPoint, and text files up to 20MB each."}
            </p>
            <button className="btn-primary mt-5" onClick={() => inputRef.current?.click()} type="button">
              Choose files
            </button>
            <input
              ref={inputRef}
              accept={fileAccept(selectedKind)}
              className="hidden"
              multiple
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
              }}
              type="file"
            />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <input className="form-field" onChange={(event) => setHeadline(event.target.value)} placeholder="Optional headline" value={headline} />
            <input
              className="form-field"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional short note"
              value={description}
            />
          </div>

          {items.length > 0 ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {items.map((item) => (
                <article className="upload-item" key={item.id}>
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" src={item.previewUrl} />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-black/25 text-sm text-[var(--gold)]">
                      DOC
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate font-semibold">{item.file.name}</p>
                      <button className="btn-secondary px-3 py-1 text-xs" onClick={() => removeItem(item.id)} type="button">
                        Remove
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">{bytesLabel(item.file.size)}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
                      <div className="h-full rounded-full bg-[var(--blue)]" style={{ width: `${item.progress}%` }} />
                    </div>
                    {item.error ? <p className="mt-2 text-sm text-red-100">{item.error}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button className="btn-secondary" disabled={isUploading} onClick={() => setIsUploadOpen(false)} type="button">
              Cancel
            </button>
            <button className="btn-primary" disabled={items.length === 0 || isUploading} onClick={uploadAll} type="button">
              {isUploading ? "Uploading..." : `Upload ${kindLabel(selectedKind).toLowerCase()}`}
            </button>
          </div>
        </section>
      ) : null}

      {message ? <p className="surface rounded-md p-3 text-sm text-[var(--gold)]">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

      {visibleAssets.length === 0 ? (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No {kindLabel(selectedKind).toLowerCase()} yet</h2>
          <p className="mt-2 text-[var(--muted)]">
            {viewerCanUpload ? "Upload the first one when the group needs it." : "A moderator or provider can add group files here."}
          </p>
        </section>
      ) : null}

      <section className={selectedKind === GroupAssetKind.PHOTO ? "group-media-grid" : "grid gap-3"}>
        {visibleAssets.map((asset) => (
          <article className={selectedKind === GroupAssetKind.PHOTO ? "group-media-photo-card" : "group-media-doc-card"} key={asset.id}>
            {asset.kind === GroupAssetKind.PHOTO ? (
              <div className="group-media-photo-frame">
                {asset.publicUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={asset.publicUrl} />
                ) : (
                  <span>Photo</span>
                )}
              </div>
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-black/25 font-semibold text-[var(--gold)]">
                DOC
              </div>
            )}

            <div className="min-w-0 flex-1 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold text-[var(--gold)]">{asset.headline || asset.originalName || "Untitled"}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    by {asset.uploader.displayName} - {new Date(asset.createdAt).toLocaleDateString()} - {bytesLabel(asset.sizeBytes)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {asset.publicUrl ? (
                    <a className="btn-secondary px-3 py-2 text-sm" href={asset.publicUrl} rel="noreferrer" target="_blank">
                      Open
                    </a>
                  ) : null}
                  {asset.viewerCanDelete ? (
                    <button className="btn-secondary px-3 py-2 text-sm" onClick={() => deleteAsset(asset.id)} type="button">
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
              {asset.description ? <p className="mt-3 leading-7 text-[var(--muted)]">{asset.description}</p> : null}

              <div className="mt-4 grid gap-2">
                {asset.comments.map((comment) => (
                  <div className="comment-bubble" key={comment.id}>
                    <p className="text-sm font-semibold text-[var(--gold)]">{comment.author.displayName}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{comment.body}</p>
                  </div>
                ))}
                {asset.commentCount > asset.comments.length ? (
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                    Showing {asset.comments.length} of {asset.commentCount} comments
                  </p>
                ) : null}
              </div>

              {viewerCanComment ? (
                <form className="mt-4 flex gap-2" onSubmit={(event) => submitComment(event, asset.id)}>
                  <input
                    className="form-field"
                    onChange={(event) => setCommentInputs((current) => ({ ...current, [asset.id]: event.target.value }))}
                    placeholder="Add a comment..."
                    value={commentInputs[asset.id] ?? ""}
                  />
                  <button className="btn-secondary" type="submit">
                    Send
                  </button>
                </form>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
