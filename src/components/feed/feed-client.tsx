"use client";

import { FeedReactionType, FeedVisibility } from "@prisma/client";
import { useState, useTransition } from "react";
import type { FeedPostView } from "@/modules/feed-stream/types";

const quickReactions = [
  FeedReactionType.LIKE,
  FeedReactionType.LOVE,
  FeedReactionType.CARE,
  FeedReactionType.HAHA
];

export function FeedClient({ initialPosts }: { initialPosts: FeedPostView[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function refreshFeed() {
    const response = await fetch("/api/feed/posts", { cache: "no-store" });
    const payload = (await response.json()) as { posts: FeedPostView[] };
    setPosts(payload.posts ?? []);
  }

  function submitPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/feed/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, visibility: FeedVisibility.MEMBERS })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not create post.");
        return;
      }

      setBody("");
      await refreshFeed();
    });
  }

  function submitComment(postId: string, form: HTMLFormElement) {
    const formData = new FormData(form);
    const commentBody = String(formData.get("body") ?? "");

    startTransition(async () => {
      const response = await fetch("/api/feed/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, body: commentBody })
      });

      if (response.ok) {
        form.reset();
        await refreshFeed();
      }
    });
  }

  function reactToPost(postId: string, type: FeedReactionType) {
    startTransition(async () => {
      const response = await fetch("/api/feed/reactions/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, type })
      });

      if (response.ok) {
        await refreshFeed();
      }
    });
  }

  return (
    <div className="grid gap-5">
      <form className="surface rounded-md p-5" onSubmit={submitPost}>
        <label className="grid gap-2">
          <span className="form-label">Post to stream</span>
          <textarea
            className="form-field min-h-28 resize-y"
            onChange={(event) => setBody(event.target.value)}
            placeholder="What would you like to share?"
            value={body}
          />
        </label>
        {error ? <p className="mt-3 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
        <button className="btn-primary mt-4" disabled={isPending || body.trim().length === 0} type="submit">
          {isPending ? "Posting..." : "Post"}
        </button>
      </form>

      {posts.length === 0 ? (
        <section className="surface rounded-md p-6 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No posts yet</h2>
          <p className="mt-2 text-[var(--muted)]">The stream is ready. Seed or create posts once a database is connected.</p>
        </section>
      ) : null}

      {posts.map((post) => (
        <article key={post.id} className="feed-post surface rounded-md p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-[var(--gold)]">{post.author.displayName}</p>
              <p className="text-sm text-[var(--muted)]">
                @{post.author.username} · {new Date(post.createdAt).toLocaleString()}
              </p>
            </div>
            <span className="pill rounded-full px-2 py-1 text-xs">{post.visibility}</span>
          </div>
          <p className="mt-4 whitespace-pre-wrap leading-7">{post.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {quickReactions.map((reaction) => (
              <button className="btn-secondary px-3 py-2 text-sm" key={reaction} onClick={() => reactToPost(post.id, reaction)} type="button">
                {reaction} {post.reactions[reaction] ?? 0}
              </button>
            ))}
          </div>
          <div className="mt-5 grid gap-3">
            {post.comments.map((comment) => (
              <div className="comment-bubble" key={comment.id}>
                <p className="text-sm font-semibold text-[var(--gold)]">{comment.author.displayName}</p>
                <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
                {comment.replyCount > 0 ? <p className="mt-2 text-xs text-[var(--muted)]">{comment.replyCount} replies</p> : null}
              </div>
            ))}
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submitComment(post.id, event.currentTarget);
              }}
            >
              <input className="form-field" name="body" placeholder="Quick reply..." />
              <button className="btn-secondary" disabled={isPending} type="submit">
                Reply
              </button>
            </form>
          </div>
        </article>
      ))}
    </div>
  );
}
