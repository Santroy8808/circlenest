"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WritersStudioProjectSummary } from "@/lib/writers-studio/writers-studio";

type Props = {
  canCreate: boolean;
  accessReason: string | null;
  ownProjects: WritersStudioProjectSummary[];
  publicProjects: WritersStudioProjectSummary[];
};

export function WritersStudioManager({ canCreate, accessReason, ownProjects, publicProjects }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [genre, setGenre] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveProject() {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/writers-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim() || null,
          genre: genre.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; project?: { id?: string } };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not save manuscript.");
        return;
      }
      if (payload.project?.id) {
        router.push(`/production-zone/writers-studio/${payload.project.id}`);
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Create manuscript</h2>
          <p className="text-xs text-slate-400">
            {canCreate ? "Create a title, genre, and summary blurb. Your manuscript tier follows your current membership." : accessReason ?? "Browse only."}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={!canCreate}
            placeholder="Manuscript title"
            className="rounded-2xl border border-[var(--border)] bg-[#0d1320] px-4 py-3 text-sm text-[var(--text-strong)] outline-none transition placeholder:text-slate-500 focus:border-[var(--accent)]/50 disabled:cursor-not-allowed disabled:bg-[#09101b]"
          />
          <input
            value={genre}
            onChange={(event) => setGenre(event.target.value)}
            disabled={!canCreate}
            placeholder="Genre"
            className="rounded-2xl border border-[var(--border)] bg-[#0d1320] px-4 py-3 text-sm text-[var(--text-strong)] outline-none transition placeholder:text-slate-500 focus:border-[var(--accent)]/50 disabled:cursor-not-allowed disabled:bg-[#09101b]"
          />
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            disabled={!canCreate}
            placeholder="Summary blurb"
            className="min-h-28 rounded-2xl border border-[var(--border)] bg-[#0d1320] px-4 py-3 text-sm text-[var(--text-strong)] outline-none transition placeholder:text-slate-500 focus:border-[var(--accent)]/50 disabled:cursor-not-allowed disabled:bg-[#09101b] md:col-span-2"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[#0d1320] px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Manuscript tier</p>
            <p className="text-sm font-medium text-[var(--text-strong)]">{canCreate ? "Matches your current membership tier" : "Browse only"}</p>
          </div>
          <button
            type="button"
            disabled={!canCreate || saving || !title.trim()}
            onClick={() => void saveProject()}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Create Manuscript"}
          </button>
        </div>
        {status ? <p className="text-xs text-amber-200">{status}</p> : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">My Manuscripts</h2>
            <p className="text-xs text-slate-400">Open one to add chapters, then open a chapter to read or edit it.</p>
          </div>
        </div>
        <div className="space-y-3">
          {ownProjects.length ? (
            ownProjects.map((project) => (
              <Link
                key={project.id}
                href={`/production-zone/writers-studio/${project.id}`}
                className="block rounded-2xl border border-[var(--border)] bg-[#0d1320] px-4 py-4 transition hover:border-[var(--accent)]/40 hover:bg-[color:var(--card-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-[var(--text-strong)]">{project.title}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {project.genre ?? "No genre"} - {project.chapterCount} chapter{project.chapterCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--border)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                    Tier: {project.accessTierLabel}
                  </span>
                </div>
                {project.summary ? <p className="mt-3 text-sm leading-6 text-slate-300">{project.summary}</p> : <p className="mt-3 text-sm text-slate-500">No summary yet.</p>}
              </Link>
            ))
          ) : (
            <p className="text-sm text-slate-500">No manuscripts yet.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Browse manuscripts</h2>
          <p className="text-xs text-slate-400">Public manuscripts stay readable and can be opened without leaving the workspace.</p>
        </div>
        <div className="space-y-3">
          {publicProjects.length ? (
            publicProjects.map((project) => (
              <Link
                key={project.id}
                href={`/production-zone/writers-studio/${project.id}`}
                className="block rounded-2xl border border-[var(--border)] bg-[#0d1320] px-4 py-4 transition hover:border-[var(--accent)]/40 hover:bg-[color:var(--card-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-[var(--text-strong)]">{project.title}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      @{project.owner.username}
                      {project.owner.fullName ? ` - ${project.owner.fullName}` : ""} - {project.chapterCount} chapter{project.chapterCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--border)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                    Tier: {project.accessTierLabel}
                  </span>
                </div>
                {project.summary ? <p className="mt-3 text-sm leading-6 text-slate-300">{project.summary}</p> : <p className="mt-3 text-sm text-slate-500">No summary yet.</p>}
              </Link>
            ))
          ) : (
            <p className="text-sm text-slate-500">No public manuscripts yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
