"use client";

import { MediaVisibility } from "@prisma/client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import type { BusinessCenterView, BusinessProfileView } from "@/modules/business-storefront/types";

type FormState = {
  businessName: string;
  tagline: string;
  description: string;
  location: string;
  publicEmail: string;
  phone: string;
  website: string;
  logoUrl: string;
  bannerUrl: string;
  heroImageUrl: string;
  galleryImageUrlsText: string;
  blogEnabled: boolean;
  publicStorefrontEnabled: boolean;
};

type HeroUploadState = {
  fileName: string;
  progress: number;
  status: "idle" | "uploading" | "done" | "error";
  error?: string;
};

function initialForm(profile: BusinessProfileView | null): FormState {
  return {
    businessName: profile?.businessName ?? "",
    tagline: profile?.tagline ?? "",
    description: profile?.description ?? "",
    location: profile?.location ?? "",
    publicEmail: profile?.publicEmail ?? "",
    phone: profile?.phone ?? "",
    website: profile?.website ?? "",
    logoUrl: profile?.logoUrl ?? "",
    bannerUrl: profile?.bannerUrl ?? "",
    heroImageUrl: profile?.heroImageUrl ?? "",
    galleryImageUrlsText: profile?.galleryImageUrls.join("\n") ?? "",
    blogEnabled: profile?.blogEnabled ?? false,
    publicStorefrontEnabled: profile?.publicStorefrontEnabled ?? false
  };
}

export function BusinessCenterClient({ businessCenter }: { businessCenter: BusinessCenterView }) {
  const heroImageInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState(businessCenter.profile);
  const [form, setForm] = useState<FormState>(() => initialForm(businessCenter.profile));
  const [heroUpload, setHeroUpload] = useState<HeroUploadState>({ fileName: "", progress: 0, status: "idle" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState(businessCenter.canManage ? "" : businessCenter.reason ?? "Professional access required.");
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function uploadHeroImage(file: File) {
    setError("");
    setMessage("");

    if (!file.type.match(/^image\/(jpeg|png|gif|webp)$/)) {
      setHeroUpload({ fileName: file.name, progress: 0, status: "error", error: "Use JPG, PNG, GIF, or WEBP." });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setHeroUpload({ fileName: file.name, progress: 0, status: "error", error: "Image must be 10MB or smaller." });
      return;
    }

    try {
      setHeroUpload({ fileName: file.name, progress: 1, status: "uploading" });
      const intentResponse = await fetch("/api/media/upload-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          visibility: MediaVisibility.PUBLIC
        })
      });
      const intent = (await intentResponse.json()) as { error?: string; uploadUrl?: string; storageKey?: string };

      if (!intentResponse.ok || !intent.uploadUrl || !intent.storageKey) {
        throw new Error(intent.error ?? "Could not prepare hero image upload.");
      }

      await uploadWithResilientFallback({
        uploadUrl: intent.uploadUrl,
        storageKey: intent.storageKey,
        file,
        onProgress: (progress) => setHeroUpload({ fileName: file.name, progress, status: "uploading" })
      });

      const completeResponse = await fetch("/api/media/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey: intent.storageKey,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          visibility: MediaVisibility.PUBLIC,
          tags: ["storefront", "hero"]
        })
      });
      const complete = (await completeResponse.json()) as { error?: string; asset?: { publicUrl?: string | null } };

      if (!completeResponse.ok || !complete.asset?.publicUrl) {
        throw new Error(complete.error ?? "Could not save hero image.");
      }

      update("heroImageUrl", complete.asset.publicUrl);
      setHeroUpload({ fileName: file.name, progress: 100, status: "done" });
      setMessage("Hero image uploaded. Save the business profile to publish it.");
    } catch (caught) {
      setHeroUpload({
        fileName: file.name,
        progress: 0,
        status: "error",
        error: caught instanceof Error ? caught.message : "Upload failed."
      });
    } finally {
      if (heroImageInputRef.current) {
        heroImageInputRef.current.value = "";
      }
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
          galleryImageUrls: form.galleryImageUrlsText
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean)
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
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Business Center</p>
        <h1 className="mt-3 text-3xl font-semibold">Professional access required</h1>
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
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Business Center</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Business profile and storefront</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Build a Professional public storefront for non-members while keeping control inside Theta-Space.
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
            <span className="form-label">Business name</span>
            <input className="form-field" onChange={(event) => update("businessName", event.target.value)} value={form.businessName} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Tagline</span>
            <input className="form-field" onChange={(event) => update("tagline", event.target.value)} value={form.tagline} />
          </label>
        </div>

        <section className="grid gap-4 rounded-md border border-[var(--line)] bg-black/10 p-4">
          <div>
            <h2 className="font-semibold text-[var(--gold)]">Storefront visuals</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Add a logo, banner, hero image, and storefront photos. If no hero image is uploaded, the storefront keeps the current open blue panel.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="form-label">Logo image URL</span>
              <input className="form-field" onChange={(event) => update("logoUrl", event.target.value)} placeholder="https://..." value={form.logoUrl} />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Banner image URL</span>
              <input className="form-field" onChange={(event) => update("bannerUrl", event.target.value)} placeholder="https://..." value={form.bannerUrl} />
            </label>
          </div>
          <section className="grid gap-4 rounded-md border border-[var(--line)] bg-black/10 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="grid gap-3">
              <div>
                <h3 className="font-semibold text-[var(--gold)]">Storefront feature image</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  This appears in the right side of the public storefront hero. Recommended: wide landscape image, JPG/PNG/GIF/WEBP up to 10MB.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="btn-secondary" onClick={() => heroImageInputRef.current?.click()} type="button">
                  Upload hero image
                </button>
                {form.heroImageUrl ? (
                  <button className="btn-secondary" onClick={() => update("heroImageUrl", "")} type="button">
                    Remove hero image
                  </button>
                ) : null}
              </div>
              <input
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadHeroImage(file);
                }}
                ref={heroImageInputRef}
                type="file"
              />
              {heroUpload.status !== "idle" ? (
                <div className="rounded-md border border-[var(--line)] bg-black/10 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate">{heroUpload.fileName}</span>
                    <span>{heroUpload.status === "uploading" ? `${heroUpload.progress}%` : heroUpload.status}</span>
                  </div>
                  {heroUpload.status === "uploading" ? (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${heroUpload.progress}%` }} />
                    </div>
                  ) : null}
                  {heroUpload.error ? <p className="mt-2 text-red-100">{heroUpload.error}</p> : null}
                </div>
              ) : null}
              <label className="grid gap-2">
                <span className="form-label">Hero image URL</span>
                <input className="form-field" onChange={(event) => update("heroImageUrl", event.target.value)} placeholder="Upload or paste https://..." value={form.heroImageUrl} />
              </label>
            </div>
            <div className="business-storefront-hero-preview" aria-label="Storefront hero image preview">
              {form.heroImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="Storefront hero preview" src={form.heroImageUrl} />
              ) : (
                <span>No hero image</span>
              )}
            </div>
          </section>
          <label className="grid gap-2">
            <span className="form-label">Storefront gallery URLs</span>
            <textarea
              className="form-field min-h-28 resize-y"
              onChange={(event) => update("galleryImageUrlsText", event.target.value)}
              placeholder="One image URL per line"
              value={form.galleryImageUrlsText}
            />
          </label>
        </section>

        <label className="grid gap-2">
          <span className="form-label">Description</span>
          <textarea
            className="form-field min-h-36 resize-y"
            onChange={(event) => update("description", event.target.value)}
            placeholder="What your business offers, who it serves, and how people should think about contacting you."
            value={form.description}
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Location</span>
            <input className="form-field" onChange={(event) => update("location", event.target.value)} value={form.location} />
          </label>
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
            <span className="block font-semibold text-[var(--gold)]">Publish public storefront</span>
            <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
              Makes this page reachable outside the private member app. Inquiries are captured internally.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-black/10 p-4">
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
        </label>

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

      <section className="surface rounded-md p-6">
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
      </section>
    </div>
  );
}
