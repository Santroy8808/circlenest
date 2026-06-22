"use client";

import { useState, useTransition } from "react";
import type { AdminActionCard } from "@/modules/admin-moderation/types";

export function AdminActionWizard({ action }: { action: AdminActionCard }) {
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveFeatureFlag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled, description })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not update feature flag.");
        return;
      }

      setMessage("Feature flag saved and audited.");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Wizard</p>
        <h1 className="mt-3 text-3xl font-semibold">{action.title}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">{action.description}</p>
        <span className="pill mt-4 inline-flex rounded-full px-3 py-1 text-xs">Risk: {action.risk}</span>
      </section>

      <section className="surface rounded-md p-6">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Walkthrough</h2>
        <ol className="mt-4 grid gap-3">
          {action.steps.map((step, index) => (
            <li className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={step}>
              <span className="mr-3 font-semibold text-[var(--gold)]">{index + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      {action.key === "feature-flags" ? (
        <form className="surface grid gap-4 rounded-md p-6" onSubmit={saveFeatureFlag}>
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Set feature flag</h2>
          <input className="form-field" onChange={(event) => setKey(event.target.value)} placeholder="feature.key" value={key} />
          <textarea
            className="form-field min-h-24 resize-y"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Reason or description"
            value={description}
          />
          <label className="flex items-center gap-3 rounded-md border border-[var(--line)] p-4">
            <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
            Enabled
          </label>
          {message ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
          {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          <button className="btn-primary justify-self-end" disabled={isPending || key.trim().length < 2} type="submit">
            {isPending ? "Saving..." : "Save feature flag"}
          </button>
        </form>
      ) : (
        <section className="surface rounded-md p-6">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Action unavailable</h2>
          <p className="mt-3 leading-7 text-[var(--muted)]">This admin action is not enabled in the live action list.</p>
        </section>
      )}
    </div>
  );
}
