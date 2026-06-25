"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function GalleryAssetActions({ mediaAssetId }: { mediaAssetId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeTarget, setActiveTarget] = useState<"avatar" | "banner" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();

  function setProfileMedia(target: "avatar" | "banner") {
    setError("");
    setMessage("");
    setActiveTarget(target);

    startTransition(async () => {
      const response = await fetch("/api/profile/media", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaAssetId, target })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not update profile image.");
        setActiveTarget(null);
        return;
      }

      setMessage(target === "avatar" ? "Done! Avatar pic" : "Done! Banner pic");
      setActiveTarget(target);
      router.refresh();
    });
  }

  function deletePhoto() {
    setError("");
    setMessage("");
    setActiveTarget("delete");

    if (!window.confirm("Delete this photo from My Pics?")) {
      setActiveTarget(null);
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/media/assets/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaAssetIds: [mediaAssetId] })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not delete photo.");
        setActiveTarget(null);
        return;
      }

      router.push("/profile/gallery");
      router.refresh();
    });
  }

  return (
    <section className="surface rounded-md p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Use this photo</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="btn-primary" disabled={isPending} onClick={() => setProfileMedia("avatar")} type="button">
          {activeTarget === "avatar" && message ? "Avatar pic" : isPending && activeTarget === "avatar" ? "Setting..." : "Set as avatar"}
        </button>
        <button className="btn-secondary" disabled={isPending} onClick={() => setProfileMedia("banner")} type="button">
          {activeTarget === "banner" && message ? "Banner pic" : isPending && activeTarget === "banner" ? "Setting..." : "Set as banner"}
        </button>
      </div>
      <div className="mt-4 border-t border-[var(--line)] pt-4">
        <button className="btn-secondary" disabled={isPending} onClick={deletePhoto} type="button">
          {isPending && activeTarget === "delete" ? "Deleting..." : "Delete photo"}
        </button>
      </div>
      {message ? <p className="mt-4 rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
    </section>
  );
}
