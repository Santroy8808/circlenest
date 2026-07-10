"use client";

import Link from "next/link";
import { useState } from "react";
import { ListingViewSwitcher } from "@/components/listings/listing-view-switcher";
import { jobCategoryOptions, type JobListingCardView } from "@/modules/jobs/types";
import type { ListingViewMode } from "@/modules/listing-preferences/types";

export function JobsBoardClient({
  initialListings,
  viewerCanCreate,
  initialView
}: {
  initialListings: JobListingCardView[];
  viewerCanCreate: boolean;
  initialView: ListingViewMode;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [view, setView] = useState<ListingViewMode>(initialView);
  const listings = initialListings.filter((job) => {
    const haystack = [job.title, job.companyName, job.summary, job.categoryLabel, job.location].join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase()) && (category ? job.category === category : true);
  });

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Member Opportunities</p>
            <h1 className="mt-3 text-3xl font-semibold">Find a Job</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Browse available opportunities or post an opening for other members.
            </p>
          </div>
          {viewerCanCreate ? (
            <Link className="btn-primary" href="/jobs/create">
              Create Job
            </Link>
          ) : null}
        </div>
        <div className="jobs-directory-controls mt-6 grid gap-3 xl:grid-cols-[1fr_260px_auto]">
          <input className="form-field" onChange={(event) => setQuery(event.target.value)} placeholder="Search jobs..." value={query} />
          <select className="form-field" onChange={(event) => setCategory(event.target.value)} value={category}>
            <option value="">All categories</option>
            {jobCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ListingViewSwitcher onChange={setView} surface="jobs" value={view} />
        </div>
      </section>

      {listings.length === 0 ? (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No job listings yet</h2>
          <p className="mt-2 text-[var(--muted)]">Professional members can post opportunities when ready.</p>
        </section>
      ) : (
        <section className={`listing-grid listing-grid--${view}`}>
          {listings.map((job) => (
            <Link className={`listing-square-card listing-card--${view} job-card`} href={`/jobs/${job.slug}`} key={job.id}>
              <div className="listing-square-visual">
                {job.employer.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={job.employer.avatarUrl} />
                ) : (
                  <span className="listing-square-fallback">{(job.companyName || job.employer.displayName).slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <span className="listing-square-top-badge">{job.employmentTypeLabel}</span>
              <div className="listing-square-meta">
                <p className="listing-square-kicker">{job.remote ? "Remote" : job.location || "Location TBD"}</p>
                <h2>{job.title}</h2>
                <p className="listing-square-subtitle">{job.companyName || job.employer.displayName}</p>
                <div className="listing-square-facts">
                  <span>{job.categoryLabel}</span>
                  {job.compensation ? <strong>{job.compensation}</strong> : null}
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
