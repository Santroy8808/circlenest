"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ManuscriptDetailView } from "@/modules/writers-corner/types";

export function StorefrontPublishToggle({ manuscript }: { manuscript: ManuscriptDetailView }) {
  const [checked, setChecked] = useState(manuscript.publishToStorefront);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!manuscript.viewerCanEdit) return null;

  function toggle(next: boolean) {
    setMessage("");
    setError("");

    startTransition(async () => {
      const response = await fetch(`/api/writers/manuscripts/${manuscript.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishToStorefront: next })
      });
      const payload = (await response.json()) as { error?: string; manuscript?: { publishToStorefront: boolean } };

      if (!response.ok || !payload.manuscript) {
        setError(payload.error ?? "Could not update storefront publishing.");
        setChecked(!next);
        return;
      }

      setChecked(payload.manuscript.publishToStorefront);
      setMessage(payload.manuscript.publishToStorefront ? "Published to storefront." : "Removed from storefront.");
    });
  }

  return (
    <section className="surface rounded-md p-5">
      <label className="flex items-start gap-3">
        <input
          checked={checked}
          className="mt-1"
          disabled={isPending || (!checked && !manuscript.storefrontPublishingAvailable)}
          onChange={(event) => {
            setChecked(event.target.checked);
            toggle(event.target.checked);
          }}
          type="checkbox"
        />
        <span>
          <span className="block font-semibold text-[var(--gold)]">Publish to storefront</span>
          <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
            This makes the manuscript readable from your public storefront blog area.
          </span>
        </span>
      </label>
      {!manuscript.storefrontPublishingAvailable && !checked ? (
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Turn on storefront blogs in <Link className="text-[var(--gold)] underline" href="/business-center">Business Center</Link> first.
        </p>
      ) : null}
      {message ? <p className="mt-3 rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
      {error ? <p className="mt-3 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
    </section>
  );
}
