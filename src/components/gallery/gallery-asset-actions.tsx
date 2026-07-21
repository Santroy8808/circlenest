"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { promptForDeletePassword } from "@/lib/client/delete-password";
import { requestGalleryAssetDeletion } from "./gallery-deletion-request";
import { requestProfileMedia, type ProfileMediaTarget } from "./profile-media-request";

export function GalleryAssetActions({ mediaAssetId }: { mediaAssetId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeTarget, setActiveTarget] = useState<"avatar" | "banner" | "delete" | null>(null);
  const [pendingTarget, setPendingTarget] = useState<"avatar" | "banner" | "delete" | null>(null);
  const isPending = pendingTarget !== null;

  async function setProfileMedia(target: ProfileMediaTarget) {
    setError("");
    setMessage("");
    setActiveTarget(target);
    setPendingTarget(target);

    try {
      const result = await requestProfileMedia({ mediaAssetId, target });
      if (!result.ok) {
        setError(result.error);
        setActiveTarget(null);
        return;
      }

      setMessage(target === "avatar" ? "Done! Avatar pic" : "Done! Banner pic");
      setActiveTarget(target);
      router.refresh();
    } catch {
      setError("Could not update profile image. Please try again.");
      setActiveTarget(null);
    } finally {
      setPendingTarget(null);
    }
  }

  async function deletePhoto() {
    setError("");
    setMessage("");
    setActiveTarget("delete");

    if (!window.confirm("Delete this photo from My Pics?")) {
      setActiveTarget(null);
      return;
    }
    const deletePassword = promptForDeletePassword();
    if (!deletePassword) {
      setError("Photo deletion cancelled. DELETE password was not entered.");
      setActiveTarget(null);
      return;
    }

    setPendingTarget("delete");
    try {
      const result = await requestGalleryAssetDeletion({
        mediaAssetIds: [mediaAssetId],
        deletePassword
      });
      if (!result.ok) {
        setError(result.error);
        setActiveTarget(null);
        return;
      }

      router.push(`/profile/gallery?deletionRequest=${encodeURIComponent(result.destructiveActionRequestId)}`);
    } catch {
      setError("Could not delete photo. Please try again.");
      setActiveTarget(null);
    } finally {
      setPendingTarget(null);
    }
  }

  return (
    <section className="surface rounded-md p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Use this photo</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="btn-primary" disabled={isPending} onClick={() => void setProfileMedia("avatar")} type="button">
          {activeTarget === "avatar" && message ? "Avatar pic" : pendingTarget === "avatar" ? "Setting..." : "Set as avatar"}
        </button>
        <button className="btn-secondary" disabled={isPending} onClick={() => void setProfileMedia("banner")} type="button">
          {activeTarget === "banner" && message ? "Banner pic" : pendingTarget === "banner" ? "Setting..." : "Set as banner"}
        </button>
      </div>
      <div className="mt-4 border-t border-[var(--line)] pt-4">
        <button className="btn-secondary" disabled={isPending} onClick={() => void deletePhoto()} type="button">
          {pendingTarget === "delete" ? "Queueing..." : "Delete photo"}
        </button>
      </div>
      {message ? <p aria-live="polite" className="gallery-feedback gallery-feedback--success mt-4" role="status">{message}</p> : null}
      {error ? <p className="gallery-feedback gallery-feedback--error mt-4" role="alert">{error}</p> : null}
    </section>
  );
}
