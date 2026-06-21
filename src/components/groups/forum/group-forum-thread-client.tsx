"use client";

import { GroupForumReactionType } from "@prisma/client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { GroupForumThreadDetailView } from "@/modules/group-forum/types";

const quickReactions = [
  GroupForumReactionType.LIKE,
  GroupForumReactionType.LOVE,
  GroupForumReactionType.CARE,
  GroupForumReactionType.HAHA
];

export function GroupForumThreadClient({
  group,
  initialThread,
  viewerCanPost
}: {
  group: { id: string; slug: string; name: string };
  initialThread: GroupForumThreadDetailView;
  viewerCanPost: boolean;
}) {
  const [thread, setThread] = useState(initialThread);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function refreshThread() {
    const response = await fetch(`/api/groups/${group.slug}/forum/threads/${thread.id}`, { cache: "no-store" });
    if (response.ok) {
      const payload = (await response.json()) as { thread: GroupForumThreadDetailView; viewerCanPost: boolean };
      setThread(payload.thread);
    }
  }

  function reply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch(`/api/groups/${group.slug}/forum/threads/${thread.id}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not reply.");
        return;
      }

      setBody("");
      await refreshThread();
    });
  }

  function endThread() {
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/groups/${group.slug}/forum/threads/${thread.id}/end`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not end thread.");
        return;
      }

      await refreshThread();
    });
  }

  function deleteThread() {
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/groups/${group.slug}/forum/threads/${thread.id}/delete`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not delete thread.");
        return;
      }

      window.location.href = `/groups/${group.slug}/forum`;
    });
  }

  function reactToThread(type: GroupForumReactionType) {
    startTransition(async () => {
      await fetch(`/api/groups/${group.slug}/forum/threads/${thread.id}/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      await refreshThread();
    });
  }

  function reactToPost(postId: string, type: GroupForumReactionType) {
    startTransition(async () => {
      await fetch(`/api/groups/${group.slug}/forum/posts/${postId}/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      await refreshThread();
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <Link className="text-sm text-[var(--gold)]" href={`/groups/${group.slug}/forum`}>
          Back to forum
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-[var(--gold)]">{group.name}</p>
            <h1 className="mt-2 text-4xl font-semibold">{thread.title}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              by {thread.author.displayName} · {new Date(thread.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {thread.endedAt ? <span className="pill rounded-full px-4 py-3 text-sm">Ended</span> : null}
            {thread.viewerCanEnd ? (
              <button className="btn-secondary" disabled={isPending} onClick={endThread} type="button">
                End thread
              </button>
            ) : null}
            {thread.viewerCanDelete ? (
              <button className="btn-secondary" disabled={isPending} onClick={deleteThread} type="button">
                Delete ended thread
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <article className="forum-open-post surface rounded-md p-6">
        <p className="whitespace-pre-wrap leading-7">{thread.body}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {quickReactions.map((reaction) => (
            <button className="btn-secondary px-3 py-2 text-sm" key={reaction} onClick={() => reactToThread(reaction)} type="button">
              {reaction} {thread.reactions[reaction] ?? 0}
            </button>
          ))}
        </div>
      </article>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Replies</h2>
        <div className="mt-5 grid gap-3">
          {thread.posts.length === 0 ? <p className="text-[var(--muted)]">No replies yet.</p> : null}
          {thread.posts.map((post) => (
            <article className="forum-reply-bubble" key={post.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[var(--gold)]">{post.author.displayName}</p>
                  <p className="text-xs text-[var(--muted)]">{new Date(post.createdAt).toLocaleString()}</p>
                </div>
                <span className="text-xs text-[var(--muted)]">{post.replyCount} nested replies</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap leading-7">{post.body}</p>
              {post.mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="mt-3 max-h-72 rounded-md object-cover" src={post.mediaUrl} />
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {quickReactions.map((reaction) => (
                  <button className="btn-secondary px-3 py-2 text-sm" key={reaction} onClick={() => reactToPost(post.id, reaction)} type="button">
                    {reaction} {post.reactions[reaction] ?? 0}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {viewerCanPost ? (
        <form className="surface rounded-md p-5" onSubmit={reply}>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Reply</p>
          <textarea
            className="form-field mt-3 min-h-28 resize-y"
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a reply..."
            value={body}
          />
          {thread.allowPhotoReplies ? (
            <p className="mt-2 text-sm text-[var(--muted)]">Photo reply plumbing is enabled; picker comes with the group media module.</p>
          ) : null}
          {error ? <p className="mt-3 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          <button className="btn-primary send-logo-button mt-4" disabled={isPending || !body.trim()} type="submit">
            <span aria-hidden="true" className="send-logo-icon" />
            <span className="sr-only">{isPending ? "Replying..." : "Post reply"}</span>
          </button>
        </form>
      ) : (
        <section className="surface rounded-md p-5 text-[var(--muted)]">
          {thread.endedAt ? "This thread has ended." : "Join the group to reply."}
        </section>
      )}
    </div>
  );
}
