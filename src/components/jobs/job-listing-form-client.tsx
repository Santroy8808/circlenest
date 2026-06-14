"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type JobListingFormClientProps = {
  canCreate: boolean;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function JobListingFormClient({ canCreate }: JobListingFormClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const canSubmit = canCreate && !submitting;

  async function uploadImage(file: File) {
    const uploadForm = new FormData();
    uploadForm.set("purpose", "job-listing-photo");
    uploadForm.set("file", file);
    const response = await fetch("/api/upload", {
      method: "POST",
      body: uploadForm,
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; url?: string };
    if (!response.ok || !payload.url) {
      throw new Error(payload.error ?? "Could not upload photo");
    }
    return payload.url;
  }

  if (!canCreate) {
    return (
      <section className="grid gap-3 rounded border border-[var(--border)] bg-[#0d1320] p-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-200">Create a job listing</p>
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">Example job board post</h2>
          <p className="text-sm text-slate-400">This is what the job board creator looks like when you have access.</p>
        </div>
        <div className="rounded border border-[var(--border)] bg-[#111a2a] p-4 text-sm text-slate-300">
          <p className="font-semibold text-[var(--text-strong)]">Assistant office manager</p>
          <p className="mt-1">Compass Managed IT, Rochester, full-time, 40 hours/week.</p>
          <p className="mt-2 text-xs text-slate-400">Includes company, title, description, requirements, pay range, and optional photo.</p>
        </div>
      </section>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setSubmitting(true);
    setStatus("");
    try {
      const form = new FormData(event.currentTarget);
      const title = String(form.get("title") ?? "").trim();
      const companyName = String(form.get("companyName") ?? "").trim();
      const duties = String(form.get("duties") ?? "").trim();
      if (!title || !companyName || !duties) {
        setStatus("Title, company name, and description are required.");
        return;
      }

      let imageUrl: string | null = null;
      if (imageFile) {
        if (imageFile.size > MAX_IMAGE_BYTES) {
          setStatus("Photo must be 5MB or smaller.");
          return;
        }
        imageUrl = await uploadImage(imageFile);
      }

      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          title,
          duties,
          requirements: String(form.get("requirements") ?? "").trim() || null,
          salaryMin: String(form.get("salaryMin") ?? "").trim() ? Number(form.get("salaryMin")) : null,
          salaryMax: String(form.get("salaryMax") ?? "").trim() ? Number(form.get("salaryMax")) : null,
          location: String(form.get("location") ?? "").trim() || null,
          employmentType: String(form.get("employmentType") ?? "").trim() || null,
          imageUrl,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not post job");
        return;
      }
      router.push("/jobs?created=1");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not post job");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 md:grid-cols-2">
      <input disabled={!canCreate} name="companyName" placeholder="Company name" className="rounded border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" required />
      <input disabled={!canCreate} name="title" placeholder="Job title" className="rounded border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" required />
      <input disabled={!canCreate} name="location" placeholder="Location" className="rounded border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
      <input disabled={!canCreate} name="employmentType" placeholder="Type (Full-time, Contract...)" className="rounded border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
      <input disabled={!canCreate} name="salaryMin" type="number" step="0.01" placeholder="Salary min" className="rounded border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
      <input disabled={!canCreate} name="salaryMax" type="number" step="0.01" placeholder="Salary max" className="rounded border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
      <textarea disabled={!canCreate} name="duties" placeholder="Full job description" className="rounded border px-3 py-2 md:col-span-2 disabled:cursor-not-allowed disabled:bg-slate-100" required />
      <textarea disabled={!canCreate} name="requirements" placeholder="Requirements" className="rounded border px-3 py-2 md:col-span-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
      <label className="md:col-span-2 grid gap-2 rounded border border-dashed border-[var(--border)] p-3 text-sm">
        <span>Single photo upload (max 5MB)</span>
        <input
          disabled={!canCreate}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setImageFile(file);
            setFileName(file?.name ?? "");
            setPreviewUrl(file ? URL.createObjectURL(file) : null);
            if (file && file.size > MAX_IMAGE_BYTES) {
              setStatus("Photo must be 5MB or smaller.");
            } else {
              setStatus("");
            }
          }}
          className="rounded border px-3 py-2"
        />
        {fileName ? <span className="text-xs text-slate-500">{fileName}</span> : null}
        {previewUrl ? <Image src={previewUrl} alt="Job photo preview" width={1200} height={800} unoptimized className="max-h-48 rounded object-cover" /> : null}
      </label>
      <button type="submit" disabled={!canSubmit} className="rounded bg-slate-900 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2">
        {submitting ? "Posting..." : "Post Job"}
      </button>
      {status ? <p className="text-sm text-rose-300 md:col-span-2">{status}</p> : null}
    </form>
  );
}

