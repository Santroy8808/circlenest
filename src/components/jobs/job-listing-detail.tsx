import Link from "next/link";
import type { JobListingDetailView } from "@/modules/jobs/types";

export function JobListingDetail({ job }: { job: JobListingDetailView }) {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{job.categoryLabel}</p>
            <h1 className="mt-3 text-4xl font-semibold">{job.title}</h1>
            <p className="mt-3 text-[var(--muted)]">{job.companyName || job.employer.displayName}</p>
            <p className="mt-2 text-[var(--muted)]">
              {job.remote ? "Remote" : job.location || "Location TBD"} - {job.employmentTypeLabel}
            </p>
          </div>
          <Link className="btn-secondary" href="/jobs">
            Back to jobs
          </Link>
        </div>
        {job.summary ? <p className="mt-5 text-xl leading-8">{job.summary}</p> : null}
        <p className="mt-5 whitespace-pre-wrap leading-7 text-[var(--muted)]">{job.description}</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Contact</h2>
          {job.contactEmail ? <p className="mt-2 text-[var(--muted)]">{job.contactEmail}</p> : null}
          {job.contactInstructions ? <p className="mt-3 whitespace-pre-wrap text-[var(--muted)]">{job.contactInstructions}</p> : null}
          {!job.contactEmail && !job.contactInstructions ? <p className="mt-2 text-[var(--muted)]">Contact through Theta-Space Mail.</p> : null}
          <Link className="btn-secondary mt-4 inline-block" href="/mail">
            Open Mail
          </Link>
        </article>
        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Promotion</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Promoting a job creates a normal ad campaign. Ads do not appear inside the job listing.
          </p>
          {job.viewerCanPromote ? (
            <Link className="btn-secondary mt-4 inline-block" href="/docs/modules/21-ads-credits">
              Ad handoff notes
            </Link>
          ) : null}
        </article>
      </section>
    </div>
  );
}
