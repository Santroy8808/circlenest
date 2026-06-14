"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type WalletSummary = Readonly<{
  realMoneyBalanceCents: number;
  withdrawableBalanceCents: number;
  platformCreditBalance: number;
  testMoneyBalanceCents: number;
  testMoneyEnabled: boolean;
  pendingWithdrawalCents: number;
  currency: string;
}>;

type WithdrawalSummary = Readonly<{
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  requestedAt: string;
  batch: Readonly<{
    batchKey: string;
    scheduledFor: string;
    status: string;
  }> | null;
}>;

type WalletManagerProps = {
  wallet: WalletSummary;
  withdrawals: WithdrawalSummary[];
};

const FIELD_CLASS =
  "w-full rounded-lg border border-[#52647f] bg-[#253145] px-3 py-2 font-sans text-sm leading-5 text-[#f3f6fb] shadow-inner shadow-black/10 placeholder:text-slate-400 focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/25";

function formatMoneyCents(amountCents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
}

export function WalletManager({ wallet, withdrawals }: WalletManagerProps) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function submitWithdrawal() {
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/funds/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "Could not request withdrawal.");
        return;
      }
      setAmount("");
      setMessage("Withdrawal request queued for processor-backed batching.");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded border border-[#304058] bg-[#101a2c] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">Real funds</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">{formatMoneyCents(wallet.realMoneyBalanceCents, wallet.currency)}</p>
        </div>
        <div className="rounded border border-[#304058] bg-[#101a2c] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">Withdrawable</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">{formatMoneyCents(wallet.withdrawableBalanceCents, wallet.currency)}</p>
        </div>
        <div className="rounded border border-[#304058] bg-[#101a2c] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">Pending withdrawals</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">{formatMoneyCents(wallet.pendingWithdrawalCents, wallet.currency)}</p>
        </div>
        <div className="rounded border border-[#304058] bg-[#101a2c] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">Platform credits</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">{wallet.platformCreditBalance}</p>
        </div>
      </div>

      {wallet.testMoneyEnabled ? (
        <div className="rounded border border-sky-300/30 bg-sky-300/10 p-3 text-sm text-sky-100">
          Test money is enabled in this environment. Test balance: {formatMoneyCents(wallet.testMoneyBalanceCents, wallet.currency)}.
        </div>
      ) : null}

      <section className="rounded border border-[var(--border)] bg-[#101a2c] p-4">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Request withdrawal</h2>
        <p className="mt-1 text-sm text-slate-400">Withdrawals are reviewed and batched Tuesday, Thursday, and Saturday before processor payout.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid min-w-60 flex-1 gap-1 text-sm">
            <span className="text-slate-300">Amount</span>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} className={FIELD_CLASS} inputMode="decimal" placeholder="0.00" />
          </label>
          <button
            type="button"
            disabled={sending || !amount.trim() || wallet.withdrawableBalanceCents <= 0}
            onClick={() => void submitWithdrawal()}
            className="rounded-full bg-[#3668ff] px-5 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#5781ff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "Queuing..." : "Request withdrawal"}
          </button>
        </div>
        {message ? <p className="mt-3 text-sm text-slate-300">{message}</p> : null}
      </section>

      <section className="rounded border border-[var(--border)] bg-[#101a2c] p-4">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Withdrawal queue</h2>
        <div className="mt-3 space-y-2">
          {withdrawals.length ? (
            withdrawals.map((withdrawal) => (
              <article key={withdrawal.id} className="rounded border border-[#304058] bg-[#0d1626] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-100">{formatMoneyCents(withdrawal.amountCents, withdrawal.currency)}</p>
                  <span className="rounded-full border border-[#52647f] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">{withdrawal.status}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Requested {new Date(withdrawal.requestedAt).toLocaleString()}
                  {withdrawal.batch ? ` - Batch ${new Date(withdrawal.batch.scheduledFor).toLocaleDateString()}` : ""}
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-400">No withdrawal requests yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
