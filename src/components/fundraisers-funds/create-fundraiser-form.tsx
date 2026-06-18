"use client";

import { FundraiserCategory } from "@prisma/client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { fundraiserCategoryOptions, type FundraiserCreateState } from "@/modules/fundraisers-funds/types";

function dollarsToCents(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const amount = Number(clean);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export function CreateFundraiserForm({ createState }: { createState: FundraiserCreateState }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<FundraiserCategory>(FundraiserCategory.COMMUNITY_PROJECT);
  const [goalAmount, setGoalAmount] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState(createState.viewerCanCreate ? "" : createState.reason ?? "This account cannot create fundraisers.");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/fundraisers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          description,
          category,
          goalAmountCents: dollarsToCents(goalAmount),
          endsAt
        })
      });
      const payload = (await response.json()) as { error?: string; campaign?: { slug: string } };

      if (!response.ok || !payload.campaign) {
        setError(payload.error ?? "Could not create fundraiser.");
        return;
      }

      window.location.href = `/fundraisers/${payload.campaign.slug}`;
    });
  }

  if (!createState.viewerCanCreate) {
    return (
      <section className="surface rounded-md p-8 text-center">
        <h1 className="text-3xl font-semibold text-[var(--gold)]">Create Fundraiser</h1>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--muted)]">{error}</p>
        <Link className="btn-secondary mt-5 inline-block" href="/fundraisers">
          Browse fundraisers
        </Link>
      </section>
    );
  }

  return (
    <form className="surface grid gap-5 rounded-md p-6" onSubmit={submit}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Fundraisers</p>
        <h1 className="mt-3 text-3xl font-semibold">Create a fundraiser</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          This creates a campaign page and contribution intent flow. Real money waits for processor integration.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <input className="form-field" onChange={(event) => setTitle(event.target.value)} placeholder="Campaign title" value={title} />
        <select className="form-field" onChange={(event) => setCategory(event.target.value as FundraiserCategory)} value={category}>
          {fundraiserCategoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <input className="form-field" onChange={(event) => setSummary(event.target.value)} placeholder="Short summary" value={summary} />
      <textarea
        className="form-field min-h-44 resize-y"
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Explain the need, what funds will support, and what success looks like."
        value={description}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <input className="form-field" inputMode="decimal" onChange={(event) => setGoalAmount(event.target.value)} placeholder="Goal amount, optional" value={goalAmount} />
        <input className="form-field" onChange={(event) => setEndsAt(event.target.value)} type="date" value={endsAt} />
      </div>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <Link className="btn-secondary" href="/fundraisers">
          Cancel
        </Link>
        <button className="btn-primary" disabled={isPending || title.trim().length < 2 || description.trim().length < 10} type="submit">
          {isPending ? "Creating..." : "Create fundraiser"}
        </button>
      </div>
    </form>
  );
}
