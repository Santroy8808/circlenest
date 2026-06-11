"use client";

import { useMemo, useState } from "react";

type BillingView = {
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  subscriptionTier: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialEndsAt: string | null;
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
} | null;

type BillingSettingsProps = {
  role: string;
  subscriptionTier: string;
  billingSubscription: BillingView;
};

type BillingTier = "PLUS" | "PRO";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function tierLabel(tier: string) {
  const normalized = tier.trim().toUpperCase();
  if (normalized === "PLUS") return "Plus";
  if (normalized === "PRO") return "Pro";
  if (normalized === "AUDITOR") return "Auditor";
  return "Free";
}

function statusLabel(status: string) {
  const normalized = status.trim().toUpperCase();
  if (normalized === "ACTIVE") return "Active";
  if (normalized === "TRIALING") return "Trialing";
  if (normalized === "PAST_DUE") return "Past due";
  if (normalized === "UNPAID") return "Unpaid";
  if (normalized === "CANCELED") return "Canceled";
  if (normalized === "INCOMPLETE") return "Incomplete";
  if (normalized === "INCOMPLETE_EXPIRED") return "Incomplete expired";
  if (normalized === "PAUSED") return "Paused";
  return "Inactive";
}

function statusTone(status: string) {
  const normalized = status.trim().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "TRIALING") return "border-emerald-400/40 bg-emerald-300/10 text-emerald-200";
  if (normalized === "PAST_DUE" || normalized === "UNPAID") return "border-amber-400/40 bg-amber-300/10 text-amber-200";
  if (normalized === "CANCELED" || normalized === "INCOMPLETE" || normalized === "INCOMPLETE_EXPIRED" || normalized === "PAUSED") {
    return "border-rose-400/40 bg-rose-300/10 text-rose-200";
  }
  return "border-slate-400/40 bg-slate-300/10 text-slate-200";
}

export function BillingSettings({ role, subscriptionTier, billingSubscription }: BillingSettingsProps) {
  const [status, setStatus] = useState("");
  const currentTier = subscriptionTier.trim().toUpperCase();
  const currentBillingStatus = billingSubscription?.status ?? "INACTIVE";
  const currentBillingProvider = billingSubscription?.provider?.trim().toUpperCase() ?? "NONE";
  const hasPlusOrHigher = currentTier === "PLUS" || currentTier === "PRO" || currentTier === "ADMIN";

  const isPaidTier = useMemo(() => ["PLUS", "PRO"].includes(currentTier), [currentTier]);
  const currentPeriodText = billingSubscription?.currentPeriodEnd ? formatDate(billingSubscription.currentPeriodEnd) : "-";
  const cancelText = billingSubscription?.cancelAtPeriodEnd ? `Downgrade at period end: ${currentPeriodText}` : null;
  const trialText = billingSubscription?.trialEndsAt ? `Trial ends: ${formatDate(billingSubscription.trialEndsAt)}` : null;
  const pauseText = billingSubscription?.pausedAt ? `Paused: ${formatDate(billingSubscription.pausedAt)}` : null;

  async function startCheckout(tier: BillingTier) {
    setStatus(`Starting ${tierLabel(tier)} checkout...`);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) {
      setStatus(body.error ?? "Could not start checkout.");
      return;
    }
    window.location.assign(body.url);
  }

  async function openPortal() {
    setStatus("Opening billing portal...");
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) {
      setStatus(body.error ?? "Could not open billing portal.");
      return;
    }
    window.location.assign(body.url);
  }

  return (
    <section id="subscription" className="mt-3 rounded border border-[var(--border)] p-3">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">My Subscription</h2>
      <p className="mt-1 text-xs text-slate-300">Current tier, billing status, and upgrade controls.</p>

      <div className="mt-3 grid gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Current tier:</span>
          <span className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-strong)]">{tierLabel(currentTier)}</span>
          {role.trim().toUpperCase() === "ADMIN" ? <span className="rounded border border-amber-400/40 bg-amber-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-200">Admin role separate</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Billing status:</span>
          <span className={`rounded border px-2 py-0.5 text-xs ${statusTone(currentBillingStatus)}`}>{statusLabel(currentBillingStatus)}</span>
        </div>
        <div className="grid gap-1 text-xs text-slate-400">
          <p>Plan on file: {billingSubscription ? tierLabel(billingSubscription.subscriptionTier) : "-"}</p>
          <p>Billing provider: {currentBillingProvider === "MOCK" ? "Mock ledger" : currentBillingProvider === "STRIPE" ? "Stripe" : "-"}</p>
          <p>Current period ends: {currentPeriodText}</p>
          <p>Trial ends: {trialText ? trialText.replace("Trial ends: ", "") : "-"}</p>
          <p>Payment issue: {currentBillingStatus === "PAST_DUE" || currentBillingStatus === "UNPAID" ? "Yes" : "No"}</p>
          <p>Cancel at period end: {billingSubscription?.cancelAtPeriodEnd ? "Yes" : "No"}</p>
          {cancelText ? <p>{cancelText}</p> : null}
          {trialText ? <p>{trialText}</p> : null}
          {pauseText ? <p>{pauseText}</p> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={hasPlusOrHigher}
          onClick={() => void startCheckout("PLUS")}
          className="rounded border border-[var(--border)] bg-[#8f7228] px-3 py-2 text-sm text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {currentTier === "PLUS" ? "Plus current" : hasPlusOrHigher ? "Plus included" : "Upgrade to Plus"}
        </button>
        <button
          type="button"
          disabled={currentTier === "PRO"}
          onClick={() => void startCheckout("PRO")}
          className="rounded border border-[var(--border)] bg-[#8f7228] px-3 py-2 text-sm text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {currentTier === "PRO" ? "Pro current" : "Upgrade to Pro"}
        </button>
        <button
          type="button"
          disabled={!isPaidTier || !billingSubscription?.providerCustomerId}
          onClick={() => void openPortal()}
          className="rounded border border-[var(--border)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Manage billing
        </button>
      </div>

      {!billingSubscription?.providerCustomerId && isPaidTier ? <p className="mt-2 text-xs text-amber-300">Billing is not connected yet.</p> : null}
      {status ? <p className="mt-2 text-xs text-slate-400">{status}</p> : null}
      {billingSubscription?.providerSubscriptionId ? <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">Provider subscription linked</p> : null}
      {currentBillingProvider === "MOCK" ? <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-sky-300">Mock billing log active</p> : null}
    </section>
  );
}
