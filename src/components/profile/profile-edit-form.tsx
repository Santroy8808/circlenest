"use client";

import { MediaVisibility, ProfileVisibility } from "@prisma/client";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState, useTransition } from "react";
import { CityLocationAutocomplete } from "@/components/location/city-location-autocomplete";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import type { ProfileCardView } from "@/modules/profile-identity/types";

type UploadState = {
  fileName: string;
  status: "idle" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
};

async function uploadAvatarOrBanner(
  file: File,
  options: { fileNamePrefix: string; onProgress: (progress: number) => void }
): Promise<string> {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
    throw new Error("Use a JPG, PNG, or WEBP image.");
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image must be 8MB or smaller.");
  }

  const intentResponse = await fetch("/api/media/upload-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: `${options.fileNamePrefix}-${file.name}`,
      mimeType: file.type,
      sizeBytes: file.size,
      visibility: MediaVisibility.PRIVATE,
      source: "PROFILE_MEDIA"
    })
  });

  const intent = (await intentResponse.json()) as {
    error?: string;
    intentId?: string;
    uploadUrl?: string;
    uploadHeaders?: Record<string, string>;
    storageKey?: string;
  };

  if (!intentResponse.ok || !intent.intentId || !intent.uploadUrl || !intent.uploadHeaders || !intent.storageKey) {
    throw new Error(intent.error ?? "Could not prepare upload.");
  }

  await uploadWithResilientFallback({
    uploadUrl: intent.uploadUrl,
    storageKey: intent.storageKey,
    uploadHeaders: intent.uploadHeaders,
    file,
    onProgress: options.onProgress
  });

  const completeResponse = await fetch("/api/media/complete-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intentId: intent.intentId,
      storageKey: intent.storageKey,
      fileName: `${options.fileNamePrefix}-${file.name}`,
      mimeType: file.type,
      sizeBytes: file.size,
      visibility: MediaVisibility.PRIVATE,
      source: "PROFILE_MEDIA",
      tags: []
    })
  });

  const complete = (await completeResponse.json()) as { error?: string; asset?: { id: string; publicUrl?: string | null } };

  if (!completeResponse.ok || !complete.asset?.id) {
    throw new Error(complete.error ?? "Could not save upload record.");
  }

  return complete.asset.publicUrl ?? `/api/media/assets/${complete.asset.id}`;
}

export function ProfileEditForm({ profile, nextPath }: { profile: ProfileCardView; nextPath: string }) {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [avatarUpload, setAvatarUpload] = useState<UploadState>({ fileName: "", progress: 0, status: "idle" });
  const [bannerUpload, setBannerUpload] = useState<UploadState>({ fileName: "", progress: 0, status: "idle" });
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(profile.bannerUrl ?? "");
  const [location, setLocation] = useState(profile.location ?? "");

  function resetInput(ref: { current: HTMLInputElement | null }) {
    if (ref.current) {
      ref.current.value = "";
    }
  }

  async function handleImageUpload(file: File, type: "avatar" | "banner") {
    if (type === "avatar") {
      setAvatarUpload({ fileName: file.name, progress: 1, status: "uploading" });
      setError("");
      setMessage("");
    } else {
      setBannerUpload({ fileName: file.name, progress: 1, status: "uploading" });
      setError("");
      setMessage("");
    }

    try {
      const publicUrl = await uploadAvatarOrBanner(file, {
        fileNamePrefix: `${type}-${Date.now()}`,
        onProgress: (progress) => {
          if (type === "avatar") {
            setAvatarUpload({ fileName: file.name, progress, status: "uploading" });
          } else {
            setBannerUpload({ fileName: file.name, progress, status: "uploading" });
          }
        }
      });

      if (type === "avatar") {
        setAvatarUrl(publicUrl);
        setAvatarUpload({ fileName: file.name, progress: 100, status: "done" });
      } else {
        setBannerUrl(publicUrl);
        setBannerUpload({ fileName: file.name, progress: 100, status: "done" });
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not upload image.";
      if (type === "avatar") {
        setAvatarUpload({ fileName: file.name, progress: 0, status: "error", error: message });
      } else {
        setBannerUpload({ fileName: file.name, progress: 0, status: "error", error: message });
      }
    } finally {
      if (type === "avatar") {
        resetInput(avatarInputRef);
      } else {
        resetInput(bannerInputRef);
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
          location,
          avatarUrl,
          bannerUrl,
          visibility: formData.get("visibility"),
          allowProfilePosts: formData.get("allowProfilePosts") === "on"
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not update profile.");
        return;
      }

      setMessage("Profile updated.");
      if (nextPath) {
        router.push(nextPath);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form className="surface grid gap-4 rounded-md p-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Display name</span>
          <input className="form-field" name="displayName" defaultValue={profile.displayName} required />
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

      <label className="grid gap-2">
        <span className="form-label">Tagline</span>
        <input className="form-field" name="tagline" defaultValue={profile.tagline ?? ""} />
      </label>

      <label className="grid gap-2">
        <span className="form-label">Bio</span>
        <textarea className="form-field min-h-40 resize-y" name="bio" defaultValue={profile.bio ?? ""} />
      </label>

      <CityLocationAutocomplete
        helperText="Select the closest city-level match. Street addresses are not used."
        label="Location"
        name="location"
        onChange={setLocation}
        placeholder="Start typing your city..."
        value={location}
      />

      <label className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-black/10 p-4">
        <input
          className="mt-1"
          defaultChecked={profile.allowProfilePosts}
          name="allowProfilePosts"
          type="checkbox"
        />
        <span>
          <span className="form-label block">Allow profile posts</span>
          <span className="text-sm text-[var(--muted)]">
            Friends and family can post directly onto your profile stream when this is enabled.
          </span>
        </span>
      </label>

      <section className="grid gap-4 rounded-md border border-[var(--line)] bg-black/10 p-4 md:grid-cols-2">
        <div className="grid gap-3">
          <span className="form-label">Avatar</span>
          <p className="text-sm text-[var(--muted)]">JPG, PNG, or WEBP, up to 8MB.</p>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => {
              avatarInputRef.current?.click();
            }}
          >
            Upload avatar
          </button>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            ref={avatarInputRef}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImageUpload(file, "avatar");
              }
            }}
          />
          {avatarUpload.status !== "idle" ? (
            <p className="text-sm text-[var(--muted)]">
              Avatar {avatarUpload.status === "uploading" ? `${avatarUpload.progress}%` : avatarUpload.status}
            </p>
          ) : null}
          {avatarUpload.error ? <p className="text-sm text-red-100">{avatarUpload.error}</p> : null}
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Avatar preview" className="h-20 w-20 rounded-full object-cover" src={avatarUrl} />
          ) : null}
        </div>

        <div className="grid gap-3">
          <span className="form-label">Banner</span>
          <p className="text-sm text-[var(--muted)]">JPG, PNG, or WEBP, up to 8MB.</p>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => {
              bannerInputRef.current?.click();
            }}
          >
            Upload banner
          </button>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            ref={bannerInputRef}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImageUpload(file, "banner");
              }
            }}
          />
          {bannerUpload.status !== "idle" ? (
            <p className="text-sm text-[var(--muted)]">
              Banner {bannerUpload.status === "uploading" ? `${bannerUpload.progress}%` : bannerUpload.status}
            </p>
          ) : null}
          {bannerUpload.error ? <p className="text-sm text-red-100">{bannerUpload.error}</p> : null}
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Banner preview" className="h-16 w-full object-cover rounded-md" src={bannerUrl} />
          ) : null}
        </div>
      </section>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      {message ? <p className="rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">{message}</p> : null}
      <button className="btn-primary" disabled={isPending} type="submit">
        {isPending ? "Saving..." : "Save profile"}
      </button>
    </form>
  );
}
