"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { StorefrontForumPostView, StorefrontForumTopicDetailView, StorefrontForumView } from "@/modules/storefront-forum/types";

type StorefrontForumTopicClientProps = {
  profile: StorefrontForumView["profile"];
  topic: StorefrontForumTopicDetailView;
  viewerCanManage: boolean;
};

function appendPost(posts: StorefrontForumPostView[], post: StorefrontForumPostView): StorefrontForumPostView[] {
  if (!post.parentPostId) return [...posts, post];

  return posts.map((current) => {
    if (current.id === post.parentPostId) {
      return {
        ...current,
        replyCount: current.replyCount + 1,
        replies: [...(current.replies ?? []), post]
      };
    }

    return {
      ...current,
      replies: current.replies ? appendPost(current.replies, post) : current.replies
    };
  });
}

function removePost(posts: StorefrontForumPostView[], postId: string): StorefrontForumPostView[] {
  return posts
    .filter((post) => post.id !== postId)
    .map((post) => ({
      ...post,
      replies: post.replies ? removePost(post.replies, postId) : post.replies
    }));
}

function ForumPost({
  post,
  isReply = false,
  onDelete,
  onReply
}: {
  post: StorefrontForumPostView;
  isReply?: boolean;
  onDelete: (postId: string) => void;
  onReply: (post: StorefrontForumPostView) => void;
}) {
  return (
    <article className={isReply ? "storefront-forum-post is-reply" : "storefront-forum-post"} id={`post-${post.id}`}>
      <div className="storefront-forum-post-meta">
        <strong>{post.author.displayName}</strong>
        <span>{new Date(post.createdAt).toLocaleString()}</span>
      </div>
      {post.body ? <p className="storefront-forum-post-body">{post.body}</p> : null}
      {post.imageUrl ? (
        <a className="storefront-forum-image-link" href={post.imageUrl} rel="noreferrer" target="_blank">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={post.imageUrl} />
        </a>
      ) : null}
      <div className="storefront-forum-actions">
        <button className="storefront-forum-action" onClick={() => onReply(post)} type="button">
          Reply
        </button>
        <button
          className="storefront-forum-action"
          onClick={() => {
            const url = `${window.location.origin}${window.location.pathname}#post-${post.id}`;
            void navigator.clipboard?.writeText(url);
          }}
          type="button"
        >
          Share
        </button>
        {post.viewerCanDelete ? (
          <button className="storefront-forum-action is-danger" onClick={() => onDelete(post.id)} type="button">
            Delete
          </button>
        ) : null}
      </div>
      {post.replies?.length ? (
        <div className="storefront-forum-replies">
          {post.replies.map((reply) => (
            <ForumPost isReply key={reply.id} onDelete={onDelete} onReply={onReply} post={reply} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function StorefrontForumTopicClient({ profile, topic, viewerCanManage }: StorefrontForumTopicClientProps) {
  const [posts, setPosts] = useState(topic.posts);
  const [guestName, setGuestName] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [replyTarget, setReplyTarget] = useState<StorefrontForumPostView | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const composerRef = useRef<HTMLTextAreaElement>(null);

  function selectReplyTarget(post: StorefrontForumPostView | null) {
    setReplyTarget(post);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function submitReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/storefront/${profile.slug}/forum/topics/${topic.id}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName,
          body,
          parentPostId: replyTarget?.id ?? "",
          imageUrl: topic.forumAllowPictureUploads ? imageUrl : ""
        })
      });
      const payload = (await response.json()) as { post?: StorefrontForumPostView; error?: string };

      if (!response.ok || !payload.post) {
        setError(payload.error ?? "Could not post reply.");
        return;
      }

      setPosts((current) => appendPost(current, payload.post!));
      setGuestName("");
      setBody("");
      setImageUrl("");
      setReplyTarget(null);
      setMessage("Reply posted.");
    });
  }

  async function deletePost(postId: string) {
    setError("");
    const response = await fetch(`/api/storefront/${profile.slug}/forum/posts/${postId}`, { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not delete reply.");
      return;
    }

    setPosts((current) => removePost(current, postId));
  }

  async function deleteTopic() {
    setError("");
    const response = await fetch(`/api/storefront/${profile.slug}/forum/topics/${topic.id}`, { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Could not delete topic.");
      return;
    }

    window.location.href = `/storefront/${profile.slug}/forum`;
  }

  return (
    <div className="storefront-forum-page">
      <section
        className="business-storefront-hero rounded-md p-6"
        style={
          profile.bannerUrl
            ? {
                backgroundImage: `linear-gradient(90deg, rgba(8, 11, 16, 0.88), rgba(8, 11, 16, 0.56)), url(${profile.bannerUrl})`
              }
            : undefined
        }
      >
        <div className="storefront-forum-title-row">
          <div>
            <Link className="text-sm font-semibold text-[var(--gold)]" href={`/storefront/${profile.slug}/forum`}>
              Forum
            </Link>
            <h1 className="mt-3 text-4xl font-semibold">{topic.title}</h1>
            <p className="mt-3 text-sm text-[var(--muted)]">
              {topic.replyCount} replies / Started by {topic.author.displayName}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href);
                setMessage("Topic link copied.");
              }}
              type="button"
            >
              Share
            </button>
            {viewerCanManage ? (
              <button className="btn-secondary" onClick={deleteTopic} type="button">
                Delete topic
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="storefront-forum-topic-layout">
        <section className="surface rounded-md p-5">
          <article className="storefront-forum-opening" id={`topic-${topic.id}`}>
            <div className="storefront-forum-post-meta">
              <strong>{topic.author.displayName}</strong>
              <span>{new Date(topic.createdAt).toLocaleString()}</span>
            </div>
            <p className="storefront-forum-post-body">{topic.body}</p>
            {topic.imageUrl ? (
              <a className="storefront-forum-image-link" href={topic.imageUrl} rel="noreferrer" target="_blank">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={topic.imageUrl} />
              </a>
            ) : null}
          </article>

          <div className="storefront-forum-thread">
            {posts.length ? (
              posts.map((post) => <ForumPost key={post.id} onDelete={deletePost} onReply={selectReplyTarget} post={post} />)
            ) : (
              <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">No replies yet.</p>
            )}
          </div>
        </section>

        <form className="surface storefront-forum-create rounded-md p-5" onSubmit={submitReply}>
          <div>
            <h2 className="text-xl font-semibold text-[var(--gold)]">Reply</h2>
            {replyTarget ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                Replying to {replyTarget.author.displayName}.{" "}
                <button className="text-[var(--gold)] underline" onClick={() => selectReplyTarget(null)} type="button">
                  Cancel
                </button>
              </p>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">Reply to the topic.</p>
            )}
          </div>
          <label className="grid gap-2">
            <span className="form-label">Your name</span>
            <input className="form-field" onChange={(event) => setGuestName(event.target.value)} value={guestName} />
            <small className="text-[var(--muted)]">Required for guests. Signed-in members can leave this blank.</small>
          </label>
          <label className="grid gap-2">
            <span className="form-label">Reply</span>
            <textarea className="form-field min-h-36 resize-y" onChange={(event) => setBody(event.target.value)} ref={composerRef} value={body} />
          </label>
          {topic.forumAllowPictureUploads ? (
            <label className="grid gap-2">
              <span className="form-label">Picture link, optional</span>
              <input className="form-field" onChange={(event) => setImageUrl(event.target.value)} placeholder="https://..." value={imageUrl} />
            </label>
          ) : null}
          {message ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
          {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          <button className="btn-primary" disabled={isPending || (!body.trim() && !imageUrl.trim())} type="submit">
            {isPending ? "Posting..." : "Post reply"}
          </button>
        </form>
      </div>
    </div>
  );
}
