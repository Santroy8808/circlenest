"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { CommentThread } from "@/components/comments/comment-thread";
import { uploadImageWithCompression } from "@/lib/media/image-upload.client";

type ForumThreadPost = {
  id: string;
  content: string;
  parentCommentId: string | null;
  mediaUrlsJson: string | null;
  createdAt: string | Date;
  author: { username: string };
};

export type ForumThreadCardData = {
  id: string;
  title: string;
  authorUsername: string;
  allowReplyImages: boolean;
  posts: ForumThreadPost[];
};

type ForumThreadCardProps = {
  groupId: string;
  thread: ForumThreadCardData;
  isMember: boolean;
};

export function ForumThreadCard({ groupId, thread, isMember }: ForumThreadCardProps) {
  const [posts, setPosts] = useState(thread.posts);
  const [content, setContent] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [error, setError] = useState("");
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const [replyToUsername, setReplyToUsername] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  async function uploadReplyMedia(files: FileList | null) {
    if (!files?.length) return;
    if (!thread.allowReplyImages) return;
    setUploadingMedia(true);
    setError("");
    try {
      const uploaded = (
        await Promise.all(
          Array.from(files).map(async (file) => {
            const result = await uploadImageWithCompression(file, { purpose: "group-post-media", groupId });
            return result.url;
          }),
        )
      ).filter((url): url is string => Boolean(url));
      if (!uploaded.length) {
        setError("Could not upload media.");
        return;
      }
      setMediaUrls((previous) => [...previous, ...uploaded].slice(0, 8));
    } finally {
      setUploadingMedia(false);
    }
  }

  async function submitReply() {
    if (submitting) return;
    const value = content.trim();
    if (!value && mediaUrls.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/groups/${groupId}/forum/threads/${thread.id}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: value,
          parentCommentId: replyToCommentId,
          mediaUrls,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not post reply.");
        return;
      }
      const created = (await res.json()) as ForumThreadPost;
      setPosts((previous) => [...previous, created]);
      setContent("");
      setMediaUrls([]);
      setReplyToCommentId(null);
      setReplyToUsername(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="rounded-[18px] border border-[var(--border)] bg-[#0e1524] p-3 shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-strong)]">{thread.title}</p>
          <p className="text-[11px] text-slate-500">by @{thread.authorUsername}</p>
        </div>
        <p className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${thread.allowReplyImages ? "border-emerald-400/30 bg-emerald-300/10 text-emerald-100" : "border-slate-500/30 bg-slate-500/10 text-slate-300"}`}>
          {thread.allowReplyImages ? "Photo replies on" : "Photo replies off"}
        </p>
      </div>

      <div className="mt-3">
        <CommentThread
          comments={posts}
          emptyText="No replies yet."
          onReply={(comment) => {
            setReplyToCommentId(comment.id);
            setReplyToUsername(comment.author.username);
            setContent((previous) => (previous.trim().length > 0 ? previous : `@${comment.author.username} `));
            inputRef.current?.focus();
          }}
        />
      </div>

      {isMember ? (
        <div className="mt-3 rounded-[14px] border border-[var(--border)] bg-[#111a2a] p-[5px]">
          {replyToUsername ? (
            <div className="flex items-center justify-between gap-2 rounded-[10px] border border-amber-400/25 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-100">
              <span>Replying to @{replyToUsername}</span>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setReplyToCommentId(null);
                  setReplyToUsername(null);
                }}
              >
                Cancel
              </button>
            </div>
          ) : null}

          <textarea
            ref={inputRef}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="mt-2 h-20 w-full rounded-[10px] border border-[#42556f] bg-[#1a2335] px-2 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300/20"
            placeholder={replyToUsername ? `Reply to @${replyToUsername}` : "Write a reply"}
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {thread.allowReplyImages ? (
                <label className="inline-flex cursor-pointer items-center rounded-full border border-[#3d4e6d] bg-[#1a2335] px-3 py-1.5 text-xs text-slate-200 hover:bg-[#243149]">
                  {uploadingMedia ? "Uploading..." : "Add photo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    disabled={uploadingMedia}
                    onChange={(event) => {
                      void uploadReplyMedia(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              ) : (
                <p className="text-[11px] text-slate-500">Photo replies are disabled by the thread author.</p>
              )}
              {mediaUrls.length ? (
                <button type="button" className="text-[11px] text-slate-300 underline" onClick={() => setMediaUrls([])}>
                  Clear media
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-full border border-[#6a5420]/60 bg-[#b89033] px-3 py-1.5 text-sm font-semibold text-[#1a1204] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.35)]"
              disabled={submitting}
              onClick={() => void submitReply()}
            >
              {submitting ? "Posting..." : "Reply"}
            </button>
          </div>

          {mediaUrls.length ? (
            <div className="mt-2 grid grid-cols-4 gap-2">
              {mediaUrls.map((url, index) => (
                <div key={`${url}-${index}`} className="relative">
                  <Image src={url} alt="Reply upload" width={240} height={180} unoptimized className="h-14 w-full rounded-md object-cover" />
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

          {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Join the group to reply.</p>
      )}
    </article>
  );
}
