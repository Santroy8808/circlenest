"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { StorefrontForumTopicListItemView, StorefrontForumView } from "@/modules/storefront-forum/types";

type StorefrontForumClientProps = {
  initialForum: StorefrontForumView;
};

export function StorefrontForumClient({ initialForum }: StorefrontForumClientProps) {
  const [topics, setTopics] = useState(initialForum.topics);
  const [query, setQuery] = useState("");
  const [guestName, setGuestName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const forumUrl = `/storefront/${initialForum.profile.slug}/forum`;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/storefront/${initialForum.profile.slug}/forum/topics?q=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        const payload = (await response.json()) as { forum?: StorefrontForumView; error?: string };
        if (response.ok && payload.forum) {
          setTopics(payload.forum.topics);
          setError("");
        } else {
          setError(payload.error ?? "Could not search forum topics.");
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError("Could not search forum topics.");
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [initialForum.profile.slug, query]);

  const topicCountLabel = useMemo(() => {
    const count = topics.length;
    if (query.trim()) return `${count} matching ${count === 1 ? "topic" : "topics"}`;
    return `${count} ${count === 1 ? "topic" : "topics"}`;
  }, [query, topics.length]);

  function submitTopic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/storefront/${initialForum.profile.slug}/forum/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName,
          title,
          body,
          imageUrl: initialForum.profile.forumAllowPictureUploads ? imageUrl : ""
        })
      });
      const payload = (await response.json()) as { topic?: StorefrontForumTopicListItemView; error?: string };

      if (!response.ok || !payload.topic) {
        setError(payload.error ?? "Could not create topic.");
        return;
      }

      setMessage("Topic created.");
      setGuestName("");
      setTitle("");
      setBody("");
      setImageUrl("");
      window.location.href = payload.topic.publicUrl;
    });
  }

  return (
    <div className="storefront-forum-page">
      <section
        className="business-storefront-hero rounded-md p-6"
        style={
          initialForum.profile.bannerUrl
            ? {
                backgroundImage: `linear-gradient(90deg, rgba(8, 11, 16, 0.88), rgba(8, 11, 16, 0.56)), url(${initialForum.profile.bannerUrl})`
              }
            : undefined
        }
      >
        <div className="storefront-forum-title-row">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Storefront forum</p>
            <h1 className="mt-3 text-4xl font-semibold">{initialForum.profile.businessName}</h1>
            <p className="mt-3 max-w-2xl text-[var(--muted)]">Search topics, start a topic, or reply inside an existing thread.</p>
          </div>
          <Link className="btn-secondary" href={`/storefront/${initialForum.profile.slug}`}>
            Back to storefront
          </Link>
        </div>
      </section>

      <div className="storefront-forum-layout">
        <section className="surface rounded-md p-5">
          <div className="storefront-forum-toolbar">
            <label className="grid gap-2">
              <span className="form-label">Live search</span>
              <input
                className="form-field"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search topics..."
                value={query}
              />
            </label>
            <span className="storefront-forum-count">{topicCountLabel}</span>
          </div>

          <div className="storefront-forum-list" aria-live="polite">
            {topics.length ? (
              topics.map((topic) => (
                <Link className="storefront-forum-row-link" href={topic.publicUrl} key={topic.id}>
                  <span className="storefront-forum-row-title">{topic.title}</span>
                  <span className="storefront-forum-row-meta">
                    {topic.replyCount} replies / {topic.author.displayName} / {new Date(topic.lastPostAt).toLocaleDateString()}
                  </span>
                </Link>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">
                {query.trim() ? "No matching topics." : "No topics yet. Start the first one."}
              </p>
            )}
          </div>
        </section>

        <form className="surface storefront-forum-create rounded-md p-5" onSubmit={submitTopic}>
          <div>
            <h2 className="text-xl font-semibold text-[var(--gold)]">Start a topic</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Keep it specific. Each topic becomes its own thread.</p>
          </div>
          <label className="grid gap-2">
            <span className="form-label">Your name</span>
            <input className="form-field" onChange={(event) => setGuestName(event.target.value)} value={guestName} />
            <small className="text-[var(--muted)]">Required for guests. Signed-in members can leave this blank.</small>
          </label>
          <label className="grid gap-2">
            <span className="form-label">Topic</span>
            <input className="form-field" maxLength={140} onChange={(event) => setTitle(event.target.value)} value={title} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Opening post</span>
            <textarea className="form-field min-h-36 resize-y" onChange={(event) => setBody(event.target.value)} value={body} />
          </label>
          {initialForum.profile.forumAllowPictureUploads ? (
            <label className="grid gap-2">
              <span className="form-label">Picture link, optional</span>
              <input className="form-field" onChange={(event) => setImageUrl(event.target.value)} placeholder="https://..." value={imageUrl} />
            </label>
          ) : null}
          {message ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
          {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          <button className="btn-primary" disabled={isPending || title.trim().length < 2 || body.trim().length < 1} type="submit">
            {isPending ? "Posting..." : "Create topic"}
          </button>
        </form>
      </div>
    </div>
  );
}
