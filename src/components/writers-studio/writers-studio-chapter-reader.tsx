"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WritersStudioChapterSummary, WritersStudioProjectDetail } from "@/lib/writers-studio/writers-studio";
import { WritersStudioRichTextEditor } from "@/components/writers-studio/writers-studio-rich-text-editor";

type Props = {
  project: WritersStudioProjectDetail;
  chapter: WritersStudioChapterSummary;
  isOwner: boolean;
  previousChapterId: string | null;
  nextChapterId: string | null;
};

const PAGE_CHAR_LIMIT = 1800;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function splitTextIntoParagraphChunks(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > PAGE_CHAR_LIMIT && current) {
      chunks.push(current);
      current = word;
      continue;
    }
    current = next;
  }

  if (current) chunks.push(current);
  return chunks.map((chunk) => `<p>${escapeHtml(chunk)}</p>`);
}

function estimateChunkLength(html: string) {
  return html.replace(/<[^>]+>/g, "").length;
}

function buildPagesFromHtml(html: string) {
  if (typeof window === "undefined") return [html];
  const parser = new DOMParser();
  const document = parser.parseFromString(`<div id="root">${html || ""}</div>`, "text/html");
  const root = document.getElementById("root");
  if (!root) return [html || "<p></p>"];

  const pages: string[] = [];
  let currentBlocks: string[] = [];
  let currentLength = 0;

  const flush = () => {
    if (!currentBlocks.length) return;
    pages.push(currentBlocks.join(""));
    currentBlocks = [];
    currentLength = 0;
  };

  const addBlock = (blockHtml: string, length: number) => {
    if (currentBlocks.length && currentLength + length > PAGE_CHAR_LIMIT) {
      flush();
    }
    currentBlocks.push(blockHtml);
    currentLength += length;
  };

  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").trim();
      if (!text) return;
      splitTextIntoParagraphChunks(text).forEach((chunk) => addBlock(chunk, estimateChunkLength(chunk)));
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const text = (element.textContent ?? "").trim();
    if (!text) return;

    if (text.length > PAGE_CHAR_LIMIT) {
      splitTextIntoParagraphChunks(text).forEach((chunk) => addBlock(chunk, estimateChunkLength(chunk)));
      return;
    }

    addBlock(element.outerHTML, text.length);
  });

  flush();
  return pages.length ? pages : [html || "<p></p>"];
}

export function WritersStudioChapterReader({ project, chapter, isOwner, previousChapterId, nextChapterId }: Props) {
  const [title, setTitle] = useState(chapter.title);
  const [body, setBody] = useState(chapter.body);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [pageIndex, setPageIndex] = useState(0);

  const pages = useMemo(() => buildPagesFromHtml(body), [body]);

  useEffect(() => {
    setPageIndex(0);
  }, [chapter.id]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(pages.length - 1, 0)));
  }, [pages.length]);

  const saveChapter = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch(`/api/writers-studio/${project.id}/chapters/${chapter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; chapter?: { title?: string; body?: string } };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not save chapter.");
        return;
      }
      if (payload.chapter?.title !== undefined) setTitle(payload.chapter.title);
      if (payload.chapter?.body !== undefined) setBody(payload.chapter.body);
      setStatus("Saved.");
    } finally {
      setSaving(false);
    }
  }, [saving, title, body, project.id, chapter.id]);

  useEffect(() => {
    if (!isOwner) return;
    if (saving) return;
    const timer = window.setInterval(() => {
      void saveChapter();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [isOwner, saving, saveChapter]);

  function goToPreviousPage() {
    setPageIndex((current) => (current > 0 ? current - 1 : current));
  }

  function goToNextPage() {
    setPageIndex((current) => (current < pages.length - 1 ? current + 1 : current));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[var(--border)] bg-[color:var(--card-bg)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href={`/production-zone/writers-studio/${project.id}`} className="inline-flex rounded-full border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300 transition hover:border-[var(--accent)]/40 hover:text-[var(--text-strong)]">
              Back to manuscript
            </Link>
            <h1 className="mt-3 text-2xl font-semibold text-[var(--text-strong)]">{chapter.title}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {project.title} - Chapter {chapter.orderIndex + 1} - {chapter.wordCount} words
            </p>
          </div>
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
            Tier: {project.accessTierLabel}
          </span>
        </div>
      </section>

      {isOwner ? (
        <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[#0d1320] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Edit Chapter</h2>
            <p className="text-xs text-slate-400">Autosaves every minute while you edit. No version history is kept.</p>
          </div>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-2xl border border-[var(--border)] bg-[#09101b] px-4 py-3 text-sm text-[var(--text-strong)] outline-none transition placeholder:text-slate-500 focus:border-[var(--accent)]/50"
          />
          <WritersStudioRichTextEditor
            value={body}
            onChange={(next) => setBody(next)}
            placeholder="Chapter body"
            minHeightClassName="min-h-[24rem]"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void saveChapter()}
              disabled={saving}
              className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Chapter"}
            </button>
            {status ? <p className="text-xs text-amber-200">{status}</p> : null}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Read Chapter</h2>
            <p className="text-xs text-slate-400">Click the left or right side to turn the page. The text area itself does not scroll.</p>
          </div>
          <p className="text-xs text-slate-500">
            Page {Math.min(pageIndex + 1, pages.length)} of {Math.max(pages.length, 1)}
          </p>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[#0d1320]">
          <button
            type="button"
            aria-label="Previous page"
            onClick={goToPreviousPage}
            className="absolute left-0 top-0 z-10 h-full w-1/2 cursor-pointer bg-transparent text-left text-transparent outline-none"
          />
          <button
            type="button"
            aria-label="Next page"
            onClick={goToNextPage}
            className="absolute right-0 top-0 z-10 h-full w-1/2 cursor-pointer bg-transparent text-left text-transparent outline-none"
          />
          <div className="relative z-0 min-h-[34rem] px-6 py-6">
            <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
              <span>Page {Math.min(pageIndex + 1, pages.length)} of {Math.max(pages.length, 1)}</span>
              <span>{chapter.wordCount} words</span>
            </div>
            <div className="overflow-hidden">
            <article className="max-h-[28rem] overflow-hidden text-[15px] leading-8 text-slate-200">
              <div dangerouslySetInnerHTML={{ __html: pages[pageIndex] ?? "<p></p>" }} />
            </article>
          </div>
        </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (previousChapterId) {
                window.location.href = `/production-zone/writers-studio/${project.id}/chapters/${previousChapterId}`;
              }
            }}
            disabled={!previousChapterId}
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-slate-200 transition hover:border-[var(--accent)]/40 hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous Chapter
          </button>
          <button
            type="button"
            onClick={() => {
              if (nextChapterId) {
                window.location.href = `/production-zone/writers-studio/${project.id}/chapters/${nextChapterId}`;
              }
            }}
            disabled={!nextChapterId}
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-slate-200 transition hover:border-[var(--accent)]/40 hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next Chapter
          </button>
        </div>
      </section>
    </div>
  );
}
