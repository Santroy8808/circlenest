"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { uploadImageWithCompression } from "@/lib/media/image-upload.client";

type PostDiscussionComment = {
  id: string;
  content: string;
  mediaUrlsJson?: string | null;
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
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [error, setError] = useState("");
  const [pollStatus, setPollStatus] = useState("");

  function parseMedia(raw?: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    } catch {
      return [];
    }
  }

  async function uploadCommentMedia(files: FileList | null) {
    if (!files?.length) return;
    setUploadingMedia(true);
    setError("");
    try {
      const uploaded = (
        await Promise.all(
          Array.from(files).map(async (file) => {
            const result = await uploadImageWithCompression(file, { purpose: "post-media" });
            return result.url;
          }),
        )
      ).filter((url): url is string => Boolean(url));
      if (!uploaded.length) {
        setError("Could not upload media");
        return;
      }
      setMediaUrls((previous) => [...previous, ...uploaded].slice(0, 8));
    } finally {
      setUploadingMedia(false);
    }
  }

  async function submitComment() {
    const value = content.trim();
    if (!value && mediaUrls.length === 0) return;
    const res = await fetch(`/api/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: value, mediaUrls }),
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
            {comment.content ? <span>{comment.content}</span> : null}
            {parseMedia(comment.mediaUrlsJson).length ? (
              <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
                {parseMedia(comment.mediaUrlsJson).map((url) => (
                  <a key={`${comment.id}-${url}`} href={url} target="_blank" rel="noreferrer" className="block">
                    <Image src={url} alt="Comment media" width={560} height={420} unoptimized className="h-24 w-full rounded-md object-cover" />
                  </a>
                ))}
              </div>
            ) : null}
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
          <div className="flex items-center justify-between">
            <label className="inline-flex cursor-pointer items-center rounded-md border border-[#3d4e6d] bg-[#1a2335] px-2 py-1 text-xs text-slate-200 hover:bg-[#243149]">
              {uploadingMedia ? "Uploading..." : "Add photo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                disabled={uploadingMedia}
                onChange={(event) => {
                  void uploadCommentMedia(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {mediaUrls.length ? (
              <button type="button" className="text-xs underline text-slate-300" onClick={() => setMediaUrls([])}>
                Clear media
              </button>
            ) : null}
          </div>
          {mediaUrls.length ? (
            <div className="grid grid-cols-4 gap-2">
              {mediaUrls.map((url, index) => (
                <div key={`${url}-${index}`} className="relative">
                  <Image src={url} alt="Comment upload" width={240} height={240} unoptimized className="h-16 w-full rounded-md object-cover" />
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white"
                    onClick={() => setMediaUrls((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <button className="rounded-md border border-[var(--border)] bg-[#8f7228] px-3 py-1 text-sm text-black" onClick={() => void submitComment()}>
            Comment
          </button>
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
