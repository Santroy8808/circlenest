"use client";

import { useState, useTransition } from "react";
import { ConductLocationType } from "@prisma/client";
import {
  CONDUCT_COMMENDATION_CATEGORIES,
  CONDUCT_REPORT_REASONS
} from "@/modules/conduct-reporting/policy";

type ActionMode = "report" | "commend" | null;

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function ConductContentActions({ locationType, contentId }: { locationType: ConductLocationType; contentId: string }) {
  const [mode, setMode] = useState<ActionMode>(null);
  const [selection, setSelection] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function open(nextMode: Exclude<ActionMode, null>) {
    setMode(nextMode);
    setSelection("");
    setNote("");
    setMessage("");
    setError("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode || !selection) return;
    setError("");
    setMessage("");
    startTransition(async () => {
      const response = await fetch(mode === "report" ? "/api/conduct/reports" : "/api/conduct/commendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationType,
          contentId,
          ...(mode === "report" ? { reasonCode: selection, context: note } : { category: selection, note })
        })
      });
      const payload = (await response.json()) as { error?: string; reportReference?: string; commendationReference?: string };
      if (!response.ok) {
        setError(payload.error ?? "The action could not be completed.");
        return;
      }
      setMessage(
        mode === "report"
          ? `Report ${payload.reportReference ?? ""} was submitted for human review.`
          : `Commendation ${payload.commendationReference ?? ""} was sent.`
      );
    });
  }

  return (
    <div className="conduct-content-actions" onClick={(event) => event.stopPropagation()}>
      <button className="conduct-commend-button" onClick={() => open("commend")} title="Commend this contribution" type="button">
        Commend
      </button>
      <button className="conduct-report-button" onClick={() => open("report")} title="Report this item for review" type="button">
        Report
      </button>
      {mode ? (
        <div aria-labelledby={`conduct-${mode}-${contentId}`} aria-modal="true" className="conduct-dialog-backdrop" role="dialog">
          <form className="conduct-dialog surface" onSubmit={submit}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">Community Conduct</p>
                <h2 className="mt-2 text-2xl font-semibold" id={`conduct-${mode}-${contentId}`}>
                  {mode === "report" ? "Report this item" : "Commend this item"}
                </h2>
              </div>
              <button className="btn-secondary px-3 py-2" onClick={() => setMode(null)} type="button">Close</button>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              {mode === "report"
                ? "A report requests human review; it is not a finding. The exact public or group item is saved as evidence."
                : "Use a commendation to recognize conduct that helped the conversation or community."}
            </p>
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              {mode === "report" ? "Reason" : "Category"}
              <select className="form-field" onChange={(event) => setSelection(event.target.value)} required value={selection}>
                <option value="">Choose one</option>
                {(mode === "report" ? CONDUCT_REPORT_REASONS : CONDUCT_COMMENDATION_CATEGORIES).map((value) => (
                  <option key={value} value={value}>{label(value)}</option>
                ))}
              </select>
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              {mode === "report" ? "Context (optional)" : "Note (optional)"}
              <textarea className="form-field min-h-28 resize-y" maxLength={mode === "report" ? 2000 : 1000} onChange={(event) => setNote(event.target.value)} value={note} />
            </label>
            {message ? <p className="mt-4 rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setMode(null)} type="button">Cancel</button>
              <button className={mode === "report" ? "btn-danger" : "btn-primary"} disabled={isPending || !selection || Boolean(message)} type="submit">
                {isPending ? "Submitting..." : mode === "report" ? "Submit report" : "Send commendation"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
