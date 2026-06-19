"use client";

import { InterestCategory } from "@prisma/client";
import { useState, useTransition } from "react";
import { interestCategoryOptions } from "@/modules/ads-credits/types";

export function ProfileInterestsForm({ initialCategories }: { initialCategories: InterestCategory[] }) {
  const [categories, setCategories] = useState<InterestCategory[]>(initialCategories);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggle(category: InterestCategory) {
    setMessage("");
    setCategories((current) => (current.includes(category) ? current.filter((value) => value !== category) : [...current, category]));
  }

  function save() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/profile/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "Could not save interests.");
        return;
      }

      setMessage("Saved.");
    });
  }

  return (
    <section className="surface rounded-md p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Interest Preferences</p>
      <h1 className="mt-3 text-3xl font-semibold">My interests</h1>
      <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
        These help make internal ads and discovery more relevant. They are self-declared and can be cleared at any time.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {interestCategoryOptions.map((option) => {
          const active = categories.includes(option.value);

          return (
            <button className={`interest-chip ${active ? "is-active" : ""}`} key={option.value} onClick={() => toggle(option.value)} type="button">
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={isPending} onClick={save} type="button">
          {isPending ? "Saving..." : "Save interests"}
        </button>
        <button className="btn-secondary" disabled={isPending || categories.length === 0} onClick={() => setCategories([])} type="button">
          Clear all
        </button>
        {message ? <span className="text-sm text-[var(--muted)]">{message}</span> : null}
      </div>
    </section>
  );
}
