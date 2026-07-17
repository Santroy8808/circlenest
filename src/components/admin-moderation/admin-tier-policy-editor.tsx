"use client";

import { MembershipTier } from "@prisma/client";
import { useState, useTransition } from "react";
import type { TierPolicy } from "@/modules/membership-policy/policy";

type TierPolicyEditorView = {
  canManage: boolean;
  policies: TierPolicy[];
};

type PendingChange = {
  tier: MembershipTier;
  featureKey: string;
  featureLabel: string;
  current: boolean;
  next: boolean;
};

const featureRows = [
  { key: "feed.changeType", label: "Feed type controls" },
  { key: "groups.create", label: "Create groups" },
  { key: "groups.assignModerators", label: "Assign group moderators" },
  { key: "groups.unlimitedSize", label: "Unlimited group size" },
  { key: "events.create", label: "Create events" },
  { key: "market.createListing", label: "Create Market listings" },
  { key: "market.createAd", label: "Create Market ads" },
  { key: "market.storefront", label: "Business profile/storefront" },
  { key: "jobs.browse", label: "Browse jobs" },
  { key: "jobs.createListing", label: "Create job listings" },
  { key: "auditors.browse", label: "Browse auditors" },
  { key: "auditors.createProfile", label: "Create auditor profile" },
  { key: "ads.createGeneral", label: "General ad campaigns" },
  { key: "ads.createFundraiser", label: "Fundraiser ad campaigns" },
  { key: "writers.access", label: "Writers Corner" },
  { key: "fundraisers.create", label: "Create fundraisers" },
  { key: "invites.send", label: "Send invites" },
  { key: "support.createRequest", label: "Create support requests" },
  { key: "mail.massSend", label: "Mass mail" },
  { key: "mail.orgMassSend", label: "Org mass mail" },
  { key: "org.profile", label: "Org profile" },
  { key: "moderation.siteEligible", label: "Site moderation eligible" }
] as const;

function limitLabel(value: number | null, suffix = "") {
  return value === null ? "Unlimited" : `${value}${suffix}`;
}

function storageLabel(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${bytes / (1024 * 1024 * 1024)} GB`;
  return `${bytes / (1024 * 1024)} MB`;
}

function tierLabel(tier: MembershipTier) {
  if (tier === MembershipTier.FREE) return "Free";
  if (tier === MembershipTier.CONTRIBUTOR) return "Contributor";
  if (tier === MembershipTier.PROFESSIONAL) return "Professional";
  if (tier === MembershipTier.AUDITOR) return "Auditor";
  return "Org";
}

export function AdminTierPolicyEditor({ initialView }: { initialView: TierPolicyEditorView }) {
  const [policies, setPolicies] = useState(initialView.policies);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("God global tier permission update.");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const gridTemplateColumns = {
    gridTemplateColumns: `280px repeat(${policies.length}, minmax(130px, 1fr))`
  };

  function openToggle(policy: TierPolicy, row: (typeof featureRows)[number]) {
    const current = policy.features[row.key];

    setPendingChange({
      tier: policy.tier,
      featureKey: row.key,
      featureLabel: row.label,
      current,
      next: !current
    });
    setPassword("");
    setMessage("");
    setError("");
  }

  function saveChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingChange) return;
    setMessage("");
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/admin/tier-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: pendingChange.tier,
          featureKey: pendingChange.featureKey,
          allowed: pendingChange.next,
          password,
          reason
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Could not update tier policy.");
        return;
      }

      setPolicies((current) =>
        current.map((policy) =>
          policy.tier === pendingChange.tier
            ? {
                ...policy,
                features: {
                  ...policy.features,
                  [pendingChange.featureKey]: pendingChange.next
                }
              }
            : policy
        )
      );
      setMessage(`${tierLabel(pendingChange.tier)} ${pendingChange.featureLabel} is now ${pendingChange.next ? "enabled" : "disabled"}.`);
      setPendingChange(null);
      setPassword("");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">God Controls</p>
        <h1 className="mt-3 text-3xl font-semibold">Global Tier Permission Matrix</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Click a Yes or No cell to toggle that capability for the selected tier. Every change requires password confirmation and writes a critical audit log.
        </p>
      </section>

      {message ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}

      <section className="surface overflow-hidden rounded-md">
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid border-b border-[var(--line)] bg-black/20" style={gridTemplateColumns}>
              <div className="p-3 font-semibold text-[var(--gold)]">Privilege</div>
              {policies.map((policy) => (
                <div className="p-3 text-center font-semibold text-[var(--gold)]" key={policy.tier}>
                  {policy.displayName}
                </div>
              ))}
            </div>
            {featureRows.map((row) => (
              <div className="grid border-b border-[var(--line)] last:border-b-0" key={row.key} style={gridTemplateColumns}>
                <div className="p-3 text-sm font-semibold text-[var(--muted)]">{row.label}</div>
                {policies.map((policy) => {
                  const enabled = policy.features[row.key];

                  return (
                    <div className="p-2 text-center" key={`${policy.tier}-${row.key}`}>
                      <button
                        className={enabled ? "pill rounded-full px-3 py-1 text-xs text-[var(--gold)]" : "rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)]"}
                        onClick={() => openToggle(policy, row)}
                        type="button"
                      >
                        {enabled ? "Yes" : "No"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="surface overflow-hidden rounded-md">
        <div className="grid min-w-[980px] border-b border-[var(--line)] bg-black/20" style={gridTemplateColumns}>
          <div className="p-3 font-semibold text-[var(--gold)]">Limit</div>
          {policies.map((policy) => (
            <div className="p-3 text-center font-semibold text-[var(--gold)]" key={policy.tier}>
              {policy.displayName}
            </div>
          ))}
        </div>
        {[
          { label: "Group member cap", value: (policy: TierPolicy) => limitLabel(policy.limits.groupMemberCap) },
          {
            label: "Market listings",
            value: (policy: TierPolicy) =>
              policy.limits.marketActiveListingCap !== null
                ? `${policy.limits.marketActiveListingCap} active`
                : limitLabel(policy.limits.marketListingsPer14Days, " / 14d")
          },
          { label: "Market photos", value: (policy: TierPolicy) => limitLabel(policy.limits.marketListingPhotoCap) },
          { label: "Fundraisers", value: (policy: TierPolicy) => limitLabel(policy.limits.fundraiserPerMonth, " / month") },
          { label: "Storage", value: (policy: TierPolicy) => storageLabel(policy.limits.storageLimitBytes) }
        ].map((row) => (
          <div className="grid border-b border-[var(--line)] last:border-b-0" key={row.label} style={gridTemplateColumns}>
            <div className="p-3 text-sm font-semibold text-[var(--muted)]">{row.label}</div>
            {policies.map((policy) => (
              <div className="p-3 text-center text-sm" key={`${policy.tier}-${row.label}`}>
                {row.value(policy)}
              </div>
            ))}
          </div>
        ))}
      </section>

      {pendingChange ? (
        <form className="surface grid gap-4 rounded-md p-6" onSubmit={saveChange}>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Confirm Global Change</p>
            <h2 className="mt-2 text-2xl font-semibold">
              {tierLabel(pendingChange.tier)}: {pendingChange.featureLabel}
            </h2>
            <p className="mt-2 text-[var(--muted)]">
              Change from {pendingChange.current ? "Yes" : "No"} to {pendingChange.next ? "Yes" : "No"} for every account on this tier.
            </p>
          </div>
          <label className="grid gap-2">
            <span className="form-label">Audit reason</span>
            <textarea className="form-field min-h-24" onChange={(event) => setReason(event.target.value)} value={reason} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Confirm your password</span>
            <input className="form-field" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          </label>
          {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-3">
            <button className="btn-secondary" onClick={() => setPendingChange(null)} type="button">
              Cancel
            </button>
            <button className="btn-primary" disabled={isPending || password.length === 0 || reason.trim().length < 5} type="submit">
              {isPending ? "Saving..." : "Confirm And Save"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
