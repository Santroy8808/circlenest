"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WritersStudioProjectDetail } from "@/lib/writers-studio/writers-studio";
import { WritersStudioRichTextEditor } from "@/components/writers-studio/writers-studio-rich-text-editor";

type Props = {
  project: WritersStudioProjectDetail;
  isOwner: boolean;
};

export function WritersStudioProjectDetailClient({ project, isOwner }: Props) {
  const router = useRouter();
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterBody, setChapterBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function saveChapter() {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch(`/api/writers-studio/${project.id}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: chapterTitle.trim(),
          body: chapterBody,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; chapter?: { id?: string } };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not save chapter.");
        return;
      }
      if (payload.chapter?.id) {
        router.push(`/production-zone/writers-studio/${project.id}/chapters/${payload.chapter.id}`);
      } else {
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-3xl border border-[var(--border)] bg-[color:var(--card-bg)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-[var(--text-strong)]">{project.title}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {project.genre ?? "No genre"} - {project.chapterCount} chapter{project.chapterCount === 1 ? "" : "s"}
            </p>
          </div>
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
            Tier: {project.accessTierLabel}
          </span>
        </div>
        {project.summary ? <p className="text-sm leading-6 text-slate-300">{project.summary}</p> : null}
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Chapters</h2>
            <p className="text-xs text-slate-400">Tap a chapter card to read it. Only the creator can edit it.</p>
          </div>
          <Link
            href="/production-zone/writers-studio"
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-slate-200 transition hover:border-[var(--accent)]/40 hover:text-[var(--text-strong)]"
          >
            Back to manuscripts
          </Link>
        </div>

        <div className="space-y-3">
          {project.chapters.length ? (
            project.chapters.map((chapter) => (
              <Link
                key={chapter.id}
                href={`/production-zone/writers-studio/${project.id}/chapters/${chapter.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[#0d1320] px-4 py-3 transition hover:border-[var(--accent)]/40 hover:bg-[color:var(--card-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
              >
                <div className="min-w-0">
                  <p className="text-base font-semibold text-[var(--text-strong)]">{chapter.title}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Chapter {chapter.orderIndex + 1} - {chapter.wordCount} words
                  </p>
                </div>
                <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Open</span>
              </Link>
            ))
          ) : (
            <p className="text-sm text-slate-500">No chapters yet.</p>
          )}
        </div>
      </section>

      {isOwner ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Create Chapter</h2>
            <p className="text-xs text-slate-400">Write the title, then use the rich text editor below. The chapter page autosaves every minute after creation.</p>
          </div>
          <input
            value={chapterTitle}
            onChange={(event) => setChapterTitle(event.target.value)}
            placeholder="Chapter title"
            className="w-full rounded-2xl border border-[var(--border)] bg-[#0d1320] px-4 py-3 text-sm text-[var(--text-strong)] outline-none transition placeholder:text-slate-500 focus:border-[var(--accent)]/50"
          />
          <WritersStudioRichTextEditor
            value={chapterBody}
            onChange={setChapterBody}
            placeholder="Chapter body"
            minHeightClassName="min-h-[22rem]"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={saving || !chapterTitle.trim()}
              onClick={() => void saveChapter()}
              className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Chapter"}
            </button>
            {status ? <p className="text-xs text-amber-200">{status}</p> : null}
          </div>
        </section>
      ) : (
        <p className="text-sm text-slate-500">Only the creator can add chapters.</p>
      )}
    </div>
  );
}
