"use client";

import { useState } from "react";
import type { WritersStudioProjectSummary } from "@/lib/writers-studio/writers-studio";

type Props = {
  canCreate: boolean;
  accessReason: string | null;
  ownProjects: WritersStudioProjectSummary[];
  publicProjects: WritersStudioProjectSummary[];
};

export function WritersStudioManager({ canCreate, accessReason, ownProjects, publicProjects }: Props) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [genre, setGenre] = useState("");
  const [format, setFormat] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleBody, setArticleBody] = useState("");
  const [isPublic, setIsPublic] = useState(true);
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
          format: format.trim() || null,
          isPublic,
          articleTitle: articleTitle.trim() || null,
          articleBody: articleBody.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not save project.");
        return;
      }
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <div>
          <h2 className="text-lg font-semibold">My Manuscripts</h2>
          <p className="text-xs text-slate-400">
            {canCreate ? "Create a manuscript and first chapter here." : accessReason ?? "Browse only."}
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canCreate} placeholder="Manuscript title" className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100" />
          <input value={genre} onChange={(event) => setGenre(event.target.value)} disabled={!canCreate} placeholder="Genre" className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100" />
          <input value={format} onChange={(event) => setFormat(event.target.value)} disabled={!canCreate} placeholder="Format" className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100" />
          <input value={articleTitle} onChange={(event) => setArticleTitle(event.target.value)} disabled={!canCreate} placeholder="First chapter title" className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100" />
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} disabled={!canCreate} placeholder="Manuscript summary" className="min-h-24 rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 md:col-span-2" />
          <textarea value={articleBody} onChange={(event) => setArticleBody(event.target.value)} disabled={!canCreate} placeholder="First chapter body" className="min-h-32 rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 md:col-span-2" />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} disabled={!canCreate} />
          Public manuscript
        </label>

        <button type="button" disabled={!canCreate || saving || !title.trim()} onClick={() => void saveProject()} className="rounded bg-[#8f7228] px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Saving..." : "Create manuscript"}
        </button>
        {status ? <p className="text-xs text-slate-400">{status}</p> : null}
      </section>

      <section className="card space-y-3 p-4">
        <div>
          <h2 className="text-lg font-semibold">My Manuscripts</h2>
          <p className="text-xs text-slate-400">Your own manuscripts and chapters.</p>
        </div>
        <div className="space-y-2">
          {ownProjects.length ? (
            ownProjects.map((project) => (
              <article key={project.id} className="rounded border border-[var(--border)] p-3">
                <p className="font-medium text-slate-100">{project.title}</p>
                <p className="text-xs text-slate-400">{project.genre || "No genre"} • {project.format || "No format"} • {project.isPublic ? "Public" : "Private"}</p>
                {project.summary ? <p className="mt-2 text-sm text-slate-300">{project.summary}</p> : null}
                <div className="mt-2 space-y-2">
                  {project.articles.length ? (
                    project.articles.map((article) => (
                      <article key={article.id} className="rounded border border-[var(--border)] bg-[#0d1320] p-2">
                        <p className="font-medium text-slate-100">{article.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{article.body}</p>
                      </article>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No chapters yet.</p>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-500">No manuscripts yet.</p>
          )}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <div>
          <h2 className="text-lg font-semibold">Public Manuscripts</h2>
          <p className="text-xs text-slate-400">Browse public Writers Corner manuscripts.</p>
        </div>
        <div className="space-y-2">
          {publicProjects.length ? (
            publicProjects.map((project) => (
              <article key={project.id} className="rounded border border-[var(--border)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-100">{project.title}</p>
                    <p className="text-xs text-slate-400">@{project.owner.username}{project.owner.fullName ? ` • ${project.owner.fullName}` : ""}</p>
                  </div>
                  <span className="rounded-full border border-slate-400/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                    {project.genre || "Writing"}
                  </span>
                </div>
                {project.summary ? <p className="mt-2 text-sm text-slate-300">{project.summary}</p> : null}
                <div className="mt-2 space-y-2">
                  {project.articles.length ? (
                    project.articles.map((article) => (
                      <article key={article.id} className="rounded border border-[var(--border)] bg-[#0d1320] p-2">
                        <p className="font-medium text-slate-100">{article.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{article.body}</p>
                      </article>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No public chapters yet.</p>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-500">No public manuscripts yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
