"use client";

import { useMemo, useState, useTransition } from "react";
import type { PlatformCostRuleView } from "@/modules/platform-pricing/types";

function durationLabel(days: number | null) {
  if (!days) return "Action based";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function AdminPricingWizard({ initialRules }: { initialRules: PlatformCostRuleView[] }) {
  const [rules, setRules] = useState(initialRules);
  const [selectedKey, setSelectedKey] = useState(initialRules[0]?.key ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedRule = useMemo(() => rules.find((rule) => rule.key === selectedKey) ?? rules[0], [rules, selectedKey]);

  function patchSelected<K extends keyof PlatformCostRuleView>(key: K, value: PlatformCostRuleView[K]) {
    if (!selectedRule) return;
    setRules((current) => current.map((rule) => (rule.key === selectedRule.key ? { ...rule, [key]: value } : rule)));
  }

  function saveRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRule) return;
    setMessage("");
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/admin/pricing-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: selectedRule.key,
          label: selectedRule.label,
          description: selectedRule.description ?? "",
          creditCost: selectedRule.creditCost,
          durationDays: selectedRule.durationDays,
          includedUnits: selectedRule.includedUnits,
          unitLabel: selectedRule.unitLabel,
          active: selectedRule.active,
          sortOrder: selectedRule.sortOrder
        })
      });
      const payload = (await response.json()) as { error?: string; rule?: PlatformCostRuleView };

      if (!response.ok || !payload.rule) {
        setError(payload.error ?? "Could not save pricing rule.");
        return;
      }

      setRules((current) => current.map((rule) => (rule.key === payload.rule?.key ? payload.rule : rule)));
      setMessage(`${payload.rule.label} saved. This changed global pricing only; no user campaign was created.`);
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Wizard</p>
        <h1 className="mt-3 text-3xl font-semibold">Platform Pricing</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Set relative global credit costs. Admins define prices and durations here; users still create their own listings,
          campaigns, boosts, and mail sends from their own account.
        </p>
      </section>

      <section className="surface rounded-md p-6">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Current Cost Table</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {rules.map((rule) => (
            <button
              className={rule.key === selectedRule?.key ? "pricing-rule-card is-active" : "pricing-rule-card"}
              key={rule.key}
              onClick={() => {
                setSelectedKey(rule.key);
                setMessage("");
                setError("");
              }}
              type="button"
            >
              <span className="pricing-rule-card-title">{rule.label}</span>
              <span>{rule.subjectLabel}</span>
              <strong>{rule.creditCost} credits</strong>
              <span>{durationLabel(rule.durationDays)} {rule.active ? "" : " | inactive"}</span>
            </button>
          ))}
        </div>
      </section>

      {selectedRule ? (
        <form className="surface grid gap-4 rounded-md p-6" onSubmit={saveRule}>
          <div>
            <h2 className="text-2xl font-semibold text-[var(--gold)]">Edit Price Rule</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Rule key: <code>{selectedRule.key}</code>. The key and subject are locked so reporting and user estimators stay stable.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="form-label">Display label</span>
              <input className="form-field" onChange={(event) => patchSelected("label", event.target.value)} value={selectedRule.label} />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Unit label</span>
              <input className="form-field" onChange={(event) => patchSelected("unitLabel", event.target.value)} value={selectedRule.unitLabel} />
            </label>
          </div>

          <label className="grid gap-2">
            <span className="form-label">Description</span>
            <textarea
              className="form-field min-h-24 resize-y"
              onChange={(event) => patchSelected("description", event.target.value)}
              value={selectedRule.description ?? ""}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="grid gap-2">
              <span className="form-label">Credit cost</span>
              <input
                className="form-field"
                inputMode="numeric"
                min={0}
                onChange={(event) => patchSelected("creditCost", Number(event.target.value))}
                type="number"
                value={selectedRule.creditCost}
              />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Duration days</span>
              <input
                className="form-field"
                inputMode="numeric"
                min={0}
                onChange={(event) => patchSelected("durationDays", event.target.value ? Number(event.target.value) : null)}
                placeholder="Action based"
                type="number"
                value={selectedRule.durationDays ?? ""}
              />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Included units</span>
              <input
                className="form-field"
                inputMode="numeric"
                min={0}
                onChange={(event) => patchSelected("includedUnits", event.target.value ? Number(event.target.value) : null)}
                placeholder="None"
                type="number"
                value={selectedRule.includedUnits ?? ""}
              />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Sort order</span>
              <input
                className="form-field"
                inputMode="numeric"
                min={0}
                onChange={(event) => patchSelected("sortOrder", Number(event.target.value))}
                type="number"
                value={selectedRule.sortOrder}
              />
            </label>
          </div>

          <label className="flex items-center gap-3 rounded-md border border-[var(--line)] p-4">
            <input checked={selectedRule.active} onChange={(event) => patchSelected("active", event.target.checked)} type="checkbox" />
            Active and available to users
          </label>

          {message ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
          {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

          <button className="btn-primary justify-self-end" disabled={isPending} type="submit">
            {isPending ? "Saving..." : "Save global price"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
