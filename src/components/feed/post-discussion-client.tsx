"use client";

import { useState } from "react";
import Link from "next/link";

type PostDiscussionComment = {
  id: string;
  content: string;
  parentCommentId: string | null;
  author: { username: string };
};

type PostDiscussion = {
  id: string;
  content: string;
  imageUrl: string | null;
  mediaUrlsJson: string | null;
  commentsLocked: boolean;
  author: { id: string; username: string };
  poll?: {
    id: string;
    question: string;
    allowMulti: boolean;
    options: Array<{ id: string; label: string; _count?: { votes: number } }>;
    votes?: Array<{ optionId: string }>;
  } | null;
  comments: PostDiscussionComment[];
};

export function PostDiscussionClient({
  post,
  currentUserId,
}: {
  post: PostDiscussion;
  currentUserId: string;
}) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [pollStatus, setPollStatus] = useState("");

  async function submitComment() {
    const value = content.trim();
    if (!value) return;
    const res = await fetch(`/api/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: value }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not add comment");
      return;
    }
    window.location.reload();
  }

  async function vote(optionId: string) {
    setPollStatus("Saving vote...");
    const res = await fetch(`/api/posts/${post.id}/poll/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionIds: [optionId] }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setPollStatus(body.error ?? "Could not save vote.");
      return;
    }
    window.location.reload();
  }

  return (
    <section className="space-y-4 rounded-[10px] bg-[#121a2a] px-6 py-5">
      <div className="text-sm text-slate-300">
        <Link href="/home" className="underline">Back to stream</Link>
      </div>
      <p className="text-[14px] font-semibold text-slate-100">
        <Link href={`/profile/${post.author.username}`} className="hover:underline">@{post.author.username}</Link>
      </p>
      <p className="text-[18px] leading-[1.55]">{post.content}</p>
      {post.poll ? (
        <div className="rounded-md border border-[var(--border)] bg-[#0b1220] p-3">
          <p className="mb-2 text-sm font-semibold text-slate-100">{post.poll.question}</p>
          <div className="space-y-2">
            {post.poll.options.map((option) => {
              const mine = post.poll?.votes?.some((vote) => vote.optionId === option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-sm ${mine ? "border-emerald-400" : "border-slate-600 hover:border-slate-300"}`}
                  onClick={() => void vote(option.id)}
                >
                  <span>{option.label}</span>
                  <span className="text-xs text-slate-400">{option._count?.votes ?? 0} votes</span>
                </button>
              );
            })}
          </div>
          {pollStatus ? <p className="mt-2 text-xs text-slate-400">{pollStatus}</p> : null}
        </div>
      ) : null}
      <div className="space-y-2">
        {post.comments.map((comment) => (
          <div key={comment.id} className="rounded-md bg-[#0b1220] px-3 py-2 text-sm">
            <Link href={`/profile/${comment.author.username}`} className="mr-1 text-slate-300 hover:underline">@{comment.author.username}</Link>
            <span>{comment.content}</span>
          </div>
        ))}
      </div>
      {post.commentsLocked && post.author.id !== currentUserId ? (
        <p className="text-xs text-slate-400">Comments are locked by the post owner.</p>
      ) : (
        <div className="space-y-2">
          <input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Write a comment"
          />
          <button className="rounded-md border border-[var(--border)] bg-[#8f7228] px-3 py-1 text-sm text-black" onClick={() => void submitComment()}>
            Comment
          </button>
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
