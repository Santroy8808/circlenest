"use client";

import { BusinessProfileKind, MediaVisibility } from "@prisma/client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { inlineImageToken, StorefrontDescriptionContent } from "@/components/business-storefront/storefront-description-content";
import { CityLocationAutocomplete } from "@/components/location/city-location-autocomplete";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import type { BusinessCenterView, BusinessProfileView } from "@/modules/business-storefront/types";

type FormState = {
  businessName: string;
  contactPersonName: string;
  tagline: string;
  description: string;
  location: string;
  publicEmail: string;
  phone: string;
  website: string;
  logoUrl: string;
  bannerUrl: string;
  heroImageUrl: string;
  galleryImageUrls: string[];
  blogEnabled: boolean;
  forumEnabled: boolean;
  forumAllowPictureUploads: boolean;
  publicStorefrontEnabled: boolean;
};

type UploadState = {
  fileName: string;
  progress: number;
  status: "idle" | "uploading" | "done" | "error";
  error?: string;
};

type ImageUploadTarget = "banner" | "body";

function initialForm(profile: BusinessProfileView | null): FormState {
  return {
    businessName: profile?.businessName ?? "",
    contactPersonName: profile?.contactPersonName ?? "",
    tagline: profile?.tagline ?? "",
    description: profile?.description ?? "",
    location: profile?.location ?? "",
    publicEmail: profile?.publicEmail ?? "",
    phone: profile?.phone ?? "",
    website: profile?.website ?? "",
    logoUrl: profile?.logoUrl ?? "",
    bannerUrl: profile?.bannerUrl ?? "",
    heroImageUrl: "",
    galleryImageUrls: profile?.galleryImageUrls ?? [],
    blogEnabled: profile?.blogEnabled ?? false,
    forumEnabled: profile?.forumEnabled ?? false,
    forumAllowPictureUploads: profile?.forumAllowPictureUploads ?? false,
    publicStorefrontEnabled: profile?.publicStorefrontEnabled ?? false
  };
}

export function BusinessCenterClient({ businessCenter, canUseWriters }: { businessCenter: BusinessCenterView; canUseWriters: boolean }) {
  const bannerImageInputRef = useRef<HTMLInputElement>(null);
  const bodyImageInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [profile, setProfile] = useState(businessCenter.profile);
  const [form, setForm] = useState<FormState>(() => initialForm(businessCenter.profile));
  const [bannerUpload, setBannerUpload] = useState<UploadState>({ fileName: "", progress: 0, status: "idle" });
  const [bodyUpload, setBodyUpload] = useState<UploadState>({ fileName: "", progress: 0, status: "idle" });
  const [bodyImageUrlInput, setBodyImageUrlInput] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(businessCenter.canManage ? "" : businessCenter.reason ?? "Business profile access required.");
  const [isPending, startTransition] = useTransition();
  const isOrgProfile = businessCenter.profileKind === BusinessProfileKind.ORG;
  const centerLabel = isOrgProfile ? "Org Center" : "Business Center";
  const entityLabel = isOrgProfile ? "Org" : "Business";

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setUploadStateFor(target: ImageUploadTarget, value: UploadState) {
    if (target === "banner") {
      setBannerUpload(value);
    } else {
      setBodyUpload(value);
    }
  }

  function insertBodyImage(imageIndex: number, align: "left" | "center" | "right") {
    const token = inlineImageToken(imageIndex, align);
    const textarea = descriptionRef.current;
    const insertion = `\n\n${token}\n\n`;

    if (!textarea) {
      update("description", `${form.description.trimEnd()}${insertion}`);
      return;
    }

    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const nextDescription = `${form.description.slice(0, selectionStart)}${insertion}${form.description.slice(selectionEnd)}`;
    update("description", nextDescription);

    window.requestAnimationFrame(() => {
      textarea.focus();
      const nextCursor = selectionStart + insertion.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function addBodyImageUrl(url: string, insertAtCursor = true) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    const nextImages = [...form.galleryImageUrls, trimmedUrl].slice(0, 12);
    const imageIndex = nextImages.length - 1;
    update("galleryImageUrls", nextImages);
    if (insertAtCursor) insertBodyImage(imageIndex, "center");
  }

  function removeBodyImage(imageIndex: number) {
    update("galleryImageUrls", form.galleryImageUrls.filter((_, index) => index !== imageIndex));
    const removedImageNumber = imageIndex + 1;
    const nextDescription = form.description
      .replace(/^\s*\[image:(\d+)(?:\s+align=(left|center|right))?\]\s*$/gim, (match, rawIndex: string, align?: string) => {
        const tokenImageNumber = Number(rawIndex);
        if (tokenImageNumber === removedImageNumber) return "";
        if (tokenImageNumber > removedImageNumber) return inlineImageToken(tokenImageNumber - 2, align === "left" || align === "right" ? align : "center");
        return match.trim();
      })
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    update("description", nextDescription);
  }

  async function uploadBusinessImage(file: File, target: ImageUploadTarget) {
    setError("");
    setMessage("");

    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setUploadStateFor(target, { fileName: file.name, progress: 0, status: "error", error: "Use a JPG, PNG, or WEBP image." });
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setUploadStateFor(target, { fileName: file.name, progress: 0, status: "error", error: "Image must be 15MB or smaller." });
      return;
    }

    if (target === "body" && form.galleryImageUrls.length >= 12) {
      setUploadStateFor(target, { fileName: file.name, progress: 0, status: "error", error: "Body images are limited to 12 per storefront." });
      return;
    }

    try {
      setUploadStateFor(target, { fileName: file.name, progress: 1, status: "uploading" });
      const intentResponse = await fetch("/api/media/upload-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          visibility: MediaVisibility.PUBLIC,
          source: "BUSINESS_MEDIA"
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
        throw new Error(intent.error ?? "Could not prepare image upload.");
      }

      await uploadWithResilientFallback({
        uploadUrl: intent.uploadUrl,
        storageKey: intent.storageKey,
        uploadHeaders: intent.uploadHeaders,
        file,
        onProgress: (progress) => setUploadStateFor(target, { fileName: file.name, progress, status: "uploading" }),
        proxyFallback: {
          url: "/api/media/proxy-upload",
          access: "public"
        }
      });

      const completeResponse = await fetch("/api/media/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentId: intent.intentId,
          storageKey: intent.storageKey,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          visibility: MediaVisibility.PUBLIC,
          source: "BUSINESS_MEDIA",
          tags: target === "banner" ? ["storefront", "banner"] : ["storefront", "body-image"]
        })
      });
      const complete = (await completeResponse.json()) as { error?: string; asset?: { id?: string; publicUrl?: string | null } };

      if (!completeResponse.ok || !complete.asset?.id) {
        throw new Error(complete.error ?? "Could not save image.");
      }

      const imageUrl = complete.asset.publicUrl ?? `/api/media/assets/${complete.asset.id}`;
      if (target === "banner") {
        update("bannerUrl", imageUrl);
        setMessage(`Banner image uploaded. Save the ${entityLabel.toLowerCase()} profile to publish it.`);
      } else {
        addBodyImageUrl(imageUrl);
        setMessage(`Body image uploaded and inserted into the description. Save the ${entityLabel.toLowerCase()} profile to publish it.`);
      }
      setUploadStateFor(target, { fileName: file.name, progress: 100, status: "done" });
    } catch (caught) {
      setUploadStateFor(target, {
        fileName: file.name,
        progress: 0,
        status: "error",
        error: caught instanceof Error ? caught.message : "Upload failed."
      });
    } finally {
      if (target === "banner" && bannerImageInputRef.current) bannerImageInputRef.current.value = "";
      if (target === "body" && bodyImageInputRef.current) bodyImageInputRef.current.value = "";
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/business/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          heroImageUrl: "",
          forumAllowPictureUploads: form.forumEnabled && form.forumAllowPictureUploads,
          galleryImageUrls: form.galleryImageUrls.map((value) => value.trim()).filter(Boolean)
        })
      });
      const payload = (await response.json()) as { error?: string; profile?: BusinessProfileView };

      if (!response.ok || !payload.profile) {
        setError(payload.error ?? "Could not save business profile.");
        return;
      }

      setProfile(payload.profile);
      setForm(initialForm(payload.profile));
      setMessage(payload.profile.publicStorefrontEnabled ? "Storefront saved and published." : "Business profile saved.");
    });
  }

  if (!businessCenter.canManage) {
    return (
      <section className="surface rounded-md p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{centerLabel}</p>
        <h1 className="mt-3 text-3xl font-semibold">{isOrgProfile ? "Org access required" : "Business profile access required"}</h1>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--muted)]">{error}</p>
        <Link className="btn-secondary mt-5 inline-block" href="/production-zone">
          Back to Production Zone
        </Link>
      </section>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{centerLabel}</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{isOrgProfile ? "Org profile and public page" : "Business profile and storefront"}</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              {isOrgProfile
                ? "Build an org profile with contact routing, blogs, events, fundraisers, and org communication tools."
                : "Build a public storefront for non-members while keeping control inside Theta-Space."}
            </p>
          </div>
          {profile?.publicStorefrontEnabled ? (
            <Link className="btn-secondary" href={profile.publicUrl}>
              View storefront
            </Link>
          ) : null}
        </div>
      </section>

      <form className="surface grid gap-5 rounded-md p-6" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">{entityLabel} name</span>
            <input className="form-field" onChange={(event) => update("businessName", event.target.value)} value={form.businessName} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Tagline</span>
            <input className="form-field" onChange={(event) => update("tagline", event.target.value)} value={form.tagline} />
          </label>
        </div>

        {isOrgProfile ? (
          <label className="grid gap-2">
            <span className="form-label">Person who runs this org account</span>
            <input className="form-field" onChange={(event) => update("contactPersonName", event.target.value)} value={form.contactPersonName} />
          </label>
        ) : null}

        <section className="grid gap-4 rounded-md border border-[var(--line)] bg-black/10 p-4">
          <div>
            <h2 className="font-semibold text-[var(--gold)]">{isOrgProfile ? "Org profile visuals" : "Storefront visuals"}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Keep this simple: use one banner image for the top of the page, then place body images directly inside the description.
            </p>
          </div>
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="form-label">Logo image URL</span>
              <input className="form-field" onChange={(event) => update("logoUrl", event.target.value)} placeholder="https://..." value={form.logoUrl} />
            </label>
          </div>
          <section className="grid gap-4 rounded-md border border-[var(--line)] bg-black/10 p-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="grid gap-3">
              <div>
                <h3 className="font-semibold text-[var(--gold)]">Page banner image</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  This is the wide image at the top of the public storefront. Recommended: 1600 x 480px, JPG, PNG, or WEBP up to 15MB.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="btn-secondary" onClick={() => bannerImageInputRef.current?.click()} type="button">
                  Upload banner image
                </button>
                {form.bannerUrl ? (
                  <button className="btn-secondary" onClick={() => update("bannerUrl", "")} type="button">
                    Remove banner
                  </button>
                ) : null}
              </div>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadBusinessImage(file, "banner");
                }}
                ref={bannerImageInputRef}
                type="file"
              />
              {bannerUpload.status !== "idle" ? (
                <div className="rounded-md border border-[var(--line)] bg-black/10 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate">{bannerUpload.fileName}</span>
                    <span>{bannerUpload.status === "uploading" ? `${bannerUpload.progress}%` : bannerUpload.status}</span>
                  </div>
                  {bannerUpload.status === "uploading" ? (
                    <div
                      aria-label="Banner image upload progress"
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={bannerUpload.progress}
                      className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
                      role="progressbar"
                    >
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${bannerUpload.progress}%` }} />
                    </div>
                  ) : null}
                  {bannerUpload.error ? <p className="mt-2 text-red-100" role="alert">{bannerUpload.error}</p> : null}
                </div>
              ) : null}
              <details className="rounded-md border border-[var(--line)] bg-black/10 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--gold)]">Paste a banner image URL instead</summary>
                <label className="mt-3 grid gap-2">
                  <span className="form-label">Banner image URL</span>
                  <input className="form-field" onChange={(event) => update("bannerUrl", event.target.value)} placeholder="https://..." value={form.bannerUrl} />
                </label>
              </details>
            </div>
            <div className="business-storefront-hero-preview" aria-label="Storefront banner image preview">
              {form.bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="Storefront banner preview" src={form.bannerUrl} />
              ) : (
                <span>No banner image</span>
              )}
            </div>
          </section>
        </section>

        <section className="grid gap-4 rounded-md border border-[var(--line)] bg-black/10 p-4">
          <div>
            <h2 className="font-semibold text-[var(--gold)]">{isOrgProfile ? "Org page body" : "Storefront body"}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Write the description, upload body images, then insert each image where it belongs: left, center, or right.
            </p>
          </div>
          <label className="grid gap-2">
            <span className="form-label">Description</span>
            <textarea
              className="form-field min-h-44 resize-y"
              onChange={(event) => update("description", event.target.value)}
              placeholder="What your business offers, who it serves, and how people should think about contacting you."
              ref={descriptionRef}
              value={form.description}
            />
            <small className="text-[var(--muted)]">Use the insert buttons below to place images in the text. You can keep writing around the inserted image markers.</small>
          </label>
          <div className="flex flex-wrap gap-3">
            <button className="btn-secondary" disabled={form.galleryImageUrls.length >= 12} onClick={() => bodyImageInputRef.current?.click()} type="button">
              Upload body image
            </button>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadBusinessImage(file, "body");
              }}
              ref={bodyImageInputRef}
              type="file"
            />
          </div>
          {bodyUpload.status !== "idle" ? (
            <div className="rounded-md border border-[var(--line)] bg-black/10 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">{bodyUpload.fileName}</span>
                <span>{bodyUpload.status === "uploading" ? `${bodyUpload.progress}%` : bodyUpload.status}</span>
              </div>
              {bodyUpload.status === "uploading" ? (
                <div
                  aria-label="Body image upload progress"
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={bodyUpload.progress}
                  className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                >
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${bodyUpload.progress}%` }} />
                </div>
              ) : null}
              {bodyUpload.error ? <p className="mt-2 text-red-100" role="alert">{bodyUpload.error}</p> : null}
            </div>
          ) : null}
          <details className="rounded-md border border-[var(--line)] bg-black/10 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--gold)]">Paste a body image URL instead</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <input className="form-field" onChange={(event) => setBodyImageUrlInput(event.target.value)} placeholder="https://..." value={bodyImageUrlInput} />
              <button
                className="btn-secondary"
                onClick={() => {
                  addBodyImageUrl(bodyImageUrlInput);
                  setBodyImageUrlInput("");
                }}
                type="button"
              >
                Add image
              </button>
            </div>
          </details>
          {form.galleryImageUrls.length > 0 ? (
            <div className="storefront-body-image-library">
              {form.galleryImageUrls.map((url, index) => (
                <article className="storefront-body-image-card" key={`${url}-${index}`}>
                  <div className="storefront-body-image-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`Body image ${index + 1}`} src={url} />
                  </div>
                  <div className="grid gap-2">
                    <p className="text-sm font-semibold text-[var(--gold)]">Image {index + 1}</p>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary px-3 py-1 text-xs" onClick={() => insertBodyImage(index, "left")} type="button">
                        Insert left
                      </button>
                      <button className="btn-secondary px-3 py-1 text-xs" onClick={() => insertBodyImage(index, "center")} type="button">
                        Insert center
                      </button>
                      <button className="btn-secondary px-3 py-1 text-xs" onClick={() => insertBodyImage(index, "right")} type="button">
                        Insert right
                      </button>
                      <button className="btn-secondary px-3 py-1 text-xs" onClick={() => removeBodyImage(index)} type="button">
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">No body images yet. Upload one and it will be inserted into the description.</p>
          )}
          <section className="storefront-description-editor-preview rounded-md border border-[var(--line)] bg-black/10 p-4">
            <h3 className="font-semibold text-[var(--gold)]">Body preview</h3>
            <StorefrontDescriptionContent
              businessName={form.businessName || entityLabel}
              description={form.description}
              fallback={`This ${entityLabel.toLowerCase()} has not added a full description yet.`}
              imageUrls={form.galleryImageUrls}
              preview
            />
          </section>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <CityLocationAutocomplete
            helperText="Public storefront location is city-level only. Do not enter a street address."
            label="City"
            onChange={(value) => update("location", value)}
            placeholder="Start typing a city..."
            value={form.location}
          />
          <label className="grid gap-2">
            <span className="form-label">Public email</span>
            <input className="form-field" onChange={(event) => update("publicEmail", event.target.value)} value={form.publicEmail} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Phone</span>
            <input className="form-field" onChange={(event) => update("phone", event.target.value)} value={form.phone} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Website</span>
            <input className="form-field" onChange={(event) => update("website", event.target.value)} placeholder="https://example.com" value={form.website} />
          </label>
        </div>

        <label className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-black/10 p-4">
          <input
            checked={form.publicStorefrontEnabled}
            className="mt-1"
            onChange={(event) => update("publicStorefrontEnabled", event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="block font-semibold text-[var(--gold)]">{isOrgProfile ? "Publish public org profile" : "Publish public storefront"}</span>
            <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
              {isOrgProfile
                ? "Makes this org profile reachable and routes inquiries to the designated public contact email."
                : "Makes this page reachable outside the private member app. Inquiries are captured internally."}
            </span>
          </span>
        </label>

        {canUseWriters ? <label className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-black/10 p-4">
          <input checked={form.blogEnabled} className="mt-1" onChange={(event) => update("blogEnabled", event.target.checked)} type="checkbox" />
          <span>
            <span className="block font-semibold text-[var(--gold)]">Enable storefront blogs</span>
            <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
              Blog posts are written in Writers Corner as manuscripts. Once this is on, open a manuscript and check Publish to storefront.
            </span>
            <Link className="mt-2 inline-block text-sm font-semibold text-[var(--gold)] underline" href="/writers-corner">
              Open Writers Corner
            </Link>
          </span>
        </label> : null}

        <section className="grid gap-3 rounded-md border border-[var(--line)] bg-black/10 p-4">
          <label className="flex items-start gap-3">
            <input checked={form.forumEnabled} className="mt-1" onChange={(event) => update("forumEnabled", event.target.checked)} type="checkbox" />
            <span>
              <span className="block font-semibold text-[var(--gold)]">Enable storefront forum</span>
              <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
                Adds a compact public forum where visitors can search topics, create topics, and reply in full threads.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 border-t border-[var(--line)] pt-3">
            <input
              checked={form.forumAllowPictureUploads}
              className="mt-1"
              disabled={!form.forumEnabled}
              onChange={(event) => update("forumAllowPictureUploads", event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block font-semibold text-[var(--gold)]">Allow forum picture attachments</span>
              <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
                Lets topic starters and replies attach image links. Turn this off for tighter moderation.
              </span>
            </span>
          </label>
        </section>

        {profile ? (
          <p className="rounded-md border border-[var(--line)] bg-black/10 p-3 text-sm text-[var(--muted)]">
            Public URL: <span className="text-[var(--text)]">{profile.publicUrl}</span>
          </p>
        ) : null}
        {message ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <Link className="btn-secondary" href="/production-zone">
            Cancel
          </Link>
          <button className="btn-primary" disabled={isPending || form.businessName.trim().length < 2} type="submit">
            {isPending ? "Saving..." : "Save business profile"}
          </button>
        </div>
      </form>

      <section className="surface rounded-md p-6">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Recent inquiries</h2>
        <p className="mt-2 text-[var(--muted)]">External storefront inquiries land here with the sender email when supplied.</p>
        <div className="mt-5 grid gap-3">
          {businessCenter.inquiries.length > 0 ? (
            businessCenter.inquiries.map((inquiry) => (
              <article className="module-card rounded-md p-4" key={inquiry.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">{inquiry.senderName}</h3>
                  <span className="pill rounded-full px-3 py-1 text-xs">{new Date(inquiry.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">{inquiry.senderEmail ?? "No email supplied"}</p>
                <p className="mt-3 leading-6">{inquiry.message}</p>
                {inquiry.senderEmail ? (
                  <a className="btn-secondary mt-4 inline-flex" href={`mailto:${inquiry.senderEmail}?subject=${encodeURIComponent(`Re: ${profile?.businessName ?? "Storefront inquiry"}`)}`}>
                    Reply by email
                  </a>
                ) : null}
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-5 text-[var(--muted)]">No storefront inquiries yet.</p>
          )}
        </div>
      </section>

      {canUseWriters ? <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--gold)]">Storefront blogs</h2>
            <p className="mt-2 text-[var(--muted)]">
              Write business blogs in Writers Corner, then publish selected manuscripts to this storefront.
            </p>
          </div>
          <Link className="btn-secondary" href="/writers-corner">
            Open Writers Corner
          </Link>
        </div>

        <div className="mt-5 grid gap-3">
          {profile?.blogEnabled ? (
            profile.storefrontBlogs.length ? (
              profile.storefrontBlogs.map((blog) => (
                <article className="module-card rounded-md p-4" key={blog.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{blog.title}</h3>
                      {blog.summary ? <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{blog.summary}</p> : null}
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                        {blog.chapterCount} chapters / {blog.wordCount.toLocaleString()} words
                      </p>
                    </div>
                    <Link className="btn-secondary" href={blog.publicUrl}>
                      View
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-[var(--line)] p-5 text-[var(--muted)]">
                No storefront blogs are published yet. Open a manuscript in Writers Corner and check Publish to storefront.
              </div>
            )
          ) : (
            <div className="rounded-md border border-dashed border-[var(--line)] p-5 text-[var(--muted)]">
              Enable storefront blogs above, save your business profile, then publish manuscripts from Writers Corner.
            </div>
          )}
          {profile?.articles.length ? (
            <details className="rounded-md border border-[var(--line)] bg-black/10 p-4 text-sm text-[var(--muted)]">
              <summary className="cursor-pointer font-semibold text-[var(--gold)]">Existing storefront articles</summary>
              <div className="mt-3 grid gap-3">
                {profile.articles.map((article) => (
                  <article className="module-card rounded-md p-4" key={article.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-[var(--text)]">{article.title}</h3>
                        {article.summary ? <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{article.summary}</p> : null}
                      </div>
                      <Link className="btn-secondary" href={article.publicUrl}>
                        View
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </section> : null}
    </div>
  );
}
