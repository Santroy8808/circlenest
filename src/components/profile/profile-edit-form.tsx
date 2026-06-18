"use client";

import { ProfileVisibility } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ProfileCardView } from "@/modules/profile-identity/types";

export function ProfileEditForm({ profile }: { profile: ProfileCardView }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: formData.get("displayName"),
          tagline: formData.get("tagline"),
          bio: formData.get("bio"),
          location: formData.get("location"),
          avatarUrl: formData.get("avatarUrl"),
          bannerUrl: formData.get("bannerUrl"),
          visibility: formData.get("visibility")
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not update profile.");
        return;
      }

      setMessage("Profile updated.");
      router.refresh();
    });
  }

  return (
    <form className="surface grid gap-4 rounded-md p-5" onSubmit={handleSubmit}>
      <label className="grid gap-2">
        <span className="form-label">Display name</span>
        <input className="form-field" name="displayName" defaultValue={profile.displayName} required />
      </label>
      <label className="grid gap-2">
        <span className="form-label">Tagline</span>
        <input className="form-field" name="tagline" defaultValue={profile.tagline ?? ""} />
      </label>
      <label className="grid gap-2">
        <span className="form-label">Bio</span>
        <textarea className="form-field min-h-40 resize-y" name="bio" defaultValue={profile.bio ?? ""} />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Location</span>
          <input className="form-field" name="location" defaultValue={profile.location ?? ""} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Visibility</span>
          <select className="form-field" name="visibility" defaultValue={profile.visibility}>
            <option value={ProfileVisibility.PRIVATE}>Private</option>
            <option value={ProfileVisibility.MEMBERS}>Members</option>
            <option value={ProfileVisibility.PUBLIC}>Public</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Avatar URL</span>
          <input className="form-field" name="avatarUrl" defaultValue={profile.avatarUrl ?? ""} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Banner URL</span>
          <input className="form-field" name="bannerUrl" defaultValue={profile.bannerUrl ?? ""} />
        </label>
      </div>
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      {message ? <p className="rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">{message}</p> : null}
      <button className="btn-primary" disabled={isPending} type="submit">
        {isPending ? "Saving..." : "Save profile"}
      </button>
    </form>
  );
}
