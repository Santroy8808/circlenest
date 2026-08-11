import Link from "next/link";
import { MarkdownRichText } from "@/components/rich-text/markdown-rich-text";
import type { PublicJobListingDetailView } from "@/modules/jobs/types";

export function PublicJobDetail({ job }: { job: PublicJobListingDetailView }) {
  const company = job.companyName || job.business?.businessName || job.employer.displayName;

  return (
    <main>
      <header>
        <Link href="/jobs">Theta-Space Jobs</Link>
        <Link href="/login?callbackUrl=%2Fjobs%2Fcreate">Create a Job</Link>
      </header>
      <article>
        <p>{company}</p>
        <h1>{job.title}</h1>
        <p>{job.remote ? "Remote" : job.location || "Location to be confirmed"} - {job.employmentTypeLabel}</p>
        {job.compensation ? <p>{job.compensation}</p> : null}
        {job.summary ? <p>{job.summary}</p> : null}
        {job.business ? <Link href={job.business.publicUrl}>View {job.business.businessName}</Link> : null}
        <MarkdownRichText value={job.description} />
        {job.needs ? <section><h2>Needs</h2><p>{job.needs}</p></section> : null}
        {job.wants ? <section><h2>Wants</h2><p>{job.wants}</p></section> : null}
        {(job.contactEmail || job.contactPhone || job.contactInstructions) ? (
          <section>
            <h2>Contact</h2>
            {job.contactEmail ? <a href={`mailto:${job.contactEmail}?subject=${encodeURIComponent(`Theta-Space Job: ${job.title}`)}`}>{job.contactEmail}</a> : null}
            {job.contactPhone ? <p>{job.contactPhone}</p> : null}
            {job.contactInstructions ? <p>{job.contactInstructions}</p> : null}
          </section>
        ) : null}
      </article>
    </main>
  );
}
