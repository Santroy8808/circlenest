"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadImageWithCompression } from "@/lib/media/image-upload.client";
import { DirectMessageButton } from "@/components/messages/direct-message-button";
import { CommentThread } from "@/components/comments/comment-thread";

const FUNDRAISER_FIELD_CLASS =
  "w-full rounded-lg border border-[#52647f] bg-[#253145] px-3 py-2 font-sans text-sm leading-5 text-[#f3f6fb] shadow-inner shadow-black/10 placeholder:text-slate-400 focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/25";

type FundraiserComment = {
  id: string;
  content: string;
  mediaUrlsJson: string | null;
  createdAt: string;
  parentCommentId: string | null;
  author: {
    id: string;
    username: string;
  };
};

type FundraiserDiscussion = {
  id: string;
  title: string;
  description: string;
  goalAmount: number;
  fundraiserType: string;
  charityName: string | null;
  organizationName: string | null;
  campaignName: string | null;
  otherDescription: string | null;
  locationCountry: string | null;
  locationState: string | null;
  locationCity: string | null;
  currentOrg: string | null;
  currentService: string | null;
  additionalNotes: string | null;
  bannerUrl: string | null;
  allowDirectMessages: boolean;
  organizerName: string;
  creator: {
    id: string;
    username: string;
  };
  comments: FundraiserComment[];
};

type FundraiserDiscussionClientProps = {
  fundraiser: FundraiserDiscussion;
  currentUserId: string;
};

export function FundraiserDiscussionClient({ fundraiser, currentUserId }: FundraiserDiscussionClientProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [content, setContent] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [error, setError] = useState("");
  const [expandedMediaUrl, setExpandedMediaUrl] = useState<string | null>(null);
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const [replyToUsername, setReplyToUsername] = useState<string | null>(null);

  async function uploadCommentMedia(files: FileList | null) {
    if (!files?.length) return;
    setUploadingMedia(true);
    setError("");
    try {
      const uploaded = (
        await Promise.all(
          Array.from(files).map(async (file) => {
            const result = await uploadImageWithCompression(file, { purpose: "fundraiser-comment-media" });
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
    const res = await fetch(`/api/fundraisers/${fundraiser.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: value, parentCommentId: replyToCommentId, mediaUrls }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not add comment");
      return;
    }
    setContent("");
    setMediaUrls([]);
    setReplyToCommentId(null);
    setReplyToUsername(null);
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

  return (
    <section className="space-y-4 rounded border border-[var(--border)] bg-[#0b1220] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Comment stream</p>
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">Talk about this fund raiser</h2>
          <p className="text-sm text-slate-400">Every comment stays visible here for transparency.</p>
        </div>
        {fundraiser.allowDirectMessages ? (
          <div className="space-y-1 text-right">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Runner direct message</p>
            {fundraiser.creator.id !== currentUserId ? (
              <DirectMessageButton username={fundraiser.creator.username} label="DM runner" />
            ) : (
              <p className="text-xs text-slate-400">You are the runner.</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Direct messages are disabled for this fundraiser.</p>
        )}
      </div>

      <CommentThread
        comments={fundraiser.comments}
        onReply={(comment) => {
          setReplyToCommentId(comment.id);
          setReplyToUsername(comment.author.username);
          setContent((previous) => (previous.trim().length > 0 ? previous : `@${comment.author.username} `));
          inputRef.current?.focus();
        }}
        onOpenMedia={(url) => setExpandedMediaUrl(url)}
        emptyText="No comments yet."
      />

      <div className="space-y-2 rounded border border-[var(--border)] bg-[#11192a] p-3">
        {replyToUsername ? (
          <div className="flex items-center justify-between rounded border border-amber-400/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
            <span>Replying to @{replyToUsername}</span>
            <button
              type="button"
              className="underline"
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
          <button type="button" className="underline" onClick={() => insertFormat("**", "**")}>
            B
          </button>
          <button type="button" className="italic underline" onClick={() => insertFormat("_", "_")}>
            I
          </button>
          <button type="button" className="underline" onClick={() => insertFormat("<u>", "</u>")}>
            U
          </button>
          <button type="button" className="line-through underline-offset-2" onClick={() => insertFormat("~~", "~~")}>
            S
          </button>
        </div>
        <textarea
          ref={inputRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className={`${FUNDRAISER_FIELD_CLASS} h-28`}
          placeholder={replyToUsername ? `Reply to @${replyToUsername}` : "Write a comment"}
        />
        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-[#3d4e6d] bg-[#1a2335] px-3 py-2 text-xs text-slate-200 hover:bg-[#243149]">
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
          <div className="flex items-center gap-2">
            {mediaUrls.length ? (
              <button type="button" className="text-xs underline text-slate-300" onClick={() => setMediaUrls([])}>
                Clear media
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-md border border-[var(--border)] bg-[#8f7228] px-3 py-2 text-sm font-semibold text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.35)]"
              onClick={() => void submitComment()}
            >
              Comment
            </button>
          </div>
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
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>

      {expandedMediaUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setExpandedMediaUrl(null)}>
          <div className="relative max-h-[92vh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="absolute -top-9 right-0 text-sm text-slate-100 underline" onClick={() => setExpandedMediaUrl(null)}>
              Close
            </button>
            <Image src={expandedMediaUrl} alt="Expanded media" width={1800} height={1800} unoptimized className="max-h-[90vh] w-auto rounded-md object-contain" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
