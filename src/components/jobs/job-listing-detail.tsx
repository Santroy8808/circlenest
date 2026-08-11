import { AdDestinationKind, InterestCategory } from "@prisma/client";
import Link from "next/link";
import { InAppImageViewer } from "@/components/media/in-app-image-viewer";
import { MarkdownRichText } from "@/components/rich-text/markdown-rich-text";
import type { JobListingDetailView } from "@/modules/jobs/types";
import { isInternalMailEnabled } from "@/modules/mail/mail.service";

export function JobListingDetail({ job }: { job: JobListingDetailView }) {
  const mailEnabled = isInternalMailEnabled();
  const locationLabel = job.remote ? "Remote" : job.location || "City TBD";

  return (
    <div className="grid gap-5">
      <section className="surface overflow-hidden rounded-md">
        <div className="job-detail-hero">
          {job.imageUrl ? (
            <InAppImageViewer alt={job.imageOriginalName ?? job.title} className="market-detail-image-trigger !h-full !w-full" src={job.imageUrl}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src={job.imageUrl} />
            </InAppImageViewer>
          ) : (
            <span>{job.categoryLabel}</span>
          )}
          {job.imageOverlayText ? <strong>{job.imageOverlayText}</strong> : null}
        </div>
        <div className="market-detail-content p-6">
          <div className="market-detail-main">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{job.categoryLabel}</p>
                <h1 className="mt-3 text-4xl font-semibold">{job.title}</h1>
                <p className="mt-3 text-xl text-[var(--muted)]">{job.companyName || job.employer.displayName}</p>
                {job.business ? (
                  <Link className="profile-inline-link mt-2 inline-block" href={job.business.publicUrl}>
                    View {job.business.businessName}
                  </Link>
                ) : null}
                <p className="mt-2 text-[var(--muted)]">
                  {locationLabel} - {job.employmentTypeLabel}
                </p>
                {job.compensation ? <p className="mt-3 text-3xl font-black text-[var(--gold)]">{job.compensation}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {job.viewerCanManage ? (
                  <Link className="btn-secondary" href={`/jobs/${job.slug}/edit`}>
                    Edit job
                  </Link>
                ) : null}
                <Link className="btn-secondary" href="/jobs">
                  Back to jobs
                </Link>
              </div>
            </div>
            {job.summary ? <p className="mt-5 text-xl leading-8">{job.summary}</p> : null}
            <MarkdownRichText className="market-listing-description mt-6" value={job.description} />
          </div>
          <aside className="market-listing-owner-contact">
            <h2 className="text-xl font-semibold text-[var(--gold)]">Contact</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Use the listed contact details or Theta-Space Mail when available.
            </p>
            <div className="market-contact-seller mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">Company</p>
              <p className="mt-2 font-semibold">{job.companyName || job.employer.displayName}</p>
            </div>
            <div className="market-contact-card mt-4">
              {job.contactEmail ? (
                <a className="market-contact-line" href={`mailto:${job.contactEmail}?subject=${encodeURIComponent(`Theta-Space Job: ${job.title}`)}`}>
                  Email: {job.contactEmail}
                </a>
              ) : null}
              {job.contactPhone ? <p className="market-contact-line">Phone: {job.contactPhone}</p> : null}
              {job.contactInstructions ? <p className="market-contact-line whitespace-pre-wrap">{job.contactInstructions}</p> : null}
              {!job.contactEmail && !job.contactPhone && !job.contactInstructions ? (
                <p className="market-contact-line">{mailEnabled ? "Contact through Theta-Space Mail." : "No public contact details listed."}</p>
              ) : null}
            </div>
            {mailEnabled ? (
              <Link className="btn-secondary mt-4 inline-block" href="/mail">
                Open Mail
              </Link>
            ) : null}
          </aside>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Needs</h2>
          {job.needs ? <p className="mt-3 whitespace-pre-wrap text-[var(--muted)]">{job.needs}</p> : <p className="mt-2 text-[var(--muted)]">No required items listed.</p>}
        </article>
        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Wants</h2>
          {job.wants ? <p className="mt-3 whitespace-pre-wrap text-[var(--muted)]">{job.wants}</p> : <p className="mt-2 text-[var(--muted)]">No preferred items listed.</p>}
        </article>
      </section>

      {job.viewerCanPromote ? (
        <section className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Promotion</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Promoting a job creates a normal ad campaign. Ads do not appear inside the job listing.
          </p>
          <Link
            className="btn-secondary mt-4 inline-block"
            href={`/ads/create?destinationKind=${AdDestinationKind.EXTERNAL_URL}&customDestinationUrl=${encodeURIComponent(`/jobs/${job.slug}`)}&title=${encodeURIComponent(`Promote ${job.title}`)}&body=${encodeURIComponent(job.summary ?? `View this ${job.employmentTypeLabel.toLowerCase()} role on Theta-Space.`)}&targetInterestCategories=${InterestCategory.JOBS}`}
          >
            Create job ad
          </Link>
        </section>
      ) : null}
    </div>
  );
}
