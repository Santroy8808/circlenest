"use client";

import { AdPlacement, FeedReactionType, FeedVisibility, MediaVisibility, MembershipTier } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import type { FormEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import { ThetaLikeTriangle } from "@/components/reactions/theta-like-triangle";
import type { AdPlacementCardView } from "@/modules/ads-credits/types";
import type { FeedAuthorView, FeedCommentView, FeedPostView, FeedReactionReactorsView } from "@/modules/feed-stream/types";

type FeedImageAttachment = {
  file: File;
  previewUrl: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

type FeedImageSource = "STREAM_POST" | "STREAM_REPLY";

type FeedCurrentAuthor = {
  id?: string;
  displayName: string;
  tier?: MembershipTier;
  username: string;
  avatarUrl?: string | null;
};

type FeedMode = "latest" | "friends" | "groups" | "pictures";

type ReplyTarget = {
  parentCommentId?: string;
  label: string;
};

type TextFormat = "bold" | "italic" | "bulletList" | "numberedList" | "link";

type TextFormatResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

type QuickReaction = {
  type: FeedReactionType;
  icon: string;
  label: string;
};

const quickReactions = [
  { type: FeedReactionType.LIKE, icon: "", label: "Like" },
  { type: FeedReactionType.LOVE, icon: "\u{2764}\u{FE0F}", label: "Love" },
  { type: FeedReactionType.CARE, icon: "\u{1F917}", label: "Care" },
  { type: FeedReactionType.HAHA, icon: "\u{1F602}", label: "Haha" },
  { type: FeedReactionType.WOW, icon: "\u{1F62E}", label: "Wow" }
] satisfies QuickReaction[];

const feedModes: Array<{ key: FeedMode; label: string; helper: string }> = [
  { key: "latest", label: "Latest", helper: "Newest member posts first." },
  { key: "friends", label: "Friends", helper: "Posts shared to closer circles." },
  { key: "groups", label: "Groups", helper: "Group stream items when available." },
  { key: "pictures", label: "Pics", helper: "Posts with image attachments." }
];

const emojiChoices = ["\u{1F600}", "\u{1F602}", "\u{1F60D}", "\u{1F64F}", "\u{1F525}", "\u{1F389}", "\u{1F44F}", "\u{1F4AF}", "\u{2728}", "\u{2615}"];
const RESERVED_STREAM_SLOT_INDEX = 5;
const IMPRESSION_EVENT = "IMPRESSION";
const CLICK_EVENT = "CLICK";

function reactionMeta(type: FeedReactionType) {
  return quickReactions.find((reaction) => reaction.type === type) ?? quickReactions[0];
}

function ReactionIcon({ reaction }: { reaction: QuickReaction }) {
  if (reaction.type === FeedReactionType.LIKE) {
    return <ThetaLikeTriangle />;
  }

  return <span aria-hidden="true">{reaction.icon}</span>;
}

function createImageAttachment(file: File): FeedImageAttachment {
  return {
    file,
    previewUrl: URL.createObjectURL(file),
    progress: 0,
    status: "queued"
  };
}

async function uploadFeedImage(image: FeedImageAttachment, onUpdate: (patch: Partial<FeedImageAttachment>) => void, source: FeedImageSource) {
  onUpdate({ status: "uploading", progress: 1, error: undefined });

  const intentResponse = await fetch("/api/media/upload-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: image.file.name,
      mimeType: image.file.type || "application/octet-stream",
      sizeBytes: image.file.size,
      visibility: MediaVisibility.MEMBERS,
      source
    })
  });
  const intent = (await intentResponse.json()) as { error?: string; uploadUrl?: string; storageKey?: string };

  if (!intentResponse.ok || !intent.uploadUrl || !intent.storageKey) {
    throw new Error(intent.error ?? "Could not prepare image upload.");
  }

  await uploadWithResilientFallback({
    uploadUrl: intent.uploadUrl,
    storageKey: intent.storageKey,
    file: image.file,
    onProgress: (progress) => onUpdate({ progress })
  });

  const completeResponse = await fetch("/api/media/complete-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storageKey: intent.storageKey,
      fileName: image.file.name,
      mimeType: image.file.type || "application/octet-stream",
      sizeBytes: image.file.size,
      visibility: MediaVisibility.MEMBERS,
      caption: "",
      source,
      tags: []
    })
  });
  const complete = (await completeResponse.json()) as { error?: string; asset?: { id: string } };

  if (!completeResponse.ok || !complete.asset?.id) {
    throw new Error(complete.error ?? "Could not save image.");
  }

  onUpdate({ status: "done", progress: 100 });
  return complete.asset.id;
}

function stripListMarker(line: string) {
  const indent = line.match(/^\s*/)?.[0] ?? "";
  const content = line.slice(indent.length).replace(/^(?:[-*]\s+|\d+[.)]\s+)/, "");
  return { indent, content };
}

function formatListLines(text: string, ordered: boolean) {
  return text
    .split("\n")
    .map((line, index) => {
      if (!line.trim()) return line;
      const { indent, content } = stripListMarker(line);
      return ordered ? `${indent}${index + 1}. ${content}` : `${indent}- ${content}`;
    })
    .join("\n");
}

function applyInlineFormat(value: string, format: Exclude<TextFormat, "bulletList" | "numberedList">, selectionStart: number, selectionEnd: number): TextFormatResult {
  const selected = value.slice(selectionStart, selectionEnd);
  const fallback = format === "bold" ? "bold text" : format === "italic" ? "italic text" : "link text";
  const selectedOrFallback = selected || fallback;
  const wrapped =
    format === "bold"
      ? `**${selectedOrFallback}**`
      : format === "italic"
        ? `_${selectedOrFallback}_`
        : `[${selectedOrFallback}](https://)`;

  const nextValue = `${value.slice(0, selectionStart)}${wrapped}${value.slice(selectionEnd)}`;
  const cursorStart = selectionStart + (format === "link" ? 1 : format === "bold" ? 2 : 1);
  const cursorEnd = cursorStart + selectedOrFallback.length;

  return {
    value: nextValue,
    selectionStart: selected ? selectionStart : cursorStart,
    selectionEnd: selected ? selectionStart + wrapped.length : cursorEnd
  };
}

function applyListFormat(value: string, ordered: boolean, selectionStart: number, selectionEnd: number): TextFormatResult {
  const marker = ordered ? "1. " : "- ";
  const selected = value.slice(selectionStart, selectionEnd);

  if (!selected) {
    const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
    const nextLineBreak = value.indexOf("\n", selectionStart);
    const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
    const currentLine = value.slice(lineStart, lineEnd);

    if (!currentLine.trim()) {
      const nextValue = `${value.slice(0, selectionStart)}${marker}${value.slice(selectionStart)}`;
      const nextCursor = selectionStart + marker.length;
      return { value: nextValue, selectionStart: nextCursor, selectionEnd: nextCursor };
    }

    const formattedLine = formatListLines(currentLine, ordered);
    const nextValue = `${value.slice(0, lineStart)}${formattedLine}${value.slice(lineEnd)}`;
    const delta = formattedLine.length - currentLine.length;
    const nextCursor = selectionStart + delta;
    return { value: nextValue, selectionStart: nextCursor, selectionEnd: nextCursor };
  }

  const formatted = formatListLines(selected, ordered);
  const nextValue = `${value.slice(0, selectionStart)}${formatted}${value.slice(selectionEnd)}`;

  return {
    value: nextValue,
    selectionStart,
    selectionEnd: selectionStart + formatted.length
  };
}

function applyTextFormat(value: string, format: TextFormat, selectionStart = value.length, selectionEnd = selectionStart): TextFormatResult {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.min(value.length, Math.max(selectionStart, selectionEnd));

  if (format === "bulletList") return applyListFormat(value, false, start, end);
  if (format === "numberedList") return applyListFormat(value, true, start, end);
  return applyInlineFormat(value, format, start, end);
}

function safeRichTextHref(href: string) {
  if (href.startsWith("https://") || href.startsWith("http://") || href.startsWith("/")) {
    return href;
  }

  return "#";
}

function renderInlineRichText(text: string) {
  const pieces = text.split(/(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);

  return pieces.map((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**")) {
      return <strong key={`${piece}-${index}`}>{piece.slice(2, -2)}</strong>;
    }

    if (piece.startsWith("_") && piece.endsWith("_")) {
      return <em key={`${piece}-${index}`}>{piece.slice(1, -1)}</em>;
    }

    const linkMatch = piece.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a className="feed-rich-link" href={safeRichTextHref(linkMatch[2])} key={`${piece}-${index}`} rel="noreferrer" target="_blank">
          {linkMatch[1]}
        </a>
      );
    }

    return <span key={`${piece}-${index}`}>{piece}</span>;
  });
}

function RichText({ value }: { value: string }) {
  if (!value.trim()) return null;

  return (
    <div className="feed-rich-text">
      {value.split("\n").map((line, index) => {
        const numberedMatch = line.match(/^(\d+)[.)]\s+(.+)$/);

        return line.startsWith("- ") ? (
          <p className="feed-rich-list-line" key={`${line}-${index}`}>
            {renderInlineRichText(line.slice(2))}
          </p>
        ) : numberedMatch ? (
          <p className="feed-rich-list-line is-numbered" data-list-number={`${numberedMatch[1]}.`} key={`${line}-${index}`}>
            {renderInlineRichText(numberedMatch[2])}
          </p>
        ) : (
          <p key={`${line}-${index}`}>{renderInlineRichText(line)}</p>
        );
      })}
    </div>
  );
}

function Avatar({
  className,
  displayName,
  src
}: {
  className: string;
  displayName: string;
  src?: string | null;
}) {
  return (
    <span className={className}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={src} />
      ) : (
        displayName.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

function ProfileAvatarLink({ author, className }: { author: FeedAuthorView; className: string }) {
  return (
    <Link aria-label={`View ${author.displayName}'s profile`} className="feed-profile-link" href={`/profile/${author.username}`}>
      <Avatar className={className} displayName={author.displayName} src={author.avatarUrl} />
    </Link>
  );
}

function ProfileNameLink({ author, compact = false }: { author: FeedAuthorView; compact?: boolean }) {
  return (
    <>
      <Link className="feed-author-name-link" href={`/profile/${author.username}`}>
        {author.displayName}
      </Link>
      <Link className={compact ? "feed-author-handle-link is-compact" : "feed-author-handle-link"} href={`/profile/${author.username}`}>
        @{author.username}
      </Link>
    </>
  );
}

function FeedMedia({ media }: { media?: FeedPostView["media"] }) {
  if (!media?.publicUrl || !media.mimeType.startsWith("image/")) return null;

  return (
    <a className="feed-media-card" href={media.publicUrl} rel="noreferrer" target="_blank">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={media.originalName ?? "Attached stream image"} src={media.publicUrl} />
    </a>
  );
}

function postReservedStreamDeliveryEvent(ad: AdPlacementCardView, eventType: typeof IMPRESSION_EVENT | typeof CLICK_EVENT) {
  const payload = JSON.stringify({
    campaignId: ad.id,
    placement: AdPlacement.RESERVED_STREAM,
    eventType,
    metadata: {
      source: "reserved-stream-slot"
    }
  });

  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    navigator.sendBeacon("/api/ads/delivery", new Blob([payload], { type: "application/json" }));
    return;
  }

  void fetch("/api/ads/delivery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true
  });
}

function ReservedStreamAdCard({ ad }: { ad: AdPlacementCardView }) {
  const content = (
    <>
      {ad.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={ad.imageAlt} className="feed-reserved-ad-image" src={ad.imageUrl} />
      ) : null}
      <div className="feed-reserved-ad-body">
        <span className="feed-visibility-chip">sponsored</span>
        <strong>{ad.title}</strong>
        <span>{ad.body}</span>
      </div>
    </>
  );

  const className = `feed-reserved-ad surface rounded-md${ad.imageUrl ? "" : " has-no-image"}`;

  return ad.destinationUrl ? (
    <a className={className} href={ad.destinationUrl} onClick={() => postReservedStreamDeliveryEvent(ad, CLICK_EVENT)}>
      {content}
    </a>
  ) : (
    <article className={className}>{content}</article>
  );
}

function ReactionButtons({
  counts,
  compact = false,
  currentUserId,
  onReact,
  reactors = {}
}: {
  counts: Partial<Record<FeedReactionType, number>>;
  compact?: boolean;
  currentUserId?: string;
  onReact: (type: FeedReactionType) => void;
  reactors?: FeedReactionReactorsView;
}) {
  const visibleReactionCounts = quickReactions.filter((reaction) => (counts[reaction.type] ?? 0) > 0);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [detailsType, setDetailsType] = useState<FeedReactionType | "ALL" | null>(null);
  const myReactionType = currentUserId
    ? quickReactions.find((reaction) => reactors[reaction.type]?.some((reactor) => reactor.id === currentUserId))?.type
    : undefined;
  const topReactionType =
    myReactionType ??
    quickReactions.reduce<FeedReactionType>((current, reaction) => {
      return (counts[reaction.type] ?? 0) > (counts[current] ?? 0) ? reaction.type : current;
    }, quickReactions[0].type);
  const triggerReaction = reactionMeta(topReactionType);
  const detailReactors =
    detailsType === "ALL"
      ? quickReactions.flatMap((reaction) => (reactors[reaction.type] ?? []).map((reactor) => ({ reaction, reactor })))
      : detailsType
        ? (reactors[detailsType] ?? []).map((reactor) => ({ reaction: reactionMeta(detailsType), reactor }))
        : [];

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  function openChoices() {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    setChoicesOpen(true);
  }

  function scheduleCloseChoices() {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setChoicesOpen(false), 220);
  }

  function chooseReaction(type: FeedReactionType) {
    setChoicesOpen(false);
    setDetailsType(null);
    onReact(type);
  }

  return (
    <div
      className={`${compact ? "feed-reaction-menu is-compact" : "feed-reaction-menu"}${choicesOpen ? " is-open" : ""}`}
      onBlur={scheduleCloseChoices}
      onFocus={openChoices}
      onMouseEnter={openChoices}
      onMouseLeave={scheduleCloseChoices}
    >
      <button
        aria-expanded={choicesOpen}
        aria-label="React"
        className={myReactionType ? "feed-reaction-trigger has-user-reaction" : "feed-reaction-trigger"}
        onClick={() => setChoicesOpen((open) => !open)}
        type="button"
      >
        <ReactionIcon reaction={triggerReaction} />
      </button>
      {visibleReactionCounts.map((reaction) => (
        <button
          aria-expanded={detailsType === reaction.type}
          aria-label={`See ${reaction.label} reactions`}
          className="feed-reaction-count-chip"
          key={reaction.type}
          onClick={() => setDetailsType((current) => (current === reaction.type ? null : reaction.type))}
          title={`See ${reaction.label} reactions`}
          type="button"
        >
          <ReactionIcon reaction={reaction} />
          <span>{counts[reaction.type]}</span>
        </button>
      ))}
      <div className="feed-reaction-popover" role="menu" aria-label="Reaction options">
        {quickReactions.map((reaction) => (
          <button
            aria-label={reaction.label}
            className={myReactionType === reaction.type ? "feed-reaction-choice is-selected" : "feed-reaction-choice"}
            key={reaction.type}
            onClick={() => chooseReaction(reaction.type)}
            role="menuitem"
            title={reaction.label}
            type="button"
          >
            <ReactionIcon reaction={reaction} />
          </button>
        ))}
      </div>
      {detailsType ? (
        <div className="feed-reaction-details-popover" role="dialog" aria-label="People who reacted">
          <strong>{detailsType === "ALL" ? "Reactions" : reactionMeta(detailsType).label}</strong>
          {detailReactors.length > 0 ? (
            <ul>
              {detailReactors.map(({ reaction, reactor }) => (
                <li key={`${reaction.type}-${reactor.id}`}>
                  <ReactionIcon reaction={reaction} />
                  <Link className="profile-inline-link" href={`/profile/${reactor.username}`}>
                    {reactor.displayName}
                  </Link>
                  <Link className="profile-inline-link" href={`/profile/${reactor.username}`}>
                    <small>@{reactor.username}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No reactions yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ComposerToolbar({
  compact = false,
  disabled,
  onEmoji,
  onFile,
  onFormat,
  trailingAction
}: {
  compact?: boolean;
  disabled?: boolean;
  onEmoji: (emoji: string) => void;
  onFile: (file: File) => void;
  onFormat: (format: TextFormat) => void;
  trailingAction?: ReactNode;
}) {
  return (
    <div className={compact ? "feed-toolbar is-compact" : "feed-toolbar"}>
      <div className="feed-format-tools" aria-label="Text formatting">
        <div className="feed-emoji-menu">
          <button aria-haspopup="true" className="feed-emoji-trigger" disabled={disabled} type="button">
            <span aria-hidden="true">{"\u{1F642}"}</span>
          </button>
          <div className="feed-emoji-tools" role="menu" aria-label="Emoji picker">
            {emojiChoices.map((emoji) => (
              <button aria-label={`Add ${emoji}`} disabled={disabled} key={emoji} onClick={() => onEmoji(emoji)} role="menuitem" type="button">
                {emoji}
              </button>
            ))}
          </div>
        </div>
        <button disabled={disabled} onClick={() => onFormat("bold")} type="button">
          B
        </button>
        <button disabled={disabled} onClick={() => onFormat("italic")} type="button">
          I
        </button>
        <button disabled={disabled} onClick={() => onFormat("bulletList")} type="button">
          Bullets
        </button>
        <button disabled={disabled} onClick={() => onFormat("numberedList")} type="button">
          Numbers
        </button>
        <button disabled={disabled} onClick={() => onFormat("link")} type="button">
          Link
        </button>
        <label aria-label="Attach image" className="feed-picture-button" title="Attach image">
          <span aria-hidden="true" className="feed-picture-glyph">▧</span>
          <span className="sr-only">Attach image</span>
          <input
            accept="image/*"
            className="hidden"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      {trailingAction ? <div className="feed-toolbar-action">{trailingAction}</div> : null}
    </div>
  );
}

function ImagePreview({
  image,
  onRemove
}: {
  image: FeedImageAttachment;
  onRemove: () => void;
}) {
  return (
    <div className="feed-image-preview">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={image.previewUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{image.file.name}</p>
        <p className="text-xs text-[var(--muted)]">
          {image.status === "uploading" ? `Uploading ${image.progress}%` : image.status === "done" ? "Ready" : "Attached"}
        </p>
        {image.status === "uploading" ? (
          <div className="feed-upload-meter">
            <span style={{ width: `${image.progress}%` }} />
          </div>
        ) : null}
        {image.error ? <p className="text-xs text-red-100">{image.error}</p> : null}
      </div>
      <button className="btn-secondary px-3 py-1 text-xs" onClick={onRemove} type="button">
        Remove
      </button>
    </div>
  );
}

function CommentComposer({
  commentBody,
  commentError,
  commentImage,
  disabled,
  label,
  onCancel,
  onEmoji,
  onFile,
  onFormat,
  onImageRemove,
  onSubmit,
  setTextareaRef,
  updateBody
}: {
  commentBody: string;
  commentError?: string;
  commentImage?: FeedImageAttachment;
  disabled: boolean;
  label: string;
  onCancel: () => void;
  onEmoji: (emoji: string) => void;
  onFile: (file: File) => void;
  onFormat: (format: TextFormat) => void;
  onImageRemove: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setTextareaRef: (node: HTMLTextAreaElement | null) => void;
  updateBody: (value: string) => void;
}) {
  return (
    <form className="feed-comment-composer is-quick-reply" onSubmit={onSubmit}>
      <div className="feed-quick-reply-topline">
        <span>{label}</span>
        <button onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
      <textarea
        className="form-field min-h-16 resize-y"
        onChange={(event) => updateBody(event.target.value)}
        placeholder="Quick reply..."
        ref={setTextareaRef}
        value={commentBody}
      />
      {commentImage ? <ImagePreview image={commentImage} onRemove={onImageRemove} /> : null}
      <ComposerToolbar
        compact
        disabled={disabled}
        onEmoji={onEmoji}
        onFile={onFile}
        onFormat={onFormat}
        trailingAction={
          <button className="btn-secondary send-logo-button is-compact feed-comment-send" disabled={disabled || (!commentBody.trim() && !commentImage)} type="submit">
            <span aria-hidden="true" className="send-logo-icon" />
            <span className="sr-only">Reply</span>
          </button>
        }
      />
      {commentError ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{commentError}</p> : null}
    </form>
  );
}

function FeedCommentRow({
  comment,
  currentUserId,
  depth = 0,
  defaultExpanded = false,
  onReact,
  onReply,
  onShare
}: {
  comment: FeedCommentView;
  currentUserId?: string;
  depth?: number;
  defaultExpanded?: boolean;
  onReact: (commentId: string, type: FeedReactionType) => void;
  onReply: (comment: FeedCommentView) => void;
  onShare: (commentId: string) => void;
}) {
  const loadedReplies = comment.replies ?? [];
  const hasLoadedReplies = loadedReplies.length > 0;
  const hasHiddenReplies = comment.replyCount > 0 && !hasLoadedReplies;
  const [expanded, setExpanded] = useState(defaultExpanded || depth === 0);

  return (
    <div className={depth > 0 ? "comment-bubble is-reply" : "comment-bubble"} id={`comment-${comment.id}`}>
      <div className="comment-bubble-main">
        <ProfileAvatarLink author={comment.author} className="comment-author-dot" />
        <div className="min-w-0 flex-1">
          <div className="comment-inline-meta">
            <ProfileNameLink author={comment.author} compact />
            <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
            {hasHiddenReplies ? <span>{comment.replyCount} replies</span> : null}
          </div>
          <RichText value={comment.body} />
          <FeedMedia media={comment.media} />
          <div className="comment-action-row">
            <ReactionButtons
              compact
              counts={comment.reactions}
              currentUserId={currentUserId}
              onReact={(reaction) => onReact(comment.id, reaction)}
              reactors={comment.reactionReactors}
            />
            {hasLoadedReplies ? (
              <button className="comment-reply-link" onClick={() => setExpanded((value) => !value)} type="button">
                {expanded ? "Collapse" : `Expand ${loadedReplies.length}`}
              </button>
            ) : null}
            <button aria-label="Reply to comment" className="comment-reply-link" onClick={() => onReply(comment)} title="Reply" type="button">
              <span aria-hidden="true">{"\u21A9"}</span>
            </button>
            <button aria-label="Share comment" className="comment-share-link" onClick={() => onShare(comment.id)} title="Share" type="button">
              <span aria-hidden="true">{"\u2192"}</span>
            </button>
          </div>
        </div>
      </div>
      {hasLoadedReplies && expanded ? (
        <div className="comment-replies">
          {loadedReplies.map((reply) => (
            <FeedCommentRow
              comment={reply}
              currentUserId={currentUserId}
              defaultExpanded={defaultExpanded}
              depth={depth + 1}
              key={reply.id}
              onReact={onReact}
              onReply={onReply}
              onShare={onShare}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function shouldIgnoreCardClick(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("a, button, form, input, textarea, label, select, summary, details"));
}

export function FeedClient({
  currentAuthor,
  defaultExpanded = false,
  initialReplyPostId,
  initialPosts,
  initialReservedStreamAds = [],
  refreshPath = "/api/feed/posts",
  showComposerTrigger = true,
  showThreadLinks = true
}: {
  currentAuthor?: FeedCurrentAuthor;
  defaultExpanded?: boolean;
  initialReplyPostId?: string;
  initialPosts: FeedPostView[];
  initialReservedStreamAds?: AdPlacementCardView[];
  refreshPath?: string;
  showComposerTrigger?: boolean;
  showThreadLinks?: boolean;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [reservedStreamAds, setReservedStreamAds] = useState(initialReservedStreamAds);
  const [feedMode, setFeedMode] = useState<FeedMode>("latest");
  const [body, setBody] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [postImage, setPostImage] = useState<FeedImageAttachment | null>(null);
  const [commentBodies, setCommentBodies] = useState<Record<string, string>>({});
  const [commentImages, setCommentImages] = useState<Record<string, FeedImageAttachment | undefined>>({});
  const [commentErrors, setCommentErrors] = useState<Record<string, string | undefined>>({});
  const [replyTargets, setReplyTargets] = useState<Record<string, ReplyTarget | undefined>>(() =>
    initialReplyPostId ? { [initialReplyPostId]: { label: "Replying to post" } } : {}
  );
  const [shareMenus, setShareMenus] = useState<Record<string, boolean>>({});
  const [hiddenPostIds, setHiddenPostIds] = useState<Record<string, boolean>>({});
  const [quietAuthorIds, setQuietAuthorIds] = useState<Record<string, boolean>>({});
  const [trustMessage, setTrustMessage] = useState("");
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>(() =>
    defaultExpanded || initialReplyPostId ? Object.fromEntries(initialPosts.map((post) => [post.id, true])) : {}
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const postTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const commentTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const reservedStreamImpressionRef = useRef("");
  const composerIdentity = currentAuthor ?? { displayName: "You", username: "member", avatarUrl: null };
  const visiblePosts = posts.filter((post) => {
    if (hiddenPostIds[post.id] || quietAuthorIds[post.author.id]) return false;
    if (feedMode === "friends") return post.visibility === FeedVisibility.FRIENDS;
    if (feedMode === "pictures") return Boolean(post.media?.publicUrl);
    if (feedMode === "groups") return false;
    return true;
  });

  function commentKey(postId: string, parentCommentId?: string) {
    return parentCommentId ? `${postId}:${parentCommentId}` : postId;
  }

  function focusCommentComposer(postId: string, parentCommentId?: string) {
    const key = commentKey(postId, parentCommentId);
    window.requestAnimationFrame(() => {
      const textarea = commentTextareaRefs.current[key];
      textarea?.focus();
      textarea?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  useEffect(() => {
    function openExternalComposer() {
      setComposerOpen(true);
      window.setTimeout(() => postTextareaRef.current?.focus(), 0);
    }

    window.addEventListener("theta:open-feed-composer", openExternalComposer);
    return () => window.removeEventListener("theta:open-feed-composer", openExternalComposer);
  }, []);

  useEffect(() => {
    if (initialReplyPostId) {
      const focusTimer = window.setTimeout(() => focusCommentComposer(initialReplyPostId), 80);
      return () => window.clearTimeout(focusTimer);
    }
  }, [initialReplyPostId]);

  useEffect(() => {
    const firstReservedAd = reservedStreamAds[0];

    if (!showThreadLinks || feedMode !== "latest" || visiblePosts.length <= RESERVED_STREAM_SLOT_INDEX || !firstReservedAd) return;
    if (reservedStreamImpressionRef.current === firstReservedAd.id) return;

    reservedStreamImpressionRef.current = firstReservedAd.id;
    postReservedStreamDeliveryEvent(firstReservedAd, IMPRESSION_EVENT);
  }, [feedMode, reservedStreamAds, showThreadLinks, visiblePosts.length]);

  function restoreTextSelection(textarea: HTMLTextAreaElement | null | undefined, result: TextFormatResult) {
    if (!textarea) return;
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  function formatPostText(format: TextFormat) {
    const textarea = postTextareaRef.current;
    const result = applyTextFormat(body, format, textarea?.selectionStart ?? body.length, textarea?.selectionEnd ?? body.length);
    setBody(result.value);
    restoreTextSelection(textarea, result);
  }

  function formatCommentText(key: string, format: TextFormat) {
    const value = commentBodies[key] ?? "";
    const textarea = commentTextareaRefs.current[key];
    const result = applyTextFormat(value, format, textarea?.selectionStart ?? value.length, textarea?.selectionEnd ?? value.length);
    setCommentBodies((current) => ({ ...current, [key]: result.value }));
    restoreTextSelection(textarea, result);
  }

  async function refreshFeed() {
    const response = await fetch(refreshPath, { cache: "no-store" });
    const payload = (await response.json()) as { posts?: FeedPostView[]; reservedStreamAds?: AdPlacementCardView[] };
    setPosts(payload.posts ?? []);
    setReservedStreamAds(payload.reservedStreamAds ?? []);
  }

  function currentReactionAuthor(): FeedAuthorView | null {
    if (!composerIdentity.id) return null;

    return {
      id: composerIdentity.id,
      avatarUrl: composerIdentity.avatarUrl,
      displayName: composerIdentity.displayName,
      tier: composerIdentity.tier ?? MembershipTier.FREE,
      username: composerIdentity.username
    };
  }

  function applyReactionToReactors(reactors: FeedReactionReactorsView, type: FeedReactionType) {
    const author = currentReactionAuthor();

    if (!author) return { reactors, counts: undefined };

    const nextReactors = quickReactions.reduce<FeedReactionReactorsView>((acc, reaction) => {
      const existing = reactors[reaction.type] ?? [];
      acc[reaction.type] = existing.filter((reactor) => reactor.id !== author.id);
      return acc;
    }, {});

    nextReactors[type] = [author, ...(nextReactors[type] ?? [])];

    const counts = quickReactions.reduce<Partial<Record<FeedReactionType, number>>>((acc, reaction) => {
      const count = nextReactors[reaction.type]?.length ?? 0;
      if (count > 0) acc[reaction.type] = count;
      return acc;
    }, {});

    return { reactors: nextReactors, counts };
  }

  function updateCommentReactionTree(comments: FeedCommentView[], commentId: string, type: FeedReactionType): FeedCommentView[] {
    return comments.map((comment) => {
      if (comment.id === commentId) {
        const next = applyReactionToReactors(comment.reactionReactors, type);
        return next.counts ? { ...comment, reactionReactors: next.reactors, reactions: next.counts } : comment;
      }

      return comment.replies?.length
        ? { ...comment, replies: updateCommentReactionTree(comment.replies, commentId, type) }
        : comment;
    });
  }

  function applyOptimisticPostReaction(postId: string, type: FeedReactionType) {
    setPosts((current) =>
      current.map((post) => {
        if (post.id !== postId) return post;
        const next = applyReactionToReactors(post.reactionReactors, type);
        return next.counts ? { ...post, reactionReactors: next.reactors, reactions: next.counts } : post;
      })
    );
  }

  function applyOptimisticCommentReaction(commentId: string, type: FeedReactionType) {
    setPosts((current) =>
      current.map((post) => ({
        ...post,
        comments: updateCommentReactionTree(post.comments, commentId, type)
      }))
    );
  }

  function updatePostImage(patch: Partial<FeedImageAttachment>) {
    setPostImage((current) => (current ? { ...current, ...patch } : current));
  }

  function updateCommentImage(key: string, patch: Partial<FeedImageAttachment>) {
    setCommentImages((current) => {
      const image = current[key];
      if (!image) return current;
      return { ...current, [key]: { ...image, ...patch } };
    });
  }

  function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        const mediaAssetId = postImage ? await uploadFeedImage(postImage, updatePostImage, "STREAM_POST") : "";
        const response = await fetch("/api/feed/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, visibility: FeedVisibility.MEMBERS, mediaAssetId })
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Could not create post.");
        }

        setBody("");
        setPostImage(null);
        setComposerOpen(false);
        await refreshFeed();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Could not create post.";
        setError(message);
        if (postImage) updatePostImage({ status: "error", error: message });
      }
    });
  }

  function submitComment(postId: string, event: FormEvent<HTMLFormElement>, parentCommentId?: string) {
    event.preventDefault();
    const key = commentKey(postId, parentCommentId);
    setCommentErrors((current) => ({ ...current, [key]: undefined }));

    startTransition(async () => {
      const image = commentImages[key];
      const commentBody = commentBodies[key] ?? "";

      try {
        const mediaAssetId = image ? await uploadFeedImage(image, (patch) => updateCommentImage(key, patch), "STREAM_REPLY") : "";
        const response = await fetch("/api/feed/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId, parentCommentId, body: commentBody, mediaAssetId })
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Could not add comment.");
        }

        setCommentBodies((current) => ({ ...current, [key]: "" }));
        setCommentImages((current) => ({ ...current, [key]: undefined }));
        setReplyTargets((current) => ({ ...current, [postId]: undefined }));
        setExpandedComments((current) => ({ ...current, [postId]: true }));
        await refreshFeed();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Could not add comment.";
        setCommentErrors((current) => ({ ...current, [key]: message }));
        if (image) updateCommentImage(key, { status: "error", error: message });
      }
    });
  }

  function reactToPost(postId: string, type: FeedReactionType) {
    applyOptimisticPostReaction(postId, type);
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

  function reactToComment(commentId: string, type: FeedReactionType) {
    applyOptimisticCommentReaction(commentId, type);
    startTransition(async () => {
      const response = await fetch("/api/feed/reactions/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, type })
      });

      if (response.ok) {
        await refreshFeed();
      }
    });
  }

  function appendToPost(value: string) {
    setBody((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${value}`);
  }

  function appendToComment(postId: string, value: string, parentCommentId?: string) {
    const key = commentKey(postId, parentCommentId);
    setCommentBodies((current) => {
      const next = current[key] ?? "";
      return { ...current, [key]: `${next}${next && !next.endsWith(" ") ? " " : ""}${value}` };
    });
  }

  function activateReply(postId: string, target?: FeedCommentView) {
    setReplyTargets((current) => ({
      ...current,
      [postId]: target ? { parentCommentId: target.id, label: `Replying to ${target.author.displayName}` } : { label: "Replying to post" }
    }));
    setExpandedComments((current) => ({ ...current, [postId]: true }));
    focusCommentComposer(postId, target?.id);
  }

  function hidePost(postId: string) {
    setHiddenPostIds((current) => ({ ...current, [postId]: true }));
    setTrustMessage("Post hidden from this view.");
  }

  function dismissPinnedAnnouncement(postId: string) {
    setHiddenPostIds((current) => ({ ...current, [postId]: true }));

    startTransition(async () => {
      const response = await fetch(`/api/feed/posts/${postId}/dismiss`, {
        method: "POST"
      });

      if (response.ok) {
        setTrustMessage("Announcement dismissed.");
        return;
      }

      setHiddenPostIds((current) => ({ ...current, [postId]: false }));
      setTrustMessage("That announcement could not be dismissed.");
    });
  }

  function streamShareUrl(postId: string, commentId?: string) {
    const url = new URL(`/posts/${postId}`, window.location.origin);
    if (commentId) {
      url.hash = `comment-${commentId}`;
    }
    return url.toString();
  }

  async function shareStreamUrl(postId: string, commentId?: string) {
    const url = streamShareUrl(postId, commentId);

    try {
      if (navigator.share) {
        await navigator.share({ title: "Theta-Space stream", url });
        setTrustMessage("Share opened.");
        return;
      }

      await navigator.clipboard.writeText(url);
      setTrustMessage("Stream URL copied.");
    } catch {
      setTrustMessage("Could not share that URL from this browser.");
    }
  }

  function prepareStreamEcho(post: FeedPostView) {
    setShareMenus((current) => ({ ...current, [post.id]: false }));
    setComposerOpen(true);
    setBody((current) => {
      const sourceUrl = streamShareUrl(post.id);
      const draft = `Passing this along from ${post.author.displayName}:\n\n${post.body}\n\n${sourceUrl}`;
      return current.trim() ? `${current.trim()}\n\n${draft}` : draft;
    });
    window.requestAnimationFrame(() => {
      postTextareaRef.current?.focus();
      postTextareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function applyAuthorTrustAction(post: FeedPostView, type: "MUTE" | "BLOCK") {
    if (!composerIdentity.id || post.author.id === composerIdentity.id) return;

    startTransition(async () => {
      const response = await fetch("/api/social-graph/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: post.author.id, type })
      });

      if (response.ok) {
        setQuietAuthorIds((current) => ({ ...current, [post.author.id]: true }));
        setTrustMessage(type === "BLOCK" ? `${post.author.displayName} is blocked.` : `${post.author.displayName} is muted from this view.`);
      } else {
        setTrustMessage("That trust action could not be saved.");
      }
    });
  }

  function openThread(postId: string) {
    if (!showThreadLinks) return;
    router.push(`/posts/${postId}`);
  }

  function openThreadForReply(postId: string) {
    if (!showThreadLinks) {
      activateReply(postId);
      return;
    }

    router.push(`/posts/${postId}?reply=op`);
  }

  function handlePostClick(postId: string, event: MouseEvent<HTMLElement>) {
    if (shouldIgnoreCardClick(event.target)) return;
    openThread(postId);
  }

  function handlePostKeyDown(postId: string, event: KeyboardEvent<HTMLElement>) {
    if (!showThreadLinks || shouldIgnoreCardClick(event.target)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openThread(postId);
    }
  }

  return (
    <div className="feed-stream-shell">
      <section className="feed-loop-panel surface rounded-md" aria-label="Stream controls">
        <div className="feed-loop-copy">
          <strong>Stream</strong>
          <span>Post, react, reply, and return without losing your place.</span>
        </div>
        <div className="feed-mode-tabs" role="tablist" aria-label="Stream filters">
          {feedModes.map((mode) => (
            <button
              aria-selected={feedMode === mode.key}
              className={feedMode === mode.key ? "feed-mode-tab is-active" : "feed-mode-tab"}
              key={mode.key}
              onClick={() => setFeedMode(mode.key)}
              role="tab"
              title={mode.helper}
              type="button"
            >
              {mode.label}
            </button>
          ))}
        </div>
      </section>
      {trustMessage ? (
        <p className="feed-trust-message" role="status">
          {trustMessage}
        </p>
      ) : null}
      {showComposerTrigger || composerOpen ? (
      <div className={showComposerTrigger ? "feed-communicate-wrap" : "feed-communicate-wrap is-external"}>
        {showComposerTrigger ? (
          <button className="feed-communicate-trigger" onClick={() => setComposerOpen(true)} type="button">
            <Avatar className="feed-author-avatar is-current" displayName={composerIdentity.displayName} src={composerIdentity.avatarUrl} />
            <span>Communicate</span>
          </button>
        ) : null}
        {composerOpen ? (
          <form className="feed-composer surface rounded-md" onSubmit={submitPost}>
            <div className="feed-composer-header">
              <div className="feed-author-line">
                <Link className="feed-profile-link" href={`/profile/${composerIdentity.username}`}>
                  <Avatar className="feed-author-avatar" displayName={composerIdentity.displayName} src={composerIdentity.avatarUrl} />
                </Link>
                <div>
                  <Link className="feed-author-name-link" href={`/profile/${composerIdentity.username}`}>
                    {composerIdentity.displayName}
                  </Link>
                  <Link className="feed-author-handle-link" href={`/profile/${composerIdentity.username}`}>
                    @{composerIdentity.username}
                  </Link>
                </div>
              </div>
              <button className="feed-composer-close" onClick={() => setComposerOpen(false)} type="button">
                Close
              </button>
            </div>
            <label className="grid gap-2">
              <span className="sr-only">Post to stream</span>
              <textarea
                autoFocus
                className="form-field min-h-28 resize-y"
                onChange={(event) => setBody(event.target.value)}
                placeholder="Text, picture, link, survey..."
                ref={postTextareaRef}
                value={body}
              />
            </label>
            <ComposerToolbar
              disabled={isPending}
              onEmoji={appendToPost}
              onFile={(file) => setPostImage(createImageAttachment(file))}
              onFormat={formatPostText}
              trailingAction={
                <button className="btn-primary send-logo-button" disabled={isPending || (!body.trim() && !postImage)} type="submit">
                  <span aria-hidden="true" className="send-logo-icon" />
                  <span className="sr-only">{isPending ? "Posting..." : "Post"}</span>
                </button>
              }
            />
            {postImage?.status === "uploading" ? <p className="mt-2 text-xs text-[var(--muted)]">Uploading image...</p> : null}
            {postImage ? <ImagePreview image={postImage} onRemove={() => setPostImage(null)} /> : null}
            {error ? <p className="mt-3 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          </form>
        ) : null}
      </div>
      ) : null}

      {visiblePosts.length === 0 ? (
        <section className="surface rounded-md p-6 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Nothing in this stream yet</h2>
          <p className="mt-2 text-[var(--muted)]">
            {feedModes.find((mode) => mode.key === feedMode)?.helper ?? "Create the first post, picture, or quick update."}
          </p>
        </section>
      ) : null}

      <div className="feed-entry-list">
        {visiblePosts.map((post, index) => {
          const commentsExpanded = Boolean(expandedComments[post.id]);
          const replyTarget = replyTargets[post.id];
          const activeCommentKey = commentKey(post.id, replyTarget?.parentCommentId);
          const commentImage = commentImages[activeCommentKey];
          const previewComments = showThreadLinks ? post.comments.slice(0, 2) : post.comments;
          const hiddenPreviewCount = showThreadLinks ? Math.max(0, post.comments.length - previewComments.length) : 0;
          const replyCount = post.comments.reduce((total, comment) => total + comment.replyCount, 0);
          const commentSummary = post.comments.length + replyCount;
          const reservedStreamAd = showThreadLinks && feedMode === "latest" && index === RESERVED_STREAM_SLOT_INDEX ? reservedStreamAds[0] : undefined;
          const postLevelReplyInThread = Boolean(replyTarget && !replyTarget.parentCommentId && !showThreadLinks);
          const replyComposer = replyTarget ? (
            <CommentComposer
              commentBody={commentBodies[activeCommentKey] ?? ""}
              commentError={commentErrors[activeCommentKey]}
              commentImage={commentImage}
              disabled={isPending}
              label={replyTarget.label}
              onCancel={() => setReplyTargets((current) => ({ ...current, [post.id]: undefined }))}
              onEmoji={(emoji) => appendToComment(post.id, emoji, replyTarget.parentCommentId)}
              onFile={(file) => setCommentImages((current) => ({ ...current, [activeCommentKey]: createImageAttachment(file) }))}
              onFormat={(format) => formatCommentText(activeCommentKey, format)}
              onImageRemove={() => setCommentImages((current) => ({ ...current, [activeCommentKey]: undefined }))}
              onSubmit={(event) => submitComment(post.id, event, replyTarget.parentCommentId)}
              setTextareaRef={(node) => {
                commentTextareaRefs.current[activeCommentKey] = node;
              }}
              updateBody={(value) => setCommentBodies((current) => ({ ...current, [activeCommentKey]: value }))}
            />
          ) : null;

          return (
            <Fragment key={post.id}>
            <article
              aria-label={`Open ${post.author.displayName}'s post`}
              className={`${showThreadLinks ? "feed-post surface rounded-md is-clickable" : "feed-post surface rounded-md"}${post.isAdminAnnouncement ? " is-announcement" : ""}`}
              onClick={(event) => handlePostClick(post.id, event)}
              onKeyDown={(event) => handlePostKeyDown(post.id, event)}
              role={showThreadLinks ? "link" : undefined}
              tabIndex={showThreadLinks ? 0 : undefined}
            >
              <div className="feed-post-header">
                <div className="feed-author-line">
                  <ProfileAvatarLink author={post.author} className="feed-author-avatar" />
                  <div>
                    <ProfileNameLink author={post.author} />
                    <span>{new Date(post.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="feed-post-header-actions">
                  {post.isAdminAnnouncement ? (
                    <>
                      <span className="feed-visibility-chip">pinned announcement</span>
                      <button
                        className="feed-dismiss-announcement"
                        onClick={(event) => {
                          event.stopPropagation();
                          dismissPinnedAnnouncement(post.id);
                        }}
                        type="button"
                      >
                        Dismiss
                      </button>
                    </>
                  ) : null}
                  <span className="feed-visibility-chip">{post.visibility === FeedVisibility.FRIENDS ? "friends" : "members"}</span>
                  <details className="feed-trust-menu">
                    <summary aria-label="Post options">•••</summary>
                    <div className="feed-trust-popover">
                      {showThreadLinks ? <a href={`/posts/${post.id}`}>Open discussion</a> : null}
                      <a href={`/feedback/new?from=${encodeURIComponent(`/posts/${post.id}`)}&title=${encodeURIComponent("Report stream post")}`}>Report post</a>
                      <button onClick={() => hidePost(post.id)} type="button">
                        Hide this post
                      </button>
                      {composerIdentity.id && post.author.id !== composerIdentity.id ? (
                        <>
                          <button onClick={() => applyAuthorTrustAction(post, "MUTE")} type="button">
                            Mute author
                          </button>
                          <button onClick={() => applyAuthorTrustAction(post, "BLOCK")} type="button">
                            Block author
                          </button>
                        </>
                      ) : null}
                    </div>
                  </details>
                </div>
              </div>
              <RichText value={post.body} />
              <FeedMedia media={post.media} />
              <div className="feed-post-actions">
                <ReactionButtons
                  counts={post.reactions}
                  currentUserId={composerIdentity.id}
                  onReact={(reaction) => reactToPost(post.id, reaction)}
                  reactors={post.reactionReactors}
                />
                <button
                  aria-label="Reply"
                  className="feed-reply-button"
                  onClick={() => openThreadForReply(post.id)}
                  title="Reply"
                  type="button"
                >
                  <span aria-hidden="true">{"\u21A9"}</span>
                  {commentSummary > 0 ? <span>{commentSummary}</span> : null}
                </button>
                <div className="feed-share-menu">
                  <button
                    aria-expanded={Boolean(shareMenus[post.id])}
                    aria-label="Share post"
                    className="feed-share-button"
                    onClick={() => setShareMenus((current) => ({ ...current, [post.id]: !current[post.id] }))}
                    title="Share"
                    type="button"
                  >
                    <span aria-hidden="true">{"\u2192"}</span>
                  </button>
                  {shareMenus[post.id] ? (
                    <div className="feed-share-popover" role="menu">
                      <button onClick={() => void shareStreamUrl(post.id)} role="menuitem" type="button">
                        Pass link
                      </button>
                      <button onClick={() => prepareStreamEcho(post)} role="menuitem" type="button">
                        Echo to stream
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              {postLevelReplyInThread ? replyComposer : null}
              <div className="feed-comment-preview">
                {previewComments.map((comment) => (
                  <FeedCommentRow
                    comment={comment}
                    currentUserId={composerIdentity.id}
                    defaultExpanded={defaultExpanded}
                    key={comment.id}
                    onReact={reactToComment}
                    onReply={(target) => activateReply(post.id, target)}
                    onShare={(commentId) => void shareStreamUrl(post.id, commentId)}
                  />
                ))}
                {hiddenPreviewCount > 0 ? (
                  <button
                    className="feed-thread-more"
                    onClick={() => openThread(post.id)}
                    type="button"
                  >
                    View {hiddenPreviewCount} more in full discussion
                  </button>
                ) : null}
                {replyTarget && !postLevelReplyInThread ? replyComposer : null}
              </div>
            </article>
            {reservedStreamAd ? <ReservedStreamAdCard ad={reservedStreamAd} /> : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
