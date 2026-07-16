"use client";

import { useState, useTransition } from "react";

type ConfigView = {
  manualEnabled: boolean;
  automaticEnabled: boolean;
  scheduledEnabled: boolean;
  scannerEnabled: boolean;
  shadowMode: boolean;
  createAutomatedReports: boolean;
  sendAutomatedWarnings: boolean;
  applyAutomatedRestrictions: boolean;
  timezone: string;
  scheduleLocalTime: string;
  automaticIntervalMinutes: number;
  maxItemsPerRun: number;
  maxItemsPerDay: number;
  maxBackfillDays: number;
  contextBefore: number;
  contextAfter: number;
  primaryModel: string;
  fallbackModel: string;
  providerCallBudget: number;
  tokenBudget: number;
  estimatedCostBudgetUsd: number;
  reviewThreshold: number;
  restrictionDecayDays: number;
  policyVersion: string;
};

type RunView = {
  id: string;
  reference: string;
  mode: string;
  status: string;
  dryRun: boolean;
  processedCount: number;
  candidateCount: number;
  deduplicatedCount: number;
  providerCallCount: number;
  providerTokenCount: number;
  estimatedCostUsd: number;
  error: string | null;
  createdAt: string;
};

type CandidateView = {
  id: string;
  reference: string;
  status: string;
  locationType: string;
  groupId: string | null;
  authorUserId: string;
  permalink: string;
  policyCodes: string[];
  score: number | null;
  contextSnapshot: unknown;
  localSignals: unknown;
  providerResult: unknown;
  createdAt: string;
};

type AdminView = { config: ConfigView; runs: RunView[]; candidates: CandidateView[] };

function localInputDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function CandidateCard({ candidate, onUpdated }: { candidate: CandidateView; onUpdated: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function act(action: "approve-candidate" | "dismiss-candidate") {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/admin/conduct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reference: candidate.reference, reason })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Review action failed.");
        return;
      }
      onUpdated();
    });
  }

  return (
    <article className="rounded-md border border-[var(--line)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[var(--gold)]">{candidate.reference}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{candidate.locationType.toLowerCase().replace(/_/g, " ")} · {candidate.status.toLowerCase()} · score {candidate.score?.toFixed(2) ?? "local only"}</p>
        </div>
        <a className="btn-secondary px-4 py-2 text-sm" href={candidate.permalink}>Open source</a>
      </div>
      <p className="mt-3 text-sm"><span className="text-[var(--muted)]">Account:</span> {candidate.authorUserId}</p>
      <p className="mt-2 text-sm"><span className="text-[var(--muted)]">Policy signals:</span> {candidate.policyCodes.join(", ") || "local candidate"}</p>
      <details className="mt-3 rounded-md border border-[var(--line)] p-3">
        <summary className="cursor-pointer font-semibold">Evidence and rationale</summary>
        <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-[var(--muted)]">{JSON.stringify({ context: candidate.contextSnapshot, localSignals: candidate.localSignals, provider: candidate.providerResult }, null, 2)}</pre>
      </details>
      {candidate.status === "PENDING" || candidate.status === "ASSIGNED" ? (
        <div className="mt-4 grid gap-3">
          <textarea className="form-field min-h-24 resize-y" maxLength={2000} onChange={(event) => setReason(event.target.value)} placeholder="Required human review reason" value={reason} />
          {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-secondary" disabled={isPending || reason.trim().length < 5} onClick={() => act("dismiss-candidate")} type="button">Dismiss candidate</button>
            <button className="btn-primary" disabled={isPending || reason.trim().length < 5} onClick={() => act("approve-candidate")} type="button">Approve report</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function AdminConductReview({ initialView }: { initialView: AdminView }) {
  const [view, setView] = useState(initialView);
  const [config, setConfig] = useState(initialView.config);
  const [windowStart, setWindowStart] = useState(localInputDate(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [windowEnd, setWindowEnd] = useState(localInputDate(new Date()));
  const [dryRun, setDryRun] = useState(true);
  const [backfill, setBackfill] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    const response = await fetch("/api/admin/conduct", { cache: "no-store" });
    if (!response.ok) return;
    const next = (await response.json()) as AdminView;
    setView(next);
    setConfig(next.config);
  }

  function toggle(key: keyof ConfigView) {
    setConfig((current) => ({ ...current, [key]: !current[key] }));
  }

  function saveConfiguration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/conduct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "configure", config })
      });
      const payload = (await response.json()) as { error?: string; config?: ConfigView };
      if (!response.ok) {
        setError(payload.error ?? "Could not save communication review settings.");
        return;
      }
      if (payload.config) setConfig(payload.config);
      setMessage("Communication review configuration saved and audited.");
      await refresh();
    });
  }

  function runReview() {
    setError("");
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/conduct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", windowStart: new Date(windowStart).toISOString(), windowEnd: new Date(windowEnd).toISOString(), dryRun, backfill })
      });
      const payload = (await response.json()) as { error?: string; runReference?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not queue communication review.");
        return;
      }
      setMessage(`${payload.runReference} was queued. The platform worker will run it.`);
      await refresh();
    });
  }

  const toggleRows: Array<[keyof ConfigView, string, string]> = [
    ["scannerEnabled", "Scanner enabled", "Master switch for candidate review."],
    ["manualEnabled", "Manual runs", "Allow an admin to queue a bounded run."],
    ["automaticEnabled", "Automatic interval", "Queue a run after the configured interval."],
    ["scheduledEnabled", "Daily schedule", "Queue one run at the local scheduled time."],
    ["shadowMode", "Shadow mode", "Create review candidates only; no member-facing automated action."],
    ["createAutomatedReports", "Automated reports", "High-impact switch. Keep off until policy calibration is approved."],
    ["sendAutomatedWarnings", "Automated warnings", "High-impact switch. Keep off during shadow review."],
    ["applyAutomatedRestrictions", "Automated restrictions", "High-impact switch. Human review is the safe default."]
  ];

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Platform Management</p>
        <h1 className="mt-3 text-3xl font-semibold">Communication Review</h1>
        <p className="mt-3 max-w-4xl leading-7 text-[var(--muted)]">
          Review eligible stream and group discussions manually, automatically, or on a schedule. Private DMs, group DMs, and mail are excluded by an allowlisted query boundary. Keywords create candidates only; human approval creates a report.
        </p>
      </section>

      <form className="surface rounded-md p-6" onSubmit={saveConfiguration}>
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Operation and safety</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {toggleRows.map(([key, title, description]) => (
            <label className={`rounded-md border p-4 ${key.toString().startsWith("create") || key.toString().startsWith("send") || key.toString().startsWith("apply") ? "border-red-400/40" : "border-[var(--line)]"}`} key={key}>
              <span className="flex items-center gap-3"><input checked={Boolean(config[key])} onChange={() => toggle(key)} type="checkbox" /><strong>{title}</strong></span>
              <span className="mt-2 block text-sm text-[var(--muted)]">{description}</span>
            </label>
          ))}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-2 text-sm font-semibold">Timezone<input className="form-field" onChange={(event) => setConfig({ ...config, timezone: event.target.value })} value={config.timezone} /></label>
          <label className="grid gap-2 text-sm font-semibold">Daily local time<input className="form-field" onChange={(event) => setConfig({ ...config, scheduleLocalTime: event.target.value })} type="time" value={config.scheduleLocalTime} /></label>
          <label className="grid gap-2 text-sm font-semibold">Automatic interval (minutes)<input className="form-field" min={15} onChange={(event) => setConfig({ ...config, automaticIntervalMinutes: Number(event.target.value) })} type="number" value={config.automaticIntervalMinutes} /></label>
          <label className="grid gap-2 text-sm font-semibold">Max items per run<input className="form-field" min={10} onChange={(event) => setConfig({ ...config, maxItemsPerRun: Number(event.target.value) })} type="number" value={config.maxItemsPerRun} /></label>
          <label className="grid gap-2 text-sm font-semibold">Max items per day<input className="form-field" min={10} onChange={(event) => setConfig({ ...config, maxItemsPerDay: Number(event.target.value) })} type="number" value={config.maxItemsPerDay} /></label>
          <label className="grid gap-2 text-sm font-semibold">Provider calls per run<input className="form-field" min={0} onChange={(event) => setConfig({ ...config, providerCallBudget: Number(event.target.value) })} type="number" value={config.providerCallBudget} /></label>
          <label className="grid gap-2 text-sm font-semibold">Token budget<input className="form-field" min={0} onChange={(event) => setConfig({ ...config, tokenBudget: Number(event.target.value) })} type="number" value={config.tokenBudget} /></label>
          <label className="grid gap-2 text-sm font-semibold">Estimated USD budget<input className="form-field" min={0} onChange={(event) => setConfig({ ...config, estimatedCostBudgetUsd: Number(event.target.value) })} step="0.01" type="number" value={config.estimatedCostBudgetUsd} /></label>
          <label className="grid gap-2 text-sm font-semibold">Primary model<input className="form-field" onChange={(event) => setConfig({ ...config, primaryModel: event.target.value })} value={config.primaryModel} /></label>
          <label className="grid gap-2 text-sm font-semibold">Fallback model<input className="form-field" onChange={(event) => setConfig({ ...config, fallbackModel: event.target.value })} value={config.fallbackModel} /></label>
          <label className="grid gap-2 text-sm font-semibold">Policy version<input className="form-field" onChange={(event) => setConfig({ ...config, policyVersion: event.target.value })} value={config.policyVersion} /></label>
          <label className="grid gap-2 text-sm font-semibold">Restriction decay days<input className="form-field" min={1} onChange={(event) => setConfig({ ...config, restrictionDecayDays: Number(event.target.value) })} type="number" value={config.restrictionDecayDays} /></label>
        </div>
        <div className="mt-5 flex justify-end"><button className="btn-primary" disabled={isPending} type="submit">Save configuration</button></div>
      </form>

      <section className="surface rounded-md p-6">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Run now or backfill</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Dry run records counts and cost estimates but creates no candidates, reports, notifications, or restrictions.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">Start<input className="form-field" onChange={(event) => setWindowStart(event.target.value)} type="datetime-local" value={windowStart} /></label>
          <label className="grid gap-2 text-sm font-semibold">End<input className="form-field" onChange={(event) => setWindowEnd(event.target.value)} type="datetime-local" value={windowEnd} /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2"><input checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} type="checkbox" /> Dry run</label>
          <label className="flex items-center gap-2"><input checked={backfill} onChange={(event) => setBackfill(event.target.checked)} type="checkbox" /> Backfill</label>
          <button className="btn-primary ml-auto" disabled={isPending || !config.manualEnabled} onClick={runReview} type="button">Queue review</button>
        </div>
        {message ? <p className="mt-4 rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      </section>

      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold text-[var(--gold)]">Run history</h2><button className="btn-secondary" onClick={() => void refresh()} type="button">Refresh</button></div>
        <div className="mt-4 grid gap-3">
          {view.runs.length === 0 ? <p className="text-[var(--muted)]">No communication review runs yet.</p> : null}
          {view.runs.map((run) => (
            <article className="rounded-md border border-[var(--line)] p-4" key={run.id}>
              <p className="font-semibold text-[var(--gold)]">{run.reference} · {run.mode.toLowerCase()} · {run.status.toLowerCase()}{run.dryRun ? " · dry run" : ""}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">Processed {run.processedCount}; candidates {run.candidateCount}; deduplicated {run.deduplicatedCount}; provider calls {run.providerCallCount}; tokens {run.providerTokenCount}; estimated ${run.estimatedCostUsd.toFixed(4)}</p>
              {run.error ? <p className="mt-2 text-sm text-red-200">{run.error}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="surface rounded-md p-6">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Human review queue</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">A candidate is not a report. Review context and source before approving or dismissing it.</p>
        <div className="mt-4 grid gap-3">
          {view.candidates.length === 0 ? <p className="text-[var(--muted)]">No review candidates.</p> : null}
          {view.candidates.map((candidate) => <CandidateCard candidate={candidate} key={candidate.id} onUpdated={() => void refresh()} />)}
        </div>
      </section>
    </div>
  );
}
