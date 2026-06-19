"use client";

import { MembershipTier, PromotionAccessScope } from "@prisma/client";
import { useState, useTransition } from "react";

type LaunchTargetTier = "CONTRIBUTOR" | "PROFESSIONAL";

type LaunchAccessView = {
  plans: Array<{
    tier: MembershipTier;
    displayName: string;
    standardPriceCents: number;
    founderPriceCents: number | null;
    founderMemberCap: number | null;
    founderWindowDays: number | null;
    monthlyCreditBudget: number;
    populationCreditTiers: unknown;
  }>;
  adRules: Array<{
    key: string;
    label: string;
    description: string | null;
    value: number;
    unit: string;
    active: boolean;
  }>;
  activeGrants: Array<{
    id: string;
    scope: PromotionAccessScope;
    userLabel: string;
    sourceTier: MembershipTier;
    targetTier: MembershipTier;
    label: string;
    reason: string | null;
    expiresAt: string;
  }>;
};

function money(cents: number | null) {
  if (cents === null) return "n/a";
  return `$${(cents / 100).toFixed(2)}`;
}

export function AdminLaunchAccessWizard({ initialView }: { initialView: LaunchAccessView }) {
  const [view, setView] = useState(initialView);
  const [scope, setScope] = useState<PromotionAccessScope>(PromotionAccessScope.GLOBAL);
  const [userIdentifier, setUserIdentifier] = useState("");
  const [targetTier, setTargetTier] = useState<LaunchTargetTier>("CONTRIBUTOR");
  const [durationValue, setDurationValue] = useState(6);
  const [durationUnit, setDurationUnit] = useState<"days" | "months">("months");
  const [label, setLabel] = useState("Launch Access");
  const [reason, setReason] = useState("Promotional launch access for early platform adoption.");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function applyPreset(tier: LaunchTargetTier) {
    setTargetTier(tier);
    setDurationValue(tier === "CONTRIBUTOR" ? 6 : 2);
    setDurationUnit("months");
    setLabel(tier === "CONTRIBUTOR" ? "Free to Contributor launch access" : "Free to Professional launch access");
  }

  function createGrant() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/launch-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          userIdentifier,
          sourceTier: "FREE",
          targetTier,
          durationValue,
          durationUnit,
          label,
          reason
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "Could not create launch access.");
        return;
      }

      const nextResponse = await fetch("/api/admin/launch-access", { cache: "no-store" });
      const nextView = (await nextResponse.json()) as LaunchAccessView;
      setView(nextView);
      setMessage("Launch access grant created.");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Wizard</p>
        <h1 className="mt-3 text-3xl font-semibold">Launch access and founder pricing</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Use this to grow the platform without permanently changing someone&apos;s paid tier. Promotional grants alter effective access only until expiration.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Founder pricing</h2>
          <div className="mt-4 grid gap-3">
            {view.plans.map((plan) => (
              <article className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={plan.tier}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{plan.displayName}</strong>
                  <span className="pill rounded-full px-3 py-1 text-xs">
                    {money(plan.founderPriceCents)} founder / {money(plan.standardPriceCents)} standard
                  </span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  First {plan.founderMemberCap ?? "n/a"} members or {plan.founderWindowDays ?? "n/a"} days. Base monthly credits: {plan.monthlyCreditBudget}.
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Ad experience guardrails</h2>
          <div className="mt-4 grid gap-3">
            {view.adRules.map((rule) => (
              <article className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={rule.key}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{rule.label}</strong>
                  <span className="pill rounded-full px-3 py-1 text-xs">
                    {rule.value} {rule.unit}
                  </span>
                </div>
                {rule.description ? <p className="mt-2 text-sm text-[var(--muted)]">{rule.description}</p> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Create promotional access</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="btn-secondary" onClick={() => applyPreset("CONTRIBUTOR")} type="button">
            Preset: 6-month Contributor
          </button>
          <button className="btn-secondary" onClick={() => applyPreset("PROFESSIONAL")} type="button">
            Preset: 2-month Professional
          </button>
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">Presets only fill starter values. Admins can choose any allowed duration before creating the grant.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Scope</span>
            <select className="form-field" onChange={(event) => setScope(event.target.value as PromotionAccessScope)} value={scope}>
              <option value={PromotionAccessScope.GLOBAL}>Global Free-tier launch access</option>
              <option value={PromotionAccessScope.USER}>Individual user launch access</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="form-label">User email or username</span>
            <input className="form-field" disabled={scope === PromotionAccessScope.GLOBAL} onChange={(event) => setUserIdentifier(event.target.value)} value={userIdentifier} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Target access</span>
            <select className="form-field" onChange={(event) => setTargetTier(event.target.value as LaunchTargetTier)} value={targetTier}>
              <option value="CONTRIBUTOR">Contributor</option>
              <option value="PROFESSIONAL">Professional</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="form-label">Duration amount</span>
            <input className="form-field" min={1} max={durationUnit === "months" ? 24 : 730} onChange={(event) => setDurationValue(Number(event.target.value))} type="number" value={durationValue} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Duration unit</span>
            <select className="form-field" onChange={(event) => setDurationUnit(event.target.value as "days" | "months")} value={durationUnit}>
              <option value="days">Days</option>
              <option value="months">Months</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="form-label">Label</span>
            <input className="form-field" onChange={(event) => setLabel(event.target.value)} value={label} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Reason</span>
            <input className="form-field" onChange={(event) => setReason(event.target.value)} value={reason} />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={isPending} onClick={createGrant} type="button">
            {isPending ? "Creating..." : "Create access grant"}
          </button>
          {message ? <span className="text-sm text-[var(--muted)]">{message}</span> : null}
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Active grants</h2>
        <div className="mt-4 grid gap-3">
          {view.activeGrants.length > 0 ? (
            view.activeGrants.map((grant) => (
              <article className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={grant.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{grant.label}</strong>
                  <span className="pill rounded-full px-3 py-1 text-xs">
                    {grant.sourceTier} to {grant.targetTier}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {grant.scope} - {grant.userLabel} - expires {new Date(grant.expiresAt).toLocaleDateString()}
                </p>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No active promotional access grants.</p>
          )}
        </div>
      </section>
    </div>
  );
}
