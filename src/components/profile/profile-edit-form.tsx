"use client";

import { MediaVisibility, ProfileVisibility } from "@prisma/client";
import { useRouter } from "next/navigation";
import { type FormEvent, type PointerEvent, useRef, useState, useTransition } from "react";
import { requestProfileMedia } from "@/components/gallery/profile-media-request";
import { CityLocationAutocomplete } from "@/components/location/city-location-autocomplete";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import {
  avatarFrameDefaults,
  avatarFrameLimits,
  avatarImageStyle,
  clampAvatarFrameCenter,
  getAvatarFrameZone
} from "@/modules/profile-identity/avatar-frame";
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
): Promise<{ assetId: string; mediaUrl: string }> {
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

  return {
    assetId: complete.asset.id,
    mediaUrl: `/api/media/assets/${encodeURIComponent(complete.asset.id)}`
  };
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
  const [avatarFocalX, setAvatarFocalX] = useState(profile.avatarFocalX);
  const [avatarFocalY, setAvatarFocalY] = useState(profile.avatarFocalY);
  const [avatarZoom, setAvatarZoom] = useState(profile.avatarZoom);
  const [avatarFrameShape, setAvatarFrameShape] = useState(profile.avatarFrameShape);
  const [isDraggingAvatarFrame, setIsDraggingAvatarFrame] = useState(false);
  const [bannerUrl, setBannerUrl] = useState(profile.bannerUrl ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const avatarZone = getAvatarFrameZone({ avatarFocalX, avatarFocalY, avatarFrameShape, avatarZoom });
  const avatarPreviewStyle = avatarImageStyle({ avatarFocalX, avatarFocalY, avatarFrameShape, avatarZoom });

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
      const uploadedAsset = await uploadAvatarOrBanner(file, {
        fileNamePrefix: `${type}-${Date.now()}`,
        onProgress: (progress) => {
          if (type === "avatar") {
            setAvatarUpload({ fileName: file.name, progress, status: "uploading" });
          } else {
            setBannerUpload({ fileName: file.name, progress, status: "uploading" });
          }
        }
      });
      const profileMedia = await requestProfileMedia({
        mediaAssetId: uploadedAsset.assetId,
        target: type
      });
      if (!profileMedia.ok) {
        throw new Error(profileMedia.error);
      }

      if (type === "avatar") {
        setAvatarUrl(uploadedAsset.mediaUrl);
        setAvatarFocalX(avatarFrameDefaults.focalX);
        setAvatarFocalY(avatarFrameDefaults.focalY);
        setAvatarZoom(avatarFrameDefaults.zoom);
        setAvatarFrameShape(avatarFrameDefaults.frameShape);
        setAvatarUpload({ fileName: file.name, progress: 100, status: "done" });
        setMessage("Avatar updated.");
      } else {
        setBannerUrl(uploadedAsset.mediaUrl);
        setBannerUpload({ fileName: file.name, progress: 100, status: "done" });
        setMessage("Banner updated.");
      }
      router.refresh();
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

  function setAvatarFrameCenter(x: number, y: number, nextZoom = avatarZoom, nextFrameShape = avatarFrameShape) {
    const center = clampAvatarFrameCenter(x, y, {
      avatarFrameShape: nextFrameShape,
      avatarZoom: nextZoom
    });
    setAvatarFocalX(center.x);
    setAvatarFocalY(center.y);
  }

  function setAvatarFrameZoom(nextZoom: number) {
    setAvatarZoom(nextZoom);
    setAvatarFrameCenter(avatarFocalX, avatarFocalY, nextZoom, avatarFrameShape);
  }

  function setAvatarFrameShapeValue(nextFrameShape: number) {
    setAvatarFrameShape(nextFrameShape);
    setAvatarFrameCenter(avatarFocalX, avatarFocalY, avatarZoom, nextFrameShape);
  }

  function updateAvatarFrameFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setAvatarFrameCenter(x, y);
  }

  function nudgeAvatarFrame(deltaX: number, deltaY: number) {
    setAvatarFrameCenter(avatarFocalX + deltaX, avatarFocalY + deltaY);
  }

  function resetAvatarFrame() {
    setAvatarFocalX(avatarFrameDefaults.focalX);
    setAvatarFocalY(avatarFrameDefaults.focalY);
    setAvatarZoom(avatarFrameDefaults.zoom);
    setAvatarFrameShape(avatarFrameDefaults.frameShape);
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
          avatarFocalX,
          avatarFocalY,
          avatarZoom,
          avatarFrameShape,
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
            <div className="profile-avatar-reframe">
              <div className="profile-avatar-crop-workspace">
                <div
                  aria-label="Avatar framing zone"
                  className={isDraggingAvatarFrame ? "profile-avatar-crop-stage is-dragging" : "profile-avatar-crop-stage"}
                  onPointerCancel={() => setIsDraggingAvatarFrame(false)}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setIsDraggingAvatarFrame(true);
                    updateAvatarFrameFromPointer(event);
                  }}
                  onPointerMove={(event) => {
                    if (isDraggingAvatarFrame) {
                      updateAvatarFrameFromPointer(event);
                    }
                  }}
                  onPointerUp={(event) => {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    setIsDraggingAvatarFrame(false);
                  }}
                  role="application"
                  tabIndex={0}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" className="profile-avatar-crop-source" draggable={false} src={avatarUrl} />
                  <div
                    aria-hidden="true"
                    className="profile-avatar-crop-zone"
                    style={{
                      height: `${avatarZone.height}%`,
                      left: `${avatarZone.left}%`,
                      top: `${avatarZone.top}%`,
                      width: `${avatarZone.width}%`
                    }}
                  >
                    <span className="profile-avatar-crop-crosshair" />
                    <span className="profile-avatar-crop-handle profile-avatar-crop-handle--nw" />
                    <span className="profile-avatar-crop-handle profile-avatar-crop-handle--ne" />
                    <span className="profile-avatar-crop-handle profile-avatar-crop-handle--sw" />
                    <span className="profile-avatar-crop-handle profile-avatar-crop-handle--se" />
                  </div>
                </div>
                <div className="profile-avatar-preview-panel">
                  <span className="form-label">Preview</span>
                  <span className="profile-avatar-preview-frame">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" draggable={false} src={avatarUrl} style={avatarPreviewStyle} />
                  </span>
                </div>
              </div>
              <div className="profile-avatar-frame-controls">
                <label className="grid gap-2">
                  <span className="form-label">Frame size</span>
                  <input
                    aria-label="Avatar selected zone size"
                    max={avatarFrameLimits.zoomMax}
                    min={avatarFrameLimits.zoomMin}
                    onChange={(event) => setAvatarFrameZoom(Number(event.target.value))}
                    type="range"
                    value={avatarZoom}
                  />
                  <span className="profile-avatar-frame-value">{avatarZone.selectedPercent}% selected</span>
                </label>
                <label className="grid gap-2">
                  <span className="form-label">Frame shape</span>
                  <input
                    aria-label="Avatar frame shape"
                    max={avatarFrameLimits.frameShapeMax}
                    min={avatarFrameLimits.frameShapeMin}
                    onChange={(event) => setAvatarFrameShapeValue(Number(event.target.value))}
                    type="range"
                    value={avatarFrameShape}
                  />
                  <span className="profile-avatar-frame-value">
                    {avatarFrameShape === 100 ? "Square" : avatarFrameShape > 100 ? "Slightly wide" : "Slightly tall"}
                  </span>
                </label>
                <div className="profile-avatar-nudge-grid" aria-label="Move avatar frame">
                  <button aria-label="Move frame up" onClick={() => nudgeAvatarFrame(0, -3)} type="button">^</button>
                  <button aria-label="Move frame left" onClick={() => nudgeAvatarFrame(-3, 0)} type="button">&lt;</button>
                  <button aria-label="Move frame right" onClick={() => nudgeAvatarFrame(3, 0)} type="button">&gt;</button>
                  <button aria-label="Move frame down" onClick={() => nudgeAvatarFrame(0, 3)} type="button">v</button>
                </div>
                <button className="btn-secondary" onClick={resetAvatarFrame} type="button">
                  Reset frame
                </button>
              </div>
            </div>
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
