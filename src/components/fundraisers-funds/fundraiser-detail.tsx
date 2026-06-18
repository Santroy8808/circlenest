"use client";

import { useState, useTransition } from "react";
import type { FundraiserDetailView } from "@/modules/fundraisers-funds/types";

function dollarsToCents(value: string) {
  const amount = Number(value.trim());
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function formatMoney(cents: number | null, currency: string) {
  if (cents === null) return "Open goal";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function FundraiserDetail({ campaign }: { campaign: FundraiserDetailView }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setError("");

    startTransition(async () => {
      const amountCents = dollarsToCents(amount);

      if (!amountCents) {
        setError("Enter a contribution amount.");
        return;
      }

      const response = await fetch(`/api/fundraisers/${campaign.slug}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, note })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not record contribution intent.");
        return;
      }

      setAmount("");
      setNote("");
      setStatus("Contribution intent recorded. Processor payment comes in a later phase.");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{campaign.categoryLabel}</p>
        <h1 className="mt-3 text-3xl font-semibold">{campaign.title}</h1>
        <p className="mt-3 max-w-3xl whitespace-pre-wrap leading-7 text-[var(--text)]">{campaign.description}</p>
        <div className="mt-6">
          <div className="h-3 overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full bg-[var(--blue)]"
              style={{
                width: campaign.goalAmountCents
                  ? `${Math.min(100, Math.round((campaign.pledgedAmountCents / campaign.goalAmountCents) * 100))}%`
                  : "8%"
              }}
            />
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">
            {formatMoney(campaign.pledgedAmountCents, campaign.currency)} pledged of {formatMoney(campaign.goalAmountCents, campaign.currency)}
          </p>
        </div>
      </section>

      <form className="surface grid gap-4 rounded-md p-6" onSubmit={submit}>
        <div>
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Contribution intent</h2>
          <p className="mt-2 leading-6 text-[var(--muted)]">
            This records intent only. Stripe/payment processing and real ledgers are intentionally not active yet.
          </p>
        </div>
        <input className="form-field" inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="Amount, e.g. 25.00" value={amount} />
        <textarea className="form-field min-h-24 resize-y" onChange={(event) => setNote(event.target.value)} placeholder="Optional note" value={note} />
        {status ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{status}</p> : null}
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
        <button className="btn-primary justify-self-end" disabled={isPending} type="submit">
          {isPending ? "Recording..." : "Record intent"}
        </button>
      </form>
    </div>
  );
}
