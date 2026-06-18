"use client";

import Link from "next/link";
import { useState } from "react";
import { jobCategoryOptions, type JobListingCardView } from "@/modules/jobs/types";

export function JobsBoardClient({
  initialListings,
  viewerCanCreate
}: {
  initialListings: JobListingCardView[];
  viewerCanCreate: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const listings = initialListings.filter((job) => {
    const haystack = [job.title, job.companyName, job.summary, job.categoryLabel, job.location].join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase()) && (category ? job.category === category : true);
  });

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Production Zone</p>
            <h1 className="mt-3 text-3xl font-semibold">Find a Job</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Browse available opportunities. Only Professional accounts can create job listings.
            </p>
          </div>
          {viewerCanCreate ? (
            <Link className="btn-primary" href="/jobs/create">
              Create Job
            </Link>
          ) : null}
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_260px]">
          <input className="form-field" onChange={(event) => setQuery(event.target.value)} placeholder="Search jobs..." value={query} />
          <select className="form-field" onChange={(event) => setCategory(event.target.value)} value={category}>
            <option value="">All categories</option>
            {jobCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {listings.length === 0 ? (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No job listings yet</h2>
          <p className="mt-2 text-[var(--muted)]">Professional members can post opportunities when ready.</p>
        </section>
      ) : (
        <section className="grid gap-4">
          {listings.map((job) => (
            <Link className="job-card" href={`/jobs/${job.slug}`} key={job.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">{job.categoryLabel}</p>
                  <h2 className="mt-2 truncate text-2xl font-semibold">{job.title}</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">{job.companyName || job.employer.displayName}</p>
                </div>
                <span className="pill rounded-full px-3 py-1 text-xs">{job.employmentTypeLabel}</span>
              </div>
              <p className="mt-4 line-clamp-2 leading-7 text-[var(--muted)]">{job.summary || "Open the listing for details."}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--gold)]">
                {job.remote ? "Remote" : job.location || "Location TBD"} {job.compensation ? `- ${job.compensation}` : ""}
              </p>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
