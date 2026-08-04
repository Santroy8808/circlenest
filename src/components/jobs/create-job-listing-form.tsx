"use client";

import { JobCategory, JobEmploymentType } from "@prisma/client";
import Link from "next/link";
import { useRef, useState } from "react";
import { CityLocationAutocomplete } from "@/components/location/city-location-autocomplete";
import { ThetaLoading } from "@/components/platform/theta-loading";
import { MarkdownRichTextEditor } from "@/components/rich-text/markdown-rich-text-editor";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import { employmentTypeOptions, isJobSearchCategory, jobCategoryOptions, type JobListingDetailView } from "@/modules/jobs/types";

type UploadItem = {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  mediaAssetId?: string;
};

const futurePaidListingHref = "/membership?feature=job-listing";

export function CreateJobListingForm({
  viewerCanCreate,
  initialJob,
  mode = "create"
}: {
  viewerCanCreate: boolean;
  initialJob?: JobListingDetailView;
  mode?: "create" | "edit";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initialCategory = initialJob?.category;
  const [title, setTitle] = useState(initialJob?.title ?? "");
  const [companyName, setCompanyName] = useState(initialJob?.companyName ?? "");
  const [summary, setSummary] = useState(initialJob?.summary ?? "");
  const [description, setDescription] = useState(initialJob?.description ?? "");
  const [needs, setNeeds] = useState(initialJob?.needs ?? "");
  const [wants, setWants] = useState(initialJob?.wants ?? "");
  const [category, setCategory] = useState<JobCategory>(
    isJobSearchCategory(initialCategory) ? initialCategory : JobCategory.ADMINISTRATION
  );
  const [employmentType, setEmploymentType] = useState<JobEmploymentType>(initialJob?.employmentType ?? JobEmploymentType.FULL_TIME);
  const [location, setLocation] = useState(initialJob?.location ?? "");
  const [remote, setRemote] = useState(initialJob?.remote ?? false);
  const [compensation, setCompensation] = useState(initialJob?.compensation ?? "");
  const [contactEmail, setContactEmail] = useState(initialJob?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(initialJob?.contactPhone ?? "");
  const [contactInstructions, setContactInstructions] = useState(initialJob?.contactInstructions ?? "");
  const [imageMediaAssetId, setImageMediaAssetId] = useState(initialJob?.imageMediaAssetId ?? "");
  const [imageOverlayText, setImageOverlayText] = useState(initialJob?.imageOverlayText ?? "");
  const [item, setItem] = useState<UploadItem | null>(null);
  const [error, setError] = useState(viewerCanCreate ? "" : "This account cannot create job listings.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setUploadItem(patch: Partial<UploadItem>) {
    setItem((current) => current ? { ...current, ...patch } : current);
  }

  function addFile(file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
      setError("Job images must be JPG, PNG, or WEBP files no larger than 10MB.");
      return;
    }

    setError("");
    setItem({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: "queued"
    });
    setImageMediaAssetId("");
  }

  async function uploadImage() {
    if (!item) return imageMediaAssetId || null;
    if (item.mediaAssetId) return item.mediaAssetId;

    setUploadItem({ status: "uploading", progress: 1 });
    const intentResponse = await fetch("/api/jobs/images/upload-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: item.file.name,
        mimeType: item.file.type,
        sizeBytes: item.file.size
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
      file: item.file,
      onProgress: (progress) => setUploadItem({ progress })
    });

    const completeResponse = await fetch("/api/jobs/images/complete-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intentId: intent.intentId,
        storageKey: intent.storageKey,
        fileName: item.file.name,
        mimeType: item.file.type,
        sizeBytes: item.file.size
      })
    });
    const complete = (await completeResponse.json()) as { error?: string; asset?: { id: string } };

    if (!completeResponse.ok || !complete.asset?.id) {
      throw new Error(complete.error ?? "Could not save job image.");
    }

    setUploadItem({ status: "done", progress: 100, mediaAssetId: complete.asset.id });
    setImageMediaAssetId(complete.asset.id);
    return complete.asset.id;
  }

  async function submitJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const uploadedImageMediaAssetId = await uploadImage();
      const response = await fetch(mode === "edit" && initialJob ? `/api/jobs/${initialJob.slug}` : "/api/jobs", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          companyName,
          summary,
          description,
          needs,
          wants,
          category,
          employmentType,
          location,
          remote,
          compensation,
          contactEmail,
          contactPhone,
          contactInstructions,
          imageMediaAssetId: uploadedImageMediaAssetId,
          imageOverlayText
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; job?: { slug: string } };

      if (!response.ok || !payload.job) {
        throw new Error(payload.error ?? "Could not save job.");
      }

      window.location.href = `/jobs/${payload.job.slug}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save job.");
      setUploadItem({ status: "error" });
      setIsSubmitting(false);
    }
  }

  if (!viewerCanCreate) {
    return (
      <section className="surface rounded-md p-8 text-center">
        <h1 className="text-3xl font-semibold text-[var(--gold)]">Create Job</h1>
        <p className="mt-3 text-[var(--muted)]">{error}</p>
        <Link className="btn-secondary mt-5 inline-block" href="/jobs">
          Browse jobs
        </Link>
      </section>
    );
  }

  const previewUrl = item?.previewUrl ?? initialJob?.imageUrl ?? "";
  const hasImage = Boolean(previewUrl || imageMediaAssetId);

  return (
    <form className="surface market-listing-form job-listing-form grid gap-4 rounded-md p-5" onSubmit={submitJob}>
      <Link aria-hidden="true" className="hidden" href={futurePaidListingHref} tabIndex={-1}>
        Future paid Contributor job listing checkout
      </Link>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Market Jobs</p>
        <h1 className="mt-2 text-3xl font-semibold">{mode === "edit" ? "Edit job listing" : "Create a job listing"}</h1>
        <p className="mt-2 max-w-3xl leading-6 text-[var(--muted)]">
          Add the role, location, salary range, image, and clear application details. Job posting is free during beta.
        </p>
      </div>

      <div className="market-listing-fields grid gap-3 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Listing title, including location</span>
          <input className="form-field" onChange={(event) => setTitle(event.target.value)} placeholder="Bookkeeper - Clearwater, FL" value={title} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Company name</span>
          <input className="form-field" onChange={(event) => setCompanyName(event.target.value)} value={companyName} />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="form-label">Summary</span>
        <input className="form-field" onChange={(event) => setSummary(event.target.value)} placeholder="Brief one-line summary for the card." value={summary} />
      </label>

      <div className="market-listing-fields grid gap-3 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Category</span>
          <select className="form-field" onChange={(event) => setCategory(event.target.value as JobCategory)} value={category}>
            {jobCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="form-label">Employment type</span>
          <select className="form-field" onChange={(event) => setEmploymentType(event.target.value as JobEmploymentType)} value={employmentType}>
            {employmentTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <CityLocationAutocomplete
          disabled={remote}
          helperText={remote ? "Remote is selected, so no city is needed." : "Use city-level location only. Do not enter a street address."}
          label="Location"
          onChange={setLocation}
          placeholder="Start typing a city..."
          value={location}
        />
        <label className="flex items-center gap-3 rounded-md border border-[var(--line)] px-4 text-sm text-[var(--muted)]">
          <input checked={remote} onChange={(event) => setRemote(event.target.checked)} type="checkbox" />
          Remote
        </label>
      </div>

      <div className="market-listing-fields grid gap-3 md:grid-cols-3">
        <label className="grid gap-2">
          <span className="form-label">Salary range</span>
          <input className="form-field" onChange={(event) => setCompensation(event.target.value)} placeholder="$60,000 - $75,000" value={compensation} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Contact email</span>
          <input className="form-field" onChange={(event) => setContactEmail(event.target.value)} placeholder="Optional public email" type="email" value={contactEmail} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Contact phone</span>
          <input className="form-field" onChange={(event) => setContactPhone(event.target.value)} placeholder="Optional public phone" value={contactPhone} />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="form-label">Contact instructions</span>
        <textarea
          className="form-field min-h-24 resize-y"
          onChange={(event) => setContactInstructions(event.target.value)}
          placeholder="How applicants should reach you, best times, links, or any application steps."
          value={contactInstructions}
        />
      </label>

      <div className="grid gap-2">
        <span className="form-label">Full description</span>
        <MarkdownRichTextEditor
          disabled={isSubmitting}
          onChange={setDescription}
          placeholder="Describe the role, schedule, responsibilities, and working arrangement."
          value={description}
        />
      </div>

      <div className="market-listing-fields grid gap-3 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Needs</span>
          <textarea className="form-field min-h-28 resize-y" onChange={(event) => setNeeds(event.target.value)} placeholder="Required skills, experience, location, availability..." value={needs} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Wants</span>
          <textarea className="form-field min-h-28 resize-y" onChange={(event) => setWants(event.target.value)} placeholder="Preferred skills, nice-to-have experience, extra qualifications..." value={wants} />
        </label>
      </div>

      <section className="market-photo-panel rounded-md border border-[var(--line)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--gold)]">Job Image</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Add one image. It becomes the card image and detail-page visual.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasImage ? (
              <button
                className="btn-secondary"
                onClick={() => {
                  setItem(null);
                  setImageMediaAssetId("");
                }}
                type="button"
              >
                Remove image
              </button>
            ) : null}
            <button className="btn-secondary" onClick={() => inputRef.current?.click()} type="button">
              Choose image
            </button>
          </div>
          <input
            ref={inputRef}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) addFile(file);
            }}
            type="file"
          />
        </div>

        <label className="mt-4 grid gap-2">
          <span className="form-label">Image overlay text</span>
          <input className="form-field" onChange={(event) => setImageOverlayText(event.target.value)} placeholder="Hiring full-time admin in Clearwater" value={imageOverlayText} />
        </label>

        {previewUrl ? (
          <article className="upload-item mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={previewUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item?.file.name ?? initialJob?.imageOriginalName ?? "Current job image"}</p>
              {item ? (
                <div
                  aria-label="Job image upload progress"
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={item.progress}
                  className="mt-2 h-2 overflow-hidden rounded-full bg-black/30"
                  role="progressbar"
                >
                  <div className="h-full rounded-full bg-[var(--blue)]" style={{ width: `${item.progress}%` }} />
                </div>
              ) : null}
            </div>
          </article>
        ) : null}
      </section>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <Link className="btn-secondary" href={mode === "edit" && initialJob ? `/jobs/${initialJob.slug}` : "/jobs"}>
          Cancel
        </Link>
        <button className="btn-primary" disabled={isSubmitting || title.trim().length < 2 || description.trim().length < 10} type="submit">
          {isSubmitting ? <ThetaLoading inline label={mode === "edit" ? "Saving" : "Creating"} size="sm" /> : mode === "edit" ? "Save job" : "Create job"}
        </button>
      </div>
    </form>
  );
}
