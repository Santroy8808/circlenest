"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ThetaLoading } from "@/components/platform/theta-loading";

export type MembershipStorageArchivePanelView = {
  id: string;
  status: "QUEUED" | "PROCESSING" | "READY" | "FAILED";
  selectedAssetCount: number;
  originalBytes: string;
  archivedBytes: string;
  downloadStatus: "QUEUED" | "PROCESSING" | "READY" | "FAILED";
  downloadExpiresAt: string | null;
  downloadReady: boolean;
  items: Array<{
    id: string;
    mediaAssetId: string;
    originalName: string | null;
    originalMimeType: string;
    status: "QUEUED" | "PROCESSING" | "READY" | "FAILED";
    viewStatus: "QUEUED" | "PROCESSING" | "READY" | "FAILED";
    viewExpiresAt: string | null;
    readyForView: boolean;
  }>;
};

function bytes(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "0 MB";
  if (parsed >= 1024 * 1024 * 1024) return `${(parsed / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(parsed / 1024 / 1024))} MB`;
}

export function MembershipStorageArchivePanel({ archive }: { archive: MembershipStorageArchivePanelView | null }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingViewItemId, setPendingViewItemId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const activePreview = archive?.items.find((item) => item.readyForView) ?? null;

  const prepareView = useCallback(async (itemId: string, polling = false) => {
    if (!polling) {
      setError("");
      setMessage("");
    }
    try {
      const response = await fetch(`/api/membership/storage-archives/items/${encodeURIComponent(itemId)}/view`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; state?: "queued" | "ready"; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setPendingViewItemId(null);
        setError(payload?.error ?? "Could not prepare this archived file.");
        return;
      }
      if (payload.state === "ready") {
        setPendingViewItemId(null);
        window.open(`/api/membership/storage-archives/items/${encodeURIComponent(itemId)}/view`, "_blank", "noopener,noreferrer");
        setMessage("Your temporary full-file view is open. Close it here when you are finished so another item can be prepared.");
        router.refresh();
        return;
      }
      setPendingViewItemId(itemId);
      if (!polling) setMessage("Theta-Space placed this full-file view in the low-priority queue. It will open when ready.");
    } catch {
      setPendingViewItemId(null);
      setError("Could not prepare this archived file. Check your connection and try again.");
    }
  }, [router]);

  useEffect(() => {
    if (!pendingViewItemId) return;
    const timer = window.setTimeout(() => {
      void prepareView(pendingViewItemId, true);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [pendingViewItemId, prepareView]);

  if (!archive) return null;
  const archiveId = archive.id;

  function releaseView() {
    if (!activePreview) return;
    startTransition(async () => {
      setError("");
      const response = await fetch(`/api/membership/storage-archives/items/${encodeURIComponent(activePreview.id)}/view`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error ?? "Could not close the prepared view.");
        return;
      }
      setMessage("Prepared view closed. You can prepare another archived item.");
      router.refresh();
    });
  }

  function requestDownload() {
    startTransition(async () => {
      setError("");
      setMessage("");
      try {
        const response = await fetch(`/api/membership/storage-archives/${encodeURIComponent(archiveId)}/download-request`, { method: "POST" });
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; state?: "queued" | "ready"; error?: string } | null;
        if (!response.ok || !payload?.ok) {
          setError(payload?.error ?? "Could not prepare the ZIP download.");
          return;
        }
        setMessage(payload.state === "ready"
          ? "Your ZIP download is ready below."
          : "Theta-Space is creating your ZIP file. A Theta-Space notification with the download link will be sent when it is ready.");
      } catch {
        setError("Could not prepare the ZIP download. Check your connection and try again.");
      }
    });
  }

  return (
    <section className="rounded-md border border-amber-400/50 bg-amber-950/20 p-5" aria-labelledby="archived-media-heading">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">Storage archive</p>
      <h2 className="mt-2 text-2xl font-semibold" id="archived-media-heading">Older files moved out of normal storage</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
        {archive.selectedAssetCount} older file{archive.selectedAssetCount === 1 ? " was" : "s were"} compressed to bring your active storage within the Free limit. Gallery shows small previews. Prepare one full-file view at a time, or request all archived items in a ZIP file.
      </p>
      <p className="mt-3 text-sm text-[var(--muted)]">Archived originals: {bytes(archive.originalBytes)}. Compressed archive: {bytes(archive.archivedBytes)}.</p>
      {message ? <p className="mt-4 rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100" role="status">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {archive.downloadReady ? (
          <a className="btn-primary" href={`/api/membership/storage-archives/${encodeURIComponent(archive.id)}/download`}>
            Download ZIP
          </a>
        ) : (
          <button className="btn-primary" disabled={isPending || archive.downloadStatus === "PROCESSING"} onClick={requestDownload} type="button">
            {isPending || archive.downloadStatus === "PROCESSING" ? <ThetaLoading inline label="Preparing ZIP" size="sm" /> : "Request ZIP download"}
          </button>
        )}
        {activePreview ? (
          <button className="btn-secondary" disabled={isPending} onClick={releaseView} type="button">
            {isPending ? <ThetaLoading inline label="Closing" size="sm" /> : "Close prepared view"}
          </button>
        ) : null}
      </div>
      {archive.downloadReady && archive.downloadExpiresAt ? <p className="mt-2 text-xs text-[var(--muted)]">ZIP download available until {new Date(archive.downloadExpiresAt).toLocaleString()}.</p> : null}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {archive.items.map((item) => (
          <article className="flex gap-3 rounded-md border border-[var(--line)] p-3" key={item.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Archived file preview" className="h-16 w-16 rounded object-cover" src={`/api/media/assets/${encodeURIComponent(item.mediaAssetId)}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{item.originalName ?? "Archived file"}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{item.status === "READY" ? "Thumbnail only" : item.status.toLowerCase()}</p>
              <button
                className="btn-secondary mt-2"
                disabled={Boolean(activePreview && activePreview.id !== item.id) || pendingViewItemId === item.id || item.status !== "READY"}
                onClick={() => void prepareView(item.id)}
                type="button"
              >
                {pendingViewItemId === item.id ? <ThetaLoading inline label="Queued" size="sm" /> : item.readyForView ? "Open prepared view" : "Prepare full view"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
