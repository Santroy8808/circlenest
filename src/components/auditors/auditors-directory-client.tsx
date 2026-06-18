"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuditorProfileView } from "@/modules/auditors/types";

export function AuditorsDirectoryClient({
  initialAuditors,
  viewerCanCreate
}: {
  initialAuditors: AuditorProfileView[];
  viewerCanCreate: boolean;
}) {
  const [query, setQuery] = useState("");
  const auditors = initialAuditors.filter((auditor) => {
    const haystack = [
      auditor.displayName,
      auditor.practiceName,
      auditor.location,
      auditor.offerings,
      auditor.scientology.trainingLevel,
      auditor.scientology.processingStatus
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Production Zone</p>
            <h1 className="mt-3 text-3xl font-semibold">Find an Auditor</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Search auditor mini profiles. “I’m an Auditor” is a separate profile builder for Auditor accounts.
            </p>
          </div>
          {viewerCanCreate ? (
            <Link className="btn-primary" href="/auditors/im-an-auditor">
              I&apos;m an Auditor
            </Link>
          ) : null}
        </div>
        <input className="form-field mt-6" onChange={(event) => setQuery(event.target.value)} placeholder="Search auditors..." value={query} />
      </section>

      {auditors.length === 0 ? (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No auditor profiles yet</h2>
          <p className="mt-2 text-[var(--muted)]">Approved Auditor accounts can publish listings here.</p>
        </section>
      ) : (
        <section className="auditor-grid">
          {auditors.map((auditor) => (
            <Link className="auditor-card" href={`/auditors/${auditor.username}`} key={auditor.id}>
              <span className="people-avatar">
                {auditor.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={auditor.avatarUrl} />
                ) : (
                  auditor.displayName.slice(0, 2).toUpperCase()
                )}
              </span>
              <h2 className="mt-4 text-xl font-semibold text-[var(--gold)]">{auditor.practiceName}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{auditor.displayName}</p>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{auditor.offerings || "No offerings listed yet."}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--gold)]">
                {auditor.location || "Location TBD"} {auditor.willingToTravel ? "- travels" : ""}
              </p>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
