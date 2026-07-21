"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { promptForDeletePassword } from "@/lib/client/delete-password";
import { requestGalleryAssetDeletion } from "./gallery-deletion-request";

export type GalleryDeletionQueueItem = {
  id: string;
  status: "queued" | "running" | "failed" | "cancelled";
  mediaAssetIds: string[];
  failureReason?: string;
};

function statusCopy(item: GalleryDeletionQueueItem) {
  const count = item.mediaAssetIds.length;
  if (count === 0) {
    return item.status === "failed" || item.status === "cancelled"
      ? "Hidden photos need attention before secure deletion can continue."
      : "Hidden photos are waiting for secure storage removal verification.";
  }
  const photos = `${count} photo${count === 1 ? "" : "s"}`;

  if (item.status === "failed" || item.status === "cancelled") {
    return `${photos} ${count === 1 ? "remains" : "remain"} hidden because secure deletion needs attention.`;
  }
  return `${photos} ${count === 1 ? "is" : "are"} hidden while secure storage removal is verified.`;
}

export function GalleryDeletionQueue({ requests }: { requests: GalleryDeletionQueueItem[] }) {
  const router = useRouter();
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const hasActiveRequest = requests.some((request) => request.status === "queued" || request.status === "running");
  const requestStatusSignature = requests.map((request) => `${request.id}:${request.status}`).join("|");

  useEffect(() => {
    setMessage("");
    setError("");
  }, [requestStatusSignature]);

  useEffect(() => {
    if (!hasActiveRequest) return;
    const timer = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [hasActiveRequest, router]);

  if (requests.length === 0) return null;

  async function retry(request: GalleryDeletionQueueItem) {
    setError("");
    setMessage("");
    if (!window.confirm("Retry permanent deletion for these hidden photos?")) return;

    const deletePassword = promptForDeletePassword();
    if (!deletePassword) {
      setError("Deletion retry cancelled. DELETE password was not entered.");
      return;
    }

    setPendingRequestId(request.id);
    try {
      const result = await requestGalleryAssetDeletion({
        mediaAssetIds: request.mediaAssetIds,
        deletePassword
      });
      if (!result.ok || result.destructiveActionRequestId !== request.id) {
        setError(result.ok ? "Could not verify the deletion retry. Please try again." : result.error);
        return;
      }

      setMessage("Deletion retry queued. The photos remain hidden while storage removal is verified.");
      router.replace(`/profile/gallery?deletionRequest=${encodeURIComponent(request.id)}`);
      router.refresh();
    } catch {
      setError("Could not retry photo deletion. Please try again.");
    } finally {
      setPendingRequestId(null);
    }
  }

  return (
    <section aria-labelledby="gallery-deletion-queue-heading" className="surface mb-5 rounded-md p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-[var(--gold)]" id="gallery-deletion-queue-heading">Secure deletion</h2>
      <div className="mt-3 grid gap-3">
        {requests.map((request) => {
          const needsAttention = request.status === "failed" || request.status === "cancelled";
          return (
            <div className="gallery-deletion-queue-item" key={request.id}>
              <div>
                <p className="font-semibold">{needsAttention ? "Action needed" : request.status === "running" ? "Removing photos" : "Deletion queued"}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{statusCopy(request)}</p>
                {needsAttention && request.failureReason ? <p className="mt-1 text-sm text-[var(--text)]">{request.failureReason}</p> : null}
              </div>
              {needsAttention && request.mediaAssetIds.length > 0 ? (
                <button
                  aria-busy={pendingRequestId === request.id}
                  className="btn-secondary"
                  disabled={pendingRequestId !== null}
                  onClick={() => void retry(request)}
                  type="button"
                >
                  {pendingRequestId === request.id ? "Queueing..." : "Retry"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {message ? <p aria-live="polite" className="gallery-feedback gallery-feedback--success mt-4" role="status">{message}</p> : null}
      {error ? <p className="gallery-feedback gallery-feedback--error mt-4" role="alert">{error}</p> : null}
    </section>
  );
}
