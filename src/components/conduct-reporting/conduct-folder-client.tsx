"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ReportItem = {
  reference: string;
  reasonCode: string;
  status: string;
  createdAt: string;
  incident: { reference: string; locationType: string; permalink: string; status: string; createdAt: string };
  dispute?: { reference: string; status: string; createdAt: string; resolvedAt: string | null } | null;
};

type FolderView = {
  receivedReports: ReportItem[];
  submittedReports: ReportItem[];
  commendations: Array<{ reference: string; category: string; note: string | null; permalink: string; status: string; createdAt: string }>;
  restrictions: Array<{ reference: string; otherUserId: string; levelDays: number; restrictedUntil: string }>;
};

function readable(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

export function ConductFolderClient({ initialView }: { initialView: FolderView }) {
  const router = useRouter();
  const [openingReport, setOpeningReport] = useState<string | null>(null);
  const [statement, setStatement] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function openDispute(reportReference: string) {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/conduct/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportReference, statement })
      });
      const payload = (await response.json()) as { error?: string; disputeReference?: string };
      if (!response.ok || !payload.disputeReference) {
        setError(payload.error ?? "Could not open the dispute.");
        return;
      }
      router.push(`/settings/reports/disputes/${encodeURIComponent(payload.disputeReference)}`);
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Settings</p>
        <h1 className="mt-3 text-3xl font-semibold">Reports and Commendations</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Reports request human review and are not findings. Commendations recognize constructive community conduct. Private messages and mail are never reviewed by this system.
        </p>
      </section>

      {initialView.restrictions.length ? (
        <section className="rounded-md border border-red-400/45 bg-red-950/20 p-5">
          <h2 className="text-xl font-semibold text-red-200">Temporary communication restrictions</h2>
          <div className="mt-3 grid gap-2">
            {initialView.restrictions.map((item) => (
              <p key={item.reference} className="text-sm text-red-100">
                {item.reference}: {item.levelDays} days, through {new Date(item.restrictedUntil).toLocaleString()}.
              </p>
            ))}
          </div>
        </section>
      ) : null}

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Reports concerning my account</h2>
        <div className="mt-4 grid gap-3">
          {initialView.receivedReports.length === 0 ? <p className="text-[var(--muted)]">No reports concern this account.</p> : null}
          {initialView.receivedReports.map((report) => (
            <article className="rounded-md border border-[var(--line)] p-4" key={report.reference}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[var(--gold)]">{report.reference}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">Reason: {readable(report.reasonCode)} · Status: {readable(report.status)}</p>
                </div>
                <Link className="btn-secondary px-4 py-2 text-sm" href={report.incident.permalink}>View source</Link>
              </div>
              {report.dispute ? (
                <Link className="mt-3 inline-flex text-sm font-semibold text-[var(--gold)]" href={`/settings/reports/disputes/${report.dispute.reference}`}>
                  Open dispute {report.dispute.reference} ({readable(report.dispute.status)})
                </Link>
              ) : openingReport === report.reference ? (
                <div className="mt-4 grid gap-3">
                  <textarea className="form-field min-h-28 resize-y" maxLength={5000} onChange={(event) => setStatement(event.target.value)} placeholder="Opening statement (optional)" value={statement} />
                  {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button className="btn-secondary" onClick={() => setOpeningReport(null)} type="button">Cancel</button>
                    <button className="btn-primary" disabled={isPending} onClick={() => openDispute(report.reference)} type="button">{isPending ? "Opening..." : "Open dispute"}</button>
                  </div>
                </div>
              ) : (
                <button className="btn-secondary mt-3 px-4 py-2 text-sm" onClick={() => { setOpeningReport(report.reference); setStatement(""); setError(""); }} type="button">Dispute report</button>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Reports I submitted</h2>
        <div className="mt-4 grid gap-3">
          {initialView.submittedReports.length === 0 ? <p className="text-[var(--muted)]">You have not submitted a report.</p> : null}
          {initialView.submittedReports.map((report) => (
            <article className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--line)] p-4" key={report.reference}>
              <p><span className="font-semibold text-[var(--gold)]">{report.reference}</span> · {readable(report.reasonCode)} · {readable(report.status)}</p>
              <Link className="text-sm font-semibold text-[var(--gold)]" href={report.incident.permalink}>View source</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Commendations received</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {initialView.commendations.length === 0 ? <p className="text-[var(--muted)]">No commendations yet.</p> : null}
          {initialView.commendations.map((item) => (
            <article className="rounded-md border border-[var(--line)] p-4" key={item.reference}>
              <p className="font-semibold text-[var(--gold)]">{item.reference} · {readable(item.category)}</p>
              {item.note ? <p className="mt-2 leading-6 text-[var(--muted)]">{item.note}</p> : null}
              <Link className="mt-3 inline-flex text-sm font-semibold text-[var(--gold)]" href={item.permalink}>View recognized item</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
