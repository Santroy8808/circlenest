"use client";

import { ManuscriptVisibility } from "@prisma/client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { WriterAccessState } from "@/modules/writers-corner/types";

export function CreateManuscriptForm({ access }: { access: WriterAccessState }) {
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [summary, setSummary] = useState("");
  const [visibility, setVisibility] = useState<ManuscriptVisibility>(ManuscriptVisibility.MEMBERS);
  const [publishToStorefront, setPublishToStorefront] = useState(false);
  const [error, setError] = useState(access.canWrite ? "" : access.reason ?? "Contributor or Professional access required.");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/writers/manuscripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, genre, summary, visibility, publishToStorefront })
      });
      const payload = (await response.json()) as { error?: string; manuscript?: { slug: string } };

      if (!response.ok || !payload.manuscript) {
        setError(payload.error ?? "Could not create manuscript.");
        return;
      }

      window.location.href = `/writers-corner/${payload.manuscript.slug}`;
    });
  }

  if (!access.canWrite) {
    return (
      <section className="surface rounded-md p-8 text-center">
        <h1 className="text-3xl font-semibold text-[var(--gold)]">Create Manuscript</h1>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--muted)]">{error}</p>
        <Link className="btn-secondary mt-5 inline-block" href="/writers-corner">
          Back to Writers Corner
        </Link>
      </section>
    );
  }

  return (
    <form className="surface grid gap-5 rounded-md p-6" onSubmit={submit}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Writers Corner</p>
        <h1 className="mt-3 text-3xl font-semibold">Create manuscript</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <input className="form-field" onChange={(event) => setTitle(event.target.value)} placeholder="Title" value={title} />
        <input className="form-field" onChange={(event) => setGenre(event.target.value)} placeholder="Genre" value={genre} />
      </div>
      <textarea className="form-field min-h-32 resize-y" onChange={(event) => setSummary(event.target.value)} placeholder="Summary blurb" value={summary} />
      <select className="form-field" onChange={(event) => setVisibility(event.target.value as ManuscriptVisibility)} value={visibility}>
        <option value={ManuscriptVisibility.MEMBERS}>Members can read</option>
        <option value={ManuscriptVisibility.PRIVATE}>Private draft</option>
      </select>
      <label className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-black/10 p-4">
        <input
          checked={publishToStorefront}
          className="mt-1"
          onChange={(event) => setPublishToStorefront(event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block font-semibold text-[var(--gold)]">Publish to storefront</span>
          <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
            Makes this manuscript available as a public storefront blog after Business Center blogs are enabled.
          </span>
        </span>
      </label>
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      <div className="flex justify-end gap-3">
        <Link className="btn-secondary" href="/writers-corner">
          Cancel
        </Link>
        <button className="btn-primary" disabled={isPending || title.trim().length < 2} type="submit">
          {isPending ? "Creating..." : "Create manuscript"}
        </button>
      </div>
    </form>
  );
}
