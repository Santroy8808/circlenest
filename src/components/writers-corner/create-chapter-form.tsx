"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ManuscriptDetailView } from "@/modules/writers-corner/types";

export function CreateChapterForm({ manuscript }: { manuscript: ManuscriptDetailView }) {
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [error, setError] = useState(manuscript.viewerCanEdit ? "" : "Only the manuscript creator can add chapters.");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch(`/api/writers/manuscripts/${manuscript.slug}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, bodyText })
      });
      const payload = (await response.json()) as { error?: string; chapter?: { id: string } };

      if (!response.ok || !payload.chapter) {
        setError(payload.error ?? "Could not create chapter.");
        return;
      }

      window.location.href = `/writers-corner/${manuscript.slug}/chapters/${payload.chapter.id}`;
    });
  }

  if (!manuscript.viewerCanEdit) {
    return (
      <section className="surface rounded-md p-8 text-center">
        <h1 className="text-3xl font-semibold text-[var(--gold)]">Create Chapter</h1>
        <p className="mt-3 text-[var(--muted)]">{error}</p>
      </section>
    );
  }

  return (
    <form className="surface grid gap-5 rounded-md p-6" onSubmit={submit}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{manuscript.title}</p>
        <h1 className="mt-3 text-3xl font-semibold">Create chapter</h1>
      </div>
      <input className="form-field" onChange={(event) => setTitle(event.target.value)} placeholder="Chapter title" value={title} />
      <textarea
        className="form-field min-h-[420px] resize-y"
        onChange={(event) => setBodyText(event.target.value)}
        placeholder="Write the chapter here. Rich text controls and one-minute autosave are built into the schema/service boundary for the next enhancement pass."
        value={bodyText}
      />
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      <div className="flex justify-end gap-3">
        <Link className="btn-secondary" href={`/writers-corner/${manuscript.slug}`}>
          Cancel
        </Link>
        <button className="btn-primary" disabled={isPending || title.trim().length < 2} type="submit">
          {isPending ? "Saving..." : "Save chapter"}
        </button>
      </div>
    </form>
  );
}
