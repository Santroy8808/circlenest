"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { jobCategoryOptions, type PublicJobListingCardView } from "@/modules/jobs/types";

function postedLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function PublicJobsBoard({ listings }: { listings: PublicJobListingCardView[] }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const visibleListings = useMemo(() => {
    const search = query.trim().toLowerCase();
    const place = location.trim().toLowerCase();
    return listings.filter((job) => {
      const searchable = [job.title, job.companyName, job.employer.displayName, job.summary, job.location, job.compensation].join(" ").toLowerCase();
      const locationSearchable = [job.location, job.remote ? "remote" : ""].join(" ").toLowerCase();
      return (!search || searchable.includes(search)) && (!place || locationSearchable.includes(place)) && (!category || job.category === category);
    });
  }, [category, listings, location, query]);

  return (
    <main className="public-jobs-page">
      <header className="public-jobs-topbar">
        <Link className="public-jobs-brand" href="/">Theta-Space</Link>
        <div>
          <Link className="btn-secondary" href="/login">Member login</Link>
          <Link className="btn-primary" href="/login?callbackUrl=%2Fjobs%2Fcreate">Create a Job</Link>
        </div>
      </header>
      <section className="public-jobs-hero">
        <p>Theta-Space Jobs</p>
        <h1>Find a Job</h1>
        <span>Browse current opportunities. A Theta-Space invitation is required to create a job listing.</span>
      </section>
      <section className="public-jobs-controls" aria-label="Search current job listings">
        <input aria-label="Search jobs" className="form-field" onChange={(event) => setQuery(event.target.value)} placeholder="Search roles, companies, or keywords..." type="search" value={query} />
        <input aria-label="Search jobs by location" className="form-field" onChange={(event) => setLocation(event.target.value)} placeholder="Location or Remote" type="search" value={location} />
        <select aria-label="Filter jobs by category" className="form-field" onChange={(event) => setCategory(event.target.value)} value={category}>
          <option value="">All categories</option>
          {jobCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </section>
      <section aria-label="Job listings" className="public-jobs-grid">
        {visibleListings.length === 0 ? <p className="public-jobs-empty">No jobs match this search.</p> : null}
        {visibleListings.map((job) => {
          const company = job.companyName || job.business?.businessName || job.employer.displayName;
          return (
            <article className="public-job-card" key={job.slug}>
              <div className="public-job-card-image">
                {job.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={job.imageUrl} />
                ) : <span>{job.categoryLabel}</span>}
                {job.imageOverlayText ? <b>{job.imageOverlayText}</b> : null}
              </div>
              <div className="public-job-card-content">
                <p>{company}</p>
                <h2><Link href={`/jobs/${job.slug}`}>{job.title}</Link></h2>
                <span>{job.remote ? "Remote" : job.location || "Location to be confirmed"} · {job.employmentTypeLabel}</span>
                {job.summary ? <small>{job.summary}</small> : null}
                <footer>
                  <b>{job.compensation || "Compensation on detail"}</b>
                  <time dateTime={job.createdAt}>Posted {postedLabel(job.createdAt)}</time>
                </footer>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
