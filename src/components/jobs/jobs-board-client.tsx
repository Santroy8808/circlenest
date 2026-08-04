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
  const [location, setLocation] = useState("");
  const [view, setView] = useState<ListingViewMode>(initialView);
  const cleanQuery = query.trim().toLowerCase();
  const cleanLocation = location.trim().toLowerCase();
  const listings = initialListings.filter((job) => {
    const haystack = [job.title, job.companyName, job.summary, job.categoryLabel, job.location, job.compensation].join(" ").toLowerCase();
    const locationHaystack = [job.location, job.remote ? "remote" : ""].join(" ").toLowerCase();
    return (
      (!cleanQuery || haystack.includes(cleanQuery)) &&
      (!cleanLocation || locationHaystack.includes(cleanLocation)) &&
      (category ? job.category === category : true)
    );
  });
  const hasFilters = Boolean(cleanQuery || cleanLocation || category);

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Market Jobs</p>
            <h1 className="mt-3 text-3xl font-semibold">Find a Job</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Browse available opportunities or post an opening for other members.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="btn-secondary" href="/jobs/my-listings">
              My Jobs
            </Link>
            {viewerCanCreate ? (
              <Link className="btn-primary" href="/jobs/create">
                Create Job
              </Link>
            ) : null}
          </div>
        </div>
        <div className="jobs-directory-controls mt-6 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_240px_auto]">
          <input aria-label="Search jobs by keyword" className="form-field" onChange={(event) => setQuery(event.target.value)} placeholder="Search jobs..." type="search" value={query} />
          <input aria-label="Search jobs by location" className="form-field" onChange={(event) => setLocation(event.target.value)} placeholder="Location..." type="search" value={location} />
          <select aria-label="Filter jobs by category" className="form-field" onChange={(event) => setCategory(event.target.value)} value={category}>
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
          <h2 className="text-2xl font-semibold text-[var(--gold)]">{hasFilters ? "No jobs match your search" : "No job listings yet"}</h2>
          <p className="mt-2 text-[var(--muted)]">
            {hasFilters ? "Try a different keyword, location, or category." : "Members and business accounts can post opportunities when ready."}
          </p>
        </section>
      ) : (
        <section className={`listing-grid listing-grid--${view}`}>
          {listings.map((job) => (
            <Link className={`listing-square-card listing-card--${view} job-card`} href={`/jobs/${job.slug}`} key={job.id}>
              <div className="listing-square-visual">
                {job.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={job.imageUrl} />
                ) : (
                  <span className="listing-square-fallback">{job.categoryLabel}</span>
                )}
              </div>
              <span className="listing-square-top-badge">{job.compensation || "Salary listed on detail"}</span>
              {job.imageOverlayText ? <span className="listing-square-overlay-text">{job.imageOverlayText}</span> : null}
              <div className="listing-square-meta">
                <p className="listing-square-kicker">{job.companyName || job.employer.displayName}</p>
                <h2>{job.title}</h2>
                <p className="listing-square-subtitle">{job.remote ? "Remote" : job.location || "City TBD"}</p>
                <div className="listing-square-facts">
                  <span>{job.employmentTypeLabel}</span>
                  <strong>{job.compensation || job.categoryLabel}</strong>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
