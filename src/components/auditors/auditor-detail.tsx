import Link from "next/link";
import { ScientologyReferenceNotice } from "@/components/legal/scientology-reference-notice";
import type { AuditorProfileView } from "@/modules/auditors/types";
import { isInternalMailEnabled } from "@/modules/mail/mail.service";

const KIND_LABEL = {
  CLASS_V: "Class V Org",
  SH_AO: "SH/AO",
  FLAG: "FLAG",
  FIELD_AUDITOR: "Field Auditor",
  FIELD_GROUP: "Field Group"
} as const;

export function AuditorDetail({ auditor }: { auditor: AuditorProfileView }) {
  const mailEnabled = isInternalMailEnabled();

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="people-avatar">
              {auditor.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={auditor.avatarUrl} />
              ) : (
                auditor.displayName.slice(0, 2).toUpperCase()
              )}
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{KIND_LABEL[auditor.directoryKind]}{auditor.isOfficial ? " · Official directory" : ""}</p>
              <h1 className="mt-3 text-4xl font-semibold">{auditor.practiceName}</h1>
              {auditor.isOfficial ? null : <p className="mt-2 text-[var(--muted)]">{auditor.displayName}</p>}
              <p className="mt-2 text-[var(--muted)]">{auditor.location || "Location TBD"}</p>
              {auditor.address ? <p className="mt-1 text-sm text-[var(--muted)]">{auditor.address}</p> : null}
            </div>
          </div>
          <Link className="btn-secondary" href="/auditors">
            Back to auditors
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">What I offer</h2>
          <p className="mt-3 whitespace-pre-wrap leading-7 text-[var(--muted)]">{auditor.offerings || "No offerings listed yet."}</p>
        </article>
        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Who I am</h2>
          <p className="mt-3 whitespace-pre-wrap leading-7 text-[var(--muted)]">{auditor.bio || "No bio listed yet."}</p>
        </article>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-xl font-semibold text-[var(--gold)]">My Scientology Education Source</h2>
        <div className="mt-4 grid gap-2 text-[var(--muted)] md:grid-cols-2">
          <p>Classification: {auditor.scientology.classification}</p>
          <p>Org: {auditor.scientology.orgName || "Not listed"}</p>
          <p>Training: {auditor.scientology.trainingLevel || "Not listed"}</p>
          <p>Processing: {auditor.scientology.processingStatus || "Not listed"}</p>
        </div>
        {auditor.scientology.educationNotes ? (
          <p className="mt-4 whitespace-pre-wrap leading-7 text-[var(--muted)]">{auditor.scientology.educationNotes}</p>
        ) : null}
      </section>

      <ScientologyReferenceNotice />

      <section className="surface rounded-md p-5">
        <h2 className="text-xl font-semibold text-[var(--gold)]">Contact</h2>
        <div className="mt-3 grid gap-2 text-[var(--muted)]">
          {auditor.phone ? <p>{auditor.phone}</p> : null}
          {auditor.contactEmail ? <a className="underline" href={`mailto:${auditor.contactEmail}`}>{auditor.contactEmail}</a> : null}
          {auditor.website ? <a className="underline" href={auditor.website} rel="noreferrer" target="_blank">Visit website</a> : null}
          {auditor.sourceUrl ? <a className="underline" href={auditor.sourceUrl} rel="noreferrer" target="_blank">Official source</a> : null}
          <p>{auditor.willingToTravel ? "Willing to travel" : "Local availability only"}</p>
        </div>
        {mailEnabled ? (
          <Link className="btn-secondary mt-4 inline-block" href="/mail">
            Open Mail
          </Link>
        ) : null}
      </section>
    </div>
  );
}
