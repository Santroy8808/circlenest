"use client";

import { JobCategory, JobEmploymentType } from "@prisma/client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { employmentTypeOptions, jobCategoryOptions } from "@/modules/jobs/types";

export function CreateJobListingForm({ viewerCanCreate }: { viewerCanCreate: boolean }) {
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<JobCategory>(JobCategory.ADMINISTRATION);
  const [employmentType, setEmploymentType] = useState<JobEmploymentType>(JobEmploymentType.FULL_TIME);
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState(false);
  const [compensation, setCompensation] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactInstructions, setContactInstructions] = useState("");
  const [error, setError] = useState(viewerCanCreate ? "" : "This account cannot create job listings.");
  const [isPending, startTransition] = useTransition();

  function submitJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          companyName,
          summary,
          description,
          category,
          employmentType,
          location,
          remote,
          compensation,
          contactEmail,
          contactInstructions
        })
      });
      const payload = (await response.json()) as { error?: string; job?: { slug: string } };

      if (!response.ok || !payload.job) {
        setError(payload.error ?? "Could not create job.");
        return;
      }

      window.location.href = `/jobs/${payload.job.slug}`;
    });
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

  return (
    <form className="surface grid gap-5 rounded-md p-6" onSubmit={submitJob}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Find a Job</p>
        <h1 className="mt-3 text-3xl font-semibold">Create a job listing</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Members and business accounts can post opportunities. Members browse and open the detail page for contact info.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <input className="form-field" onChange={(event) => setTitle(event.target.value)} placeholder="Job title" value={title} />
        <input className="form-field" onChange={(event) => setCompanyName(event.target.value)} placeholder="Company or practice name" value={companyName} />
      </div>
      <input className="form-field" onChange={(event) => setSummary(event.target.value)} placeholder="Short summary" value={summary} />
      <textarea
        className="form-field min-h-40 resize-y"
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Role details, expectations, requirements, schedule, and how applicants should think about the work."
        value={description}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <select className="form-field" onChange={(event) => setCategory(event.target.value as JobCategory)} value={category}>
          {jobCategoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select className="form-field" onChange={(event) => setEmploymentType(event.target.value as JobEmploymentType)} value={employmentType}>
          {employmentTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <input className="form-field" onChange={(event) => setLocation(event.target.value)} placeholder="Location" value={location} />
        <label className="flex items-center gap-3 rounded-md border border-[var(--line)] px-4 text-sm text-[var(--muted)]">
          <input checked={remote} onChange={(event) => setRemote(event.target.checked)} type="checkbox" />
          Remote
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <input className="form-field" onChange={(event) => setCompensation(event.target.value)} placeholder="Compensation, optional" value={compensation} />
        <input className="form-field" onChange={(event) => setContactEmail(event.target.value)} placeholder="Contact email, optional" value={contactEmail} />
      </div>
      <textarea
        className="form-field min-h-28 resize-y"
        onChange={(event) => setContactInstructions(event.target.value)}
        placeholder="Application/contact instructions"
        value={contactInstructions}
      />

      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <Link className="btn-secondary" href="/jobs">
          Cancel
        </Link>
        <button className="btn-primary" disabled={isPending || title.trim().length < 2 || description.trim().length < 10} type="submit">
          {isPending ? "Creating..." : "Create job"}
        </button>
      </div>
    </form>
  );
}
