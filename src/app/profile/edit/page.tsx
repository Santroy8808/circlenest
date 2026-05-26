"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";

async function uploadImage(file: File): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) return null;
  const body = (await res.json()) as { url?: string };
  return body.url ?? null;
}

export default function EditProfilePage() {
  const [status, setStatus] = useState<string>("");

  return (
    <AppShell>
      <div className="card p-6">
        <h1 className="mb-4 text-xl font-semibold">Edit Profile</h1>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setStatus("Saving...");
            const form = new FormData(e.currentTarget);

            const avatarFile = form.get("avatar") as File | null;
            const bannerFile = form.get("banner") as File | null;
            const avatarUrl = avatarFile && avatarFile.size > 0 ? await uploadImage(avatarFile) : null;
            const bannerUrl = bannerFile && bannerFile.size > 0 ? await uploadImage(bannerFile) : null;

            const res = await fetch("/api/profile", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                displayName: form.get("displayName"),
                bio: form.get("bio"),
                location: form.get("location"),
                backupEmail: form.get("backupEmail"),
                interests: form.get("interests"),
                relationshipStatus: form.get("relationshipStatus"),
                avatarUrl,
                bannerUrl,
              }),
            });
            setStatus(res.ok ? "Saved." : "Failed to save.");
          }}
        >
          <input name="displayName" placeholder="Display name" className="rounded-lg border border-slate-300 px-3 py-2" />
          <textarea name="bio" placeholder="Bio" className="rounded-lg border border-slate-300 px-3 py-2" />
          <input name="location" placeholder="Location" className="rounded-lg border border-slate-300 px-3 py-2" />
          <input name="backupEmail" type="email" placeholder="Backup email (for account recovery)" className="rounded-lg border border-slate-300 px-3 py-2" />
          <input name="interests" placeholder="Interests" className="rounded-lg border border-slate-300 px-3 py-2" />
          <input name="relationshipStatus" placeholder="Relationship status" className="rounded-lg border border-slate-300 px-3 py-2" />
          <label className="text-sm">Avatar image</label>
          <input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" className="rounded-lg border border-slate-300 px-3 py-2" />
          <label className="text-sm">Banner image</label>
          <input name="banner" type="file" accept="image/png,image/jpeg,image/webp" className="rounded-lg border border-slate-300 px-3 py-2" />
          <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-white">Save</button>
          {status ? <p className="text-sm text-slate-600">{status}</p> : null}
        </form>
      </div>
    </AppShell>
  );
}
