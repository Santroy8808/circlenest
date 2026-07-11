"use client";

import { MembershipTier } from "@prisma/client";
import { useState, useTransition } from "react";

type StatusChangeAccount = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  suspended: boolean;
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

  function runLifecycleAction(action: "suspend" | "restore" | "delete") {
    if (!account) return;

    if (action === "suspend" && !window.confirm(`Suspend @${account.username}? They will be signed out and unable to log in until restored.`)) return;
    if (action === "restore" && !window.confirm(`Restore @${account.username}'s access?`)) return;

    let confirmation: string | undefined;
    if (action === "delete") {
      const acknowledged = window.confirm(
        `PERMANENT DELETION WARNING\n\nThis permanently deletes @${account.username}, their account data, and associated media. This cannot be undone. Continue?`
      );
      if (!acknowledged) return;
      confirmation = window.prompt(`Type DELETE ${account.username} exactly to confirm permanent deletion.`) ?? undefined;
      if (confirmation !== `DELETE ${account.username}`) {
        setMessage("Deletion cancelled. The confirmation phrase did not match.");
        return;
      }
    }

    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/account-lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          userIdentifier: account.username,
          reason: action === "delete" ? "Admin permanently deleted account." : action === "suspend" ? "Admin suspended account." : "Admin restored account.",
          ...(confirmation ? { confirmation } : {})
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; action?: string; cleanupFailures?: number } | null;

      if (!response.ok) {
        setMessage(payload?.error ?? "Could not update account access.");
        return;
      }

      if (action === "delete") {
        setAccount(null);
        setMessage(payload?.cleanupFailures ? "Account deleted. Some media cleanup requires follow-up." : "Account permanently deleted.");
        return;
      }

      setAccount((current) => (current ? { ...current, suspended: action === "suspend" } : current));
      setMessage(action === "suspend" ? "Account suspended and existing sessions revoked." : "Account restored. The member must sign in again.");
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
            {account.suspended ? <p className="mt-2 text-sm font-semibold text-red-200">Suspended - sign-in and member activity are blocked.</p> : null}
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

      <section className="rounded-md border border-red-400/50 bg-red-950/20 p-5">
        <h2 className="text-2xl font-semibold text-red-200">4. Account controls</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-red-100/80">
          These controls affect account access. Suspension can be reversed. Deletion is permanent and removes the account, associated records, and stored media where cleanup succeeds.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {account?.suspended ? (
            <button className="rounded-full border border-red-300/70 px-5 py-3 font-semibold text-red-100 transition hover:bg-red-900/40 disabled:opacity-60" disabled={isPending || !account} onClick={() => runLifecycleAction("restore")} type="button">
              {isPending ? "Working..." : "Restore account"}
            </button>
          ) : (
            <button className="rounded-full border border-red-300/70 px-5 py-3 font-semibold text-red-100 transition hover:bg-red-900/40 disabled:opacity-60" disabled={isPending || !account} onClick={() => runLifecycleAction("suspend")} type="button">
              {isPending ? "Working..." : "Suspend account"}
            </button>
          )}
          <button className="rounded-full border border-red-300 bg-red-700/80 px-5 py-3 font-semibold text-white transition hover:bg-red-600 disabled:opacity-60" disabled={isPending || !account} onClick={() => runLifecycleAction("delete")} type="button">
            {isPending ? "Working..." : "Delete account permanently"}
          </button>
        </div>
        <p className="mt-4 text-xs leading-5 text-red-100/70">
          Delete requires two confirmations, including typing the exact phrase <strong>DELETE username</strong>. Admin and God accounts cannot be changed here.
        </p>
      </section>
    </div>
  );
}
