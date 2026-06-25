"use client";

import { MembershipTier } from "@prisma/client";
import { useState, useTransition } from "react";

type StatusChangeAccount = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  tier: MembershipTier;
  tierName: string;
  orgUpgradeEligible: boolean;
  storageLimitBytes: string;
  platformCredits: number;
};

const tierOptions = [
  { value: MembershipTier.FREE, label: "Free", summary: "Core social access." },
  { value: MembershipTier.CONTRIBUTOR, label: "Contributor", summary: "Expanded community access and storage." },
  { value: MembershipTier.PROFESSIONAL, label: "Professional", summary: "Business tools, storefront, ads, jobs, and creator access." },
  { value: MembershipTier.AUDITOR, label: "Auditor", summary: "Auditor account status and auditor profile access." },
  { value: MembershipTier.ORG, label: "Org", summary: "Reveal the hidden Org upgrade option. Stripe payment activates the tier." }
];

function bytesLabel(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return value;
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${bytes} bytes`;
}

export function AdminStatusChangeWizard() {
  const [identifier, setIdentifier] = useState("");
  const [account, setAccount] = useState<StatusChangeAccount | null>(null);
  const [targetTier, setTargetTier] = useState<MembershipTier>(MembershipTier.CONTRIBUTOR);
  const [reason, setReason] = useState("Admin membership status correction.");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function findAccount() {
    setMessage("");
    setAccount(null);

    startTransition(async () => {
      const response = await fetch(`/api/admin/status-change?identifier=${encodeURIComponent(identifier)}`, {
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => null)) as { account?: StatusChangeAccount | null; error?: string } | null;

      if (!response.ok) {
        setMessage(payload?.error ?? "Could not search account.");
        return;
      }

      if (!payload?.account) {
        setMessage("No account found.");
        return;
      }

      setAccount(payload.account);
      setTargetTier(payload.account.tier);
    });
  }

  function applyStatusChange() {
    setMessage("");

    startTransition(async () => {
      const response = await fetch("/api/admin/status-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIdentifier: identifier,
          targetTier,
          reason
        })
      });
      const payload = (await response.json().catch(() => null)) as { account?: StatusChangeAccount; error?: string } | null;

      if (!response.ok || !payload?.account) {
        setMessage(payload?.error ?? "Could not change membership status.");
        return;
      }

      setAccount(payload.account);
      setTargetTier(payload.account.tier);
      setMessage(targetTier === MembershipTier.ORG ? "Org upgrade option revealed. The member must complete Stripe checkout to activate it." : "Membership status changed.");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Wizard</p>
        <h1 className="mt-3 text-3xl font-semibold">Status Change</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Permanently correct normal membership tiers. Choosing Org does not activate Org access; it reveals the hidden Org upgrade option so the member can complete Stripe payment.
        </p>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">1. Find account</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input className="form-field" onChange={(event) => setIdentifier(event.target.value)} placeholder="email or username" value={identifier} />
          <button className="btn-secondary" disabled={isPending || identifier.trim().length === 0} onClick={findAccount} type="button">
            Search
          </button>
        </div>
        {account ? (
          <article className="mt-4 rounded-md border border-[var(--line)] bg-black/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">{account.displayName}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  @{account.username} - {account.email} - {account.role}
                </p>
              </div>
              <span className="pill rounded-full px-3 py-1 text-xs">{account.tierName}</span>
            </div>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Storage limit: {bytesLabel(account.storageLimitBytes)} - Platform credits: {account.platformCredits}
            </p>
            {account.orgUpgradeEligible ? <p className="mt-2 text-sm text-[var(--gold)]">Org upgrade option is visible to this account.</p> : null}
          </article>
        ) : null}
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">2. Choose status</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Free, Contributor, Professional, and Auditor are direct status corrections. Org only grants upgrade eligibility; Stripe payment activates it.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {tierOptions.map((option) => (
            <label className="module-card cursor-pointer rounded-md p-4" key={option.value}>
              <div className="flex items-start gap-3">
                <input
                  checked={targetTier === option.value}
                  className="mt-1"
                  name="targetTier"
                  onChange={() => setTargetTier(option.value)}
                  type="radio"
                />
                <span>
                  <span className="block font-semibold text-[var(--gold)]">{option.label}</span>
                  <span className="mt-1 block text-sm text-[var(--muted)]">{option.summary}</span>
                </span>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">3. Confirm reason</h2>
        <label className="mt-4 grid gap-2">
          <span className="form-label">Audit reason</span>
          <textarea className="form-field min-h-24" onChange={(event) => setReason(event.target.value)} value={reason} />
        </label>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={isPending || !account || account.tier === targetTier || reason.trim().length < 5} onClick={applyStatusChange} type="button">
            {isPending ? "Changing..." : "Apply Status Change"}
          </button>
          {message ? <span className="text-sm text-[var(--muted)]">{message}</span> : null}
        </div>
      </section>
    </div>
  );
}
