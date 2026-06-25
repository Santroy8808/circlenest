"use client";

import { useState, useTransition } from "react";
import type { AdScheduleAdminView } from "@/modules/ads-credits/types";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function AdminAdScheduleWizard({ initialView }: { initialView: AdScheduleAdminView }) {
  const [view, setView] = useState(initialView);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function recalculate() {
    setMessage("");
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/admin/ad-schedule/recalculate", {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; view?: AdScheduleAdminView; runs?: AdScheduleAdminView["latestRuns"] } | null;

      if (!response.ok || !payload?.view) {
        setError(payload?.error ?? "Could not recalculate ad schedules.");
        return;
      }

      setView(payload.view);
      const slotCount = payload.runs?.reduce((total, run) => total + run.slotCount, 0) ?? 0;
      setMessage(`Recalculated ${payload.runs?.length ?? 0} placement schedule(s), ${slotCount} future slot(s).`);
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Wizard</p>
        <h1 className="mt-3 text-3xl font-semibold">Global Ad Schedule</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Recalculate the fixed ad-time inventory for the rest of the current platform day. The normal midnight calculation still runs for the next day.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
          <span className="pill rounded-full px-3 py-1">{view.slotSeconds}s slot unit</span>
          <span className="pill rounded-full px-3 py-1">{view.timeZone}</span>
          <span className="pill rounded-full px-3 py-1">Next automatic: {formatDateTime(view.nextAutomaticRunAt)}</span>
        </div>
      </section>

      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--gold)]">Force Recalculation</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              This clears only future slots for today and rebuilds them from the current active campaign auction weights.
            </p>
          </div>
          <button className="btn-primary" disabled={isPending} onClick={recalculate} type="button">
            {isPending ? "Recalculating..." : "Recalculate rest of today"}
          </button>
        </div>
        {message ? <p className="mt-4 rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      </section>

      <section className="surface rounded-md p-6">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Latest Schedule Runs</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {view.latestRuns.length > 0 ? (
            view.latestRuns.map((run) => (
              <article className="module-card rounded-md p-4" key={run.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{run.placementLabel}</p>
                    <h3 className="mt-2 text-lg font-semibold">{run.slotCount} slot(s)</h3>
                  </div>
                  <span className="pill rounded-full px-3 py-1 text-xs">{run.forced ? "forced" : "auto"}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{run.campaignCount} campaign(s)</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {formatDateTime(run.scheduledFrom)} to {formatDateTime(run.scheduledUntil)}
                </p>
                {run.reason ? <p className="mt-3 text-xs text-[var(--muted)]">{run.reason}</p> : null}
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-5 text-[var(--muted)] md:col-span-3">No ad schedules have been calculated yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
