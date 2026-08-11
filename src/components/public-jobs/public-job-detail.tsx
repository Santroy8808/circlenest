import Link from "next/link";
import { MarkdownRichText } from "@/components/rich-text/markdown-rich-text";
import type { PublicJobListingDetailView } from "@/modules/jobs/types";

export function PublicJobDetail({ job }: { job: PublicJobListingDetailView }) {
  const company = job.companyName || job.business?.businessName || job.employer.displayName;

  return (
    <main className="public-jobs-page public-job-detail-page">
      <header className="public-jobs-topbar">
        <Link className="public-jobs-brand" href="/jobs">Theta-Space Jobs</Link>
        <div>
          <Link className="btn-secondary" href="/login">Member login</Link>
          <Link className="btn-primary" href="/login?callbackUrl=%2Fjobs%2Fcreate">Create a Job</Link>
        </div>
      </header>
      <article className="public-job-detail surface">
        <div className="public-job-detail-image">
          {job.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={job.imageUrl} />
          ) : <span>{job.categoryLabel}</span>}
          {job.imageOverlayText ? <b>{job.imageOverlayText}</b> : null}
        </div>
        <div className="public-job-detail-main">
          <p>{company}</p>
          <h1>{job.title}</h1>
          <span>{job.remote ? "Remote" : job.location || "Location to be confirmed"} · {job.employmentTypeLabel}</span>
          {job.compensation ? <strong>{job.compensation}</strong> : null}
          {job.summary ? <h2>{job.summary}</h2> : null}
          {job.business ? <Link className="btn-secondary" href={job.business.publicUrl}>View {job.business.businessName}</Link> : null}
          <MarkdownRichText className="public-job-description" value={job.description} />
          <div className="public-job-detail-sections">
            {job.needs ? <section><h2>Needs</h2><p>{job.needs}</p></section> : null}
            {job.wants ? <section><h2>Wants</h2><p>{job.wants}</p></section> : null}
          </div>
        </div>
        {(job.contactEmail || job.contactPhone || job.contactInstructions) ? (
          <aside className="public-job-contact">
            <h2>Contact</h2>
            <p>Use the details supplied by the employer.</p>
            {job.contactEmail ? <a href={`mailto:${job.contactEmail}?subject=${encodeURIComponent(`Theta-Space Job: ${job.title}`)}`}>{job.contactEmail}</a> : null}
            {job.contactPhone ? <p>{job.contactPhone}</p> : null}
            {job.contactInstructions ? <p>{job.contactInstructions}</p> : null}
          </aside>
        ) : null}
      </article>
    </main>
  );
}
