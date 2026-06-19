"use client";

import { useState, useTransition } from "react";

type CreditAccount = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  tier: string;
  platformCredits: number;
};

type RecentLedgerEntry = {
  id: string;
  userLabel: string;
  amount: number;
  reason: string;
  sourceType: string | null;
  createdAt: string;
};

export function AdminPlatformCreditsWizard({ recentLedger }: { recentLedger: RecentLedgerEntry[] }) {
  const [identifier, setIdentifier] = useState("");
  const [account, setAccount] = useState<CreditAccount | null>(null);
  const [amount, setAmount] = useState(25);
  const [reason, setReason] = useState("Launch support credit grant.");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function findAccount() {
    setMessage("");
    setAccount(null);

    startTransition(async () => {
      const response = await fetch(`/api/admin/platform-credits?identifier=${encodeURIComponent(identifier)}`, {
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => null)) as { account?: CreditAccount | null; error?: string } | null;

      if (!response.ok) {
        setMessage(payload?.error ?? "Could not search account.");
        return;
      }

      if (!payload?.account) {
        setMessage("No account found.");
        return;
      }

      setAccount(payload.account);
    });
  }

  function adjustCredits() {
    setMessage("");

    startTransition(async () => {
      const response = await fetch("/api/admin/platform-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIdentifier: identifier,
          amount,
          reason
        })
      });
      const payload = (await response.json().catch(() => null)) as { account?: CreditAccount; error?: string } | null;

      if (!response.ok || !payload?.account) {
        setMessage(payload?.error ?? "Could not adjust platform credits.");
        return;
      }

      setAccount(payload.account);
      setMessage("Platform credits updated.");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Wizard</p>
        <h1 className="mt-3 text-3xl font-semibold">Platform credits</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Adjust platform-only credits for ads, boosts, listings, and internal promotional tools. This does not create, refund, or alter real-money balances.
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
                  @{account.username} - {account.email} - {account.tier}
                </p>
              </div>
              <span className="pill rounded-full px-3 py-1 text-xs">{account.platformCredits} credits</span>
            </div>
          </article>
        ) : null}
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">2. Adjust credits</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Use a positive number to grant credits. Use a negative number to remove credits. Every adjustment writes a ledger entry and admin audit log.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Amount</span>
            <input className="form-field" onChange={(event) => setAmount(Number(event.target.value))} type="number" value={amount} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Reason</span>
            <input className="form-field" onChange={(event) => setReason(event.target.value)} value={reason} />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={isPending || !account || amount === 0 || reason.trim().length < 5} onClick={adjustCredits} type="button">
            {isPending ? "Updating..." : "Update platform credits"}
          </button>
          {message ? <span className="text-sm text-[var(--muted)]">{message}</span> : null}
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Recent credit ledger</h2>
        <div className="mt-4 grid gap-3">
          {recentLedger.length > 0 ? (
            recentLedger.map((entry) => (
              <article className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={entry.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{entry.userLabel}</strong>
                  <span className="pill rounded-full px-3 py-1 text-xs">{entry.amount > 0 ? `+${entry.amount}` : entry.amount} credits</span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">{entry.reason}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{new Date(entry.createdAt).toLocaleString()}</p>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No credit ledger entries yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
