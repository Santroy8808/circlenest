"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AdminObjectId } from "@/components/admin/admin-object-id";
import type { GroupForumThreadCardView } from "@/modules/group-forum/types";

export function GroupForumClient({
  group,
  initialThreads,
  isAdmin = false,
  viewerCanPost
}: {
  group: { id: string; slug: string; name: string };
  initialThreads: GroupForumThreadCardView[];
  isAdmin?: boolean;
  viewerCanPost: boolean;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [allowPhotoReplies, setAllowPhotoReplies] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function refreshThreads() {
    const response = await fetch(`/api/groups/${group.slug}/forum/threads`, { cache: "no-store" });
    if (response.ok) {
      const payload = (await response.json()) as { threads: GroupForumThreadCardView[] };
      setThreads(payload.threads ?? []);
    }
  }

  function createThread(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch(`/api/groups/${group.slug}/forum/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, allowPhotoReplies })
      });
      const payload = (await response.json()) as { error?: string; thread?: { id: string } };

      if (!response.ok || !payload.thread) {
        setError(payload.error ?? "Could not create thread.");
        return;
      }

      setTitle("");
      setBody("");
      setAllowPhotoReplies(false);
      setIsCreating(false);
      await refreshThreads();
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Group Forum</p>
            <h1 className="mt-3 text-3xl font-semibold">{group.name}</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Threads are collapsed by default. Open one to use the full vertical discussion view.
            </p>
          </div>
          {viewerCanPost ? (
            <button className="btn-primary" onClick={() => setIsCreating((current) => !current)} type="button">
              {isCreating ? "Close" : "Create Forum"}
            </button>
          ) : null}
        </div>
      </section>

      {isCreating ? (
        <form className="surface grid gap-4 rounded-md p-5" onSubmit={createThread}>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Create Forum Thread</p>
          <input className="form-field" onChange={(event) => setTitle(event.target.value)} placeholder="Thread title" value={title} />
          <textarea
            className="form-field min-h-32 resize-y"
            onChange={(event) => setBody(event.target.value)}
            placeholder="Opening post"
            value={body}
          />
          <label className="flex items-center gap-3 text-sm text-[var(--muted)]">
            <input checked={allowPhotoReplies} onChange={(event) => setAllowPhotoReplies(event.target.checked)} type="checkbox" />
            Allow photo replies on this thread
          </label>
          {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setIsCreating(false)} type="button">
              Cancel
            </button>
            <button className="btn-primary" disabled={isPending || !title.trim() || !body.trim()} type="submit">
              {isPending ? "Creating..." : "Start thread"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="grid gap-3">
        {threads.length === 0 ? (
          <article className="surface rounded-md p-8 text-center">
            <h2 className="text-2xl font-semibold text-[var(--gold)]">No forum threads yet</h2>
            <p className="mt-2 text-[var(--muted)]">Create the first forum thread when you are ready.</p>
          </article>
        ) : null}
        {threads.map((thread) => (
          <article className="forum-thread-card" key={thread.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <Link href={`/groups/${group.slug}/forum/${thread.id}`}>
                  <h2 className="truncate text-2xl font-semibold text-[var(--gold)]">{thread.title}</h2>
                </Link>
                <div className="mt-2">
                  <AdminObjectId id={thread.id} kind="Group thread" visible={isAdmin} />
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  by{" "}
                  <Link className="profile-inline-link" href={`/profile/${thread.author.username}`}>
                    {thread.author.displayName}
                  </Link>{" "}
                  · {new Date(thread.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {thread.pinnedAt ? <span className="pill rounded-full px-3 py-1 text-xs">Pinned</span> : null}
                {thread.endedAt ? <span className="pill rounded-full px-3 py-1 text-xs">Ended</span> : null}
              </div>
            </div>
            <Link className="block" href={`/groups/${group.slug}/forum/${thread.id}`}>
              <p className="mt-4 line-clamp-2 leading-7 text-[var(--muted)]">{thread.body}</p>
            </Link>
            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--gold)]">
              {thread.replyCount} replies Â· {thread.allowPhotoReplies ? "Photo replies allowed" : "Text replies"}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
