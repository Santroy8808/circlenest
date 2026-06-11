"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadImageWithCompression } from "@/lib/media/image-upload.client";
import { DirectMessageButton } from "@/components/messages/direct-message-button";
import { ReportControl } from "@/components/reports/report-control";
import { CommentThread } from "@/components/comments/comment-thread";

type PostDiscussionComment = {
  id: string;
  content: string;
  mediaUrlsJson?: string | null;
  parentCommentId: string | null;
  createdAt: string | Date;
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
  returnTo = "/home",
}: {
  post: PostDiscussion;
  currentUserId: string;
  returnTo?: string;
}) {
  const router = useRouter();
  const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/home";
  const [content, setContent] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [error, setError] = useState("");
  const [pollStatus, setPollStatus] = useState("");
  const [expandedMediaUrl, setExpandedMediaUrl] = useState<string | null>(null);
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const [replyToUsername, setReplyToUsername] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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
      body: JSON.stringify({ content: value, parentCommentId: replyToCommentId, mediaUrls }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not add comment");
      return;
    }
    setReplyToCommentId(null);
    setReplyToUsername(null);
    setContent("");
    setMediaUrls([]);
    router.push(safeReturnTo);
    router.refresh();
  }

  function insertFormat(prefix: string, suffix = "") {
    const el = inputRef.current;
    if (!el) {
      setContent((previous) => `${previous}${prefix}${suffix}`);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const selected = content.slice(start, end);
    const next = `${content.slice(0, start)}${prefix}${selected}${suffix}${content.slice(end)}`;
    setContent(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const cursor = start + prefix.length + selected.length + suffix.length;
      el.setSelectionRange(cursor, cursor);
    });
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
        <Link href={safeReturnTo} className="underline">Back</Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[14px] font-semibold text-slate-100">
          <Link href={`/profile/${post.author.username}`} className="hover:underline">@{post.author.username}</Link>
        </p>
        {post.author.id !== currentUserId ? (
          <DirectMessageButton
            username={post.author.username}
            label="DM"
            className="inline-flex min-h-8 items-center rounded-md border border-[#6a5420] bg-[#b89033] px-2.5 py-1 text-xs font-semibold text-[#1a1204] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)] transition hover:bg-[#c59a36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6b25a] disabled:opacity-60"
          />
        ) : null}
      </div>
      <p className="text-[18px] leading-[1.55]">{post.content}</p>
      <div className="max-w-sm">
        <ReportControl targetType="POST" targetId={post.id} label="Report post" compact />
      </div>
      {(() => {
        const media = parseMedia(post.mediaUrlsJson);
        if (media.length) {
          return (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {media.map((url) => (
                <button key={url} type="button" className="text-left" onClick={() => setExpandedMediaUrl(url)}>
                  <Image src={url} alt="Post media" width={900} height={700} unoptimized className="h-32 w-full rounded-md object-cover" />
                </button>
              ))}
            </div>
          );
        }
        return post.imageUrl ? (
          <button type="button" className="w-full text-left" onClick={() => setExpandedMediaUrl(post.imageUrl as string)}>
            <Image src={post.imageUrl} alt="Post image" width={1200} height={900} unoptimized className="max-h-80 w-full rounded-md object-cover" />
          </button>
        ) : null;
      })()}
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
      <CommentThread
        comments={post.comments}
        onReply={(comment) => {
          setReplyToCommentId(comment.id);
          setReplyToUsername(comment.author.username);
          setContent((previous) => (previous.trim().length > 0 ? previous : `@${comment.author.username} `));
          inputRef.current?.focus();
        }}
        renderActions={(comment) => <ReportControl targetType="COMMENT" targetId={comment.id} label="Report comment" compact />}
        onOpenMedia={(url) => setExpandedMediaUrl(url)}
        emptyText="No comments yet."
      />
      {post.commentsLocked && post.author.id !== currentUserId ? (
        <p className="text-xs text-slate-400">Comments are locked by the post owner.</p>
      ) : (
        <div className="space-y-2">
          {replyToUsername ? (
            <div className="flex items-center justify-between rounded border border-amber-400/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
              <span>Replying to @{replyToUsername}</span>
              <button
                type="button"
                className="text-amber-100 underline"
                onClick={() => {
                  setReplyToCommentId(null);
                  setReplyToUsername(null);
                }}
              >
                Cancel reply
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" className="underline" onClick={() => insertFormat("**", "**")}>B</button>
            <button type="button" className="italic underline" onClick={() => insertFormat("_", "_")}>I</button>
            <button type="button" className="underline" onClick={() => insertFormat("<u>", "</u>")}>U</button>
            <button type="button" className="line-through underline-offset-2" onClick={() => insertFormat("~~", "~~")}>S</button>
          </div>
          <textarea
            ref={inputRef}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="h-24 w-full rounded-md border px-3 py-2 text-sm"
            placeholder={replyToUsername ? `Reply to @${replyToUsername}` : "Write a comment"}
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
      {expandedMediaUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setExpandedMediaUrl(null)}>
          <div className="relative max-h-[92vh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="absolute -top-9 right-0 text-sm text-slate-100 underline" onClick={() => setExpandedMediaUrl(null)}>Close</button>
            <Image src={expandedMediaUrl} alt="Expanded media" width={1800} height={1800} unoptimized className="max-h-[90vh] w-auto rounded-md object-contain" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
