import Link from "next/link";
import type { PublicJobListingCardView } from "@/modules/jobs/types";

export function PublicJobsBoard({ listings }: { listings: PublicJobListingCardView[] }) {
  return (
    <main>
      <header>
        <Link href="/">Theta-Space</Link>
        <Link href="/login?callbackUrl=%2Fjobs%2Fcreate">Create a Job</Link>
      </header>
      <section>
        <p>Theta-Space Jobs</p>
        <h1>Find a Job</h1>
        <p>Browse current opportunities. An invitation is required to create a job listing.</p>
      </section>
      <section aria-label="Job listings">
        {listings.length === 0 ? <p>No jobs are available right now.</p> : null}
        {listings.map((job) => (
          <article key={job.slug}>
            <p>{job.companyName || job.business?.businessName || job.employer.displayName}</p>
            <h2><Link href={`/jobs/${job.slug}`}>{job.title}</Link></h2>
            <p>{job.remote ? "Remote" : job.location || "Location to be confirmed"}</p>
            <p>{job.employmentTypeLabel}</p>
            {job.summary ? <p>{job.summary}</p> : null}
          </article>
        ))}
      </section>
    </main>
  );
}
