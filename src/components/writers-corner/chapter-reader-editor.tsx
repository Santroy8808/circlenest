"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { RichTextEditor } from "@/components/writers-corner/rich-text-editor";
import type { ChapterDetailView } from "@/modules/writers-corner/types";

export function ChapterReaderEditor({ chapter }: { chapter: ChapterDetailView }) {
  const [title, setTitle] = useState(chapter.title);
  const [bodyText, setBodyText] = useState(chapter.bodyText);
  const [bodyHtml, setBodyHtml] = useState(chapter.bodyHtml ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function save(autosave = false) {
    setMessage("");
    setError("");

    startTransition(async () => {
      const response = await fetch(`/api/writers/chapters/${chapter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, bodyText, bodyHtml, autosave })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not save chapter.");
        return;
      }

      setMessage(autosave ? "Autosaved." : "Saved.");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <Link className="text-sm text-[var(--gold)]" href={`/writers-corner/${chapter.manuscript.slug}`}>
          {chapter.manuscript.title}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">{chapter.title}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{chapter.wordCount} words</p>
      </section>

      <article className="writer-reader surface rounded-md p-8">
        {chapter.bodyHtml ? (
          <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: chapter.bodyHtml }} />
        ) : chapter.bodyText ? (
          chapter.bodyText.split(/\n{2,}/).map((paragraph, index) => (
            <p className="mb-5 leading-8" key={`${paragraph.slice(0, 12)}-${index}`}>
              {paragraph}
            </p>
          ))
        ) : (
          <p className="text-[var(--muted)]">This chapter is blank.</p>
        )}
      </article>

      <nav className="flex flex-wrap items-center justify-between gap-3">
        {chapter.previousChapter ? (
          <Link className="btn-secondary" href={`/writers-corner/${chapter.manuscript.slug}/chapters/${chapter.previousChapter.id}`}>
            Previous chapter
          </Link>
        ) : (
          <span />
        )}
        {chapter.nextChapter ? (
          <Link className="btn-primary" href={`/writers-corner/${chapter.manuscript.slug}/chapters/${chapter.nextChapter.id}`}>
            Next chapter
          </Link>
        ) : null}
      </nav>

      {chapter.viewerCanEdit ? (
        <section className="surface grid gap-4 rounded-md p-6">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Creator editor</h2>
          <input className="form-field" onChange={(event) => setTitle(event.target.value)} value={title} />
          <RichTextEditor
            html={bodyHtml}
            onChange={(value) => {
              setBodyHtml(value.html);
              setBodyText(value.text);
            }}
            placeholder="Edit this chapter with rich formatting."
          />
          {message ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
          {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" disabled={isPending} onClick={() => save(true)} type="button">
              Autosave now
            </button>
            <button className="btn-primary" disabled={isPending || title.trim().length < 2} onClick={() => save(false)} type="button">
              {isPending ? "Saving..." : "Save chapter"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
