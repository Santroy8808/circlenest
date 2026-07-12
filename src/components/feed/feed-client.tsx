"use client";

import { AdPlacement, FeedReactionType, FeedVisibility, MediaVisibility, MembershipTier } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useTransition } from "react";
import type { FormEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import { AdminObjectId } from "@/components/admin/admin-object-id";
import { InAppImageViewer } from "@/components/media/in-app-image-viewer";
import { ThetaLikeTriangle } from "@/components/reactions/theta-like-triangle";
import type { AdPlacementCardView } from "@/modules/ads-credits/types";
import type { FeedCursor } from "@/modules/feed-stream/feed-pagination";
import type { FeedAuthorView, FeedCommentView, FeedPostView, FeedReactionReactorsView } from "@/modules/feed-stream/types";

type FeedImageAttachment = {
  file: File;
  previewUrl: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

type FeedImageSource = "STREAM_POST" | "STREAM_REPLY";

type DurableUploadIntentResponse = {
  error?: string;
  intentId?: string;
  uploadUrl?: string;
  uploadHeaders?: Record<string, string>;
  storageKey?: string;
};

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

type FeedCachePayload = {
  error?: string;
  hasMore?: boolean;
  items?: FeedPostView[];
  nextCursor?: FeedCursor | null;
  posts?: FeedPostView[];
  reservedStreamAds?: AdPlacementCardView[];
};

type ComposerFormatState = Partial<Record<Exclude<TextFormat, "link">, boolean>>;

type FeedRichTextHandle = {
  focus: () => void;
  format: (format: TextFormat) => void;
  scrollIntoView: () => void;
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
  { type: FeedReactionType.WOW, icon: "\u{1F62E}", label: "Wow" },
  { type: FeedReactionType.SAD, icon: "\u{1F622}", label: "Sad" },
  { type: FeedReactionType.ANGRY, icon: "\u{1F621}", label: "Angry" },
  { type: FeedReactionType.DISLIKE, icon: "\u{1F44E}", label: "Dislike privately" }
] satisfies QuickReaction[];
const publicQuickReactions = quickReactions.filter((reaction) => reaction.type !== FeedReactionType.DISLIKE);

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
const FEED_THUMBNAIL_MAX_EDGE = 420;

function mergeUniquePosts(current: FeedPostView[], incoming: FeedPostView[]) {
  const seen = new Set(current.map((post) => post.id));
  return [
    ...current,
    ...incoming.filter((post) => {
      if (seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    })
  ];
}

function readFeedCache(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return JSON.parse(window.sessionStorage.getItem(key) ?? "null") as FeedCachePayload | null;
  } catch {
    return null;
  }
}

function reactionMeta(type: FeedReactionType) {
  return quickReactions.find((reaction) => reaction.type === type) ?? quickReactions[0];
}

function ReactionIcon({ reaction }: { reaction: QuickReaction }) {
  if (reaction.type === FeedReactionType.LIKE) {
    return <ThetaLikeTriangle />;
  }

  return <span aria-hidden="true">{reaction.icon}</span>;
}

function reactionTooltip(reaction: QuickReaction) {
  return reaction.type === FeedReactionType.LIKE ? "Like it!" : reaction.label;
}

function createImageAttachment(file: File): FeedImageAttachment {
  return {
    file,
    previewUrl: URL.createObjectURL(file),
    progress: 0,
    status: "queued"
  };
}

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not create image thumbnail."));
    image.src = url;
  });
}

async function createFeedThumbnail(file: File) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return null;

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageElement(objectUrl);
    const scale = Math.min(1, FEED_THUMBNAIL_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
    if (!blob) return null;

    const fileName = file.name.replace(/\.[^.]+$/, "") || "stream-image";
    return new File([blob], `${fileName}-thumb.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function uploadFeedImage(image: FeedImageAttachment, onUpdate: (patch: Partial<FeedImageAttachment>) => void, source: FeedImageSource) {
  onUpdate({ status: "uploading", progress: 1, error: undefined });
  let thumbnailIntentId: string | undefined;
  let thumbnailStorageKey: string | undefined;

  const intentResponse = await fetch("/api/media/upload-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: image.file.name,
      mimeType: image.file.type || "application/octet-stream",
      sizeBytes: image.file.size,
      visibility: MediaVisibility.PRIVATE,
      source
    })
  });
  const intent = (await intentResponse.json()) as DurableUploadIntentResponse;

  if (!intentResponse.ok || !intent.intentId || !intent.uploadUrl || !intent.uploadHeaders || !intent.storageKey) {
    throw new Error(intent.error ?? "Could not prepare image upload.");
  }

  await uploadWithResilientFallback({
    uploadUrl: intent.uploadUrl,
    storageKey: intent.storageKey,
    uploadHeaders: intent.uploadHeaders,
    file: image.file,
    onProgress: (progress) => onUpdate({ progress })
  });

  try {
    const thumbnailFile = await createFeedThumbnail(image.file);

    if (thumbnailFile) {
      onUpdate({ progress: 96 });
      const thumbnailIntentResponse = await fetch("/api/media/upload-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: thumbnailFile.name,
          mimeType: thumbnailFile.type,
          sizeBytes: thumbnailFile.size,
          visibility: MediaVisibility.PRIVATE,
          source
        })
      });
      const thumbnailIntent = (await thumbnailIntentResponse.json()) as DurableUploadIntentResponse;

      if (
        thumbnailIntentResponse.ok &&
        thumbnailIntent.intentId &&
        thumbnailIntent.uploadUrl &&
        thumbnailIntent.uploadHeaders &&
        thumbnailIntent.storageKey
      ) {
        await uploadWithResilientFallback({
          uploadUrl: thumbnailIntent.uploadUrl,
          storageKey: thumbnailIntent.storageKey,
          uploadHeaders: thumbnailIntent.uploadHeaders,
          file: thumbnailFile,
          onProgress: () => onUpdate({ progress: 98 })
        });
        thumbnailIntentId = thumbnailIntent.intentId;
        thumbnailStorageKey = thumbnailIntent.storageKey;
      }
    }
  } catch {
    thumbnailIntentId = undefined;
    thumbnailStorageKey = undefined;
  }

  const completeResponse = await fetch("/api/media/complete-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intentId: intent.intentId,
      storageKey: intent.storageKey,
      thumbnailIntentId,
      thumbnailStorageKey,
      fileName: image.file.name,
      mimeType: image.file.type || "application/octet-stream",
      sizeBytes: image.file.size,
      visibility: MediaVisibility.PRIVATE,
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownInlineToHtml(value: string) {
  let html = escapeHtml(value);
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text: string, href: string) => {
    const safeHref = safeRichTextHref(href);
    return `<a href="${escapeHtml(safeHref)}">${text}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
  return html || "<br>";
}

function markdownToEditorHtml(value: string) {
  if (!value.trim()) return "";

  return value
    .split("\n")
    .map((line) => {
      const bullet = line.match(/^-\s+(.+)$/);
      if (bullet) return `<ul><li>${markdownInlineToHtml(bullet[1])}</li></ul>`;
      const numbered = line.match(/^(\d+)\.\s+(.+)$/);
      if (numbered) return `<ol><li>${markdownInlineToHtml(numbered[2])}</li></ol>`;
      return `<div>${markdownInlineToHtml(line)}</div>`;
    })
    .join("");
}

function nodeChildrenToMarkdown(node: Node) {
  return Array.from(node.childNodes).map(nodeToMarkdown).join("");
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";

  const tag = node.tagName.toLowerCase();

  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return `**${nodeChildrenToMarkdown(node)}**`;
  if (tag === "em" || tag === "i") return `_${nodeChildrenToMarkdown(node)}_`;
  if (tag === "a") {
    const text = nodeChildrenToMarkdown(node);
    const href = safeRichTextHref(node.getAttribute("href") ?? "");
    return href === "#" ? text : `[${text}](${href})`;
  }
  if (tag === "ul") {
    return Array.from(node.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child) => `- ${nodeChildrenToMarkdown(child).trim()}`)
      .join("\n");
  }
  if (tag === "ol") {
    return Array.from(node.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child, index) => `${index + 1}. ${nodeChildrenToMarkdown(child).trim()}`)
      .join("\n");
  }
  if (tag === "div" || tag === "p") return nodeChildrenToMarkdown(node);
  return nodeChildrenToMarkdown(node);
}

function editorElementToMarkdown(element: HTMLElement) {
  return Array.from(element.childNodes)
    .map(nodeToMarkdown)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

  const fullImageUrl = media.publicUrl;
  const cardImageUrl = media.thumbnailUrl ?? fullImageUrl;

  return (
    <InAppImageViewer alt={media.originalName ?? "Attached stream image"} className="feed-media-card" src={fullImageUrl}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={media.originalName ?? "Attached stream image"}
        decoding="async"
        loading="lazy"
        onError={(event) => {
          if (event.currentTarget.dataset.fullMediaFallbackApplied === "true") return;
          event.currentTarget.dataset.fullMediaFallbackApplied = "true";
          event.currentTarget.src = fullImageUrl;
        }}
        src={cardImageUrl}
      />
    </InAppImageViewer>
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
  reactors = {},
  showCounts = true
}: {
  counts: Partial<Record<FeedReactionType, number>>;
  compact?: boolean;
  currentUserId?: string;
  onReact: (type: FeedReactionType) => void;
  reactors?: FeedReactionReactorsView;
  showCounts?: boolean;
}) {
  const visibleReactionCounts = publicQuickReactions.filter((reaction) => (counts[reaction.type] ?? 0) > 0);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [detailsType, setDetailsType] = useState<FeedReactionType | "ALL" | null>(null);
  const myReactionType = currentUserId
    ? publicQuickReactions.find((reaction) => reactors[reaction.type]?.some((reactor) => reactor.id === currentUserId))?.type
    : undefined;
  const topReactionType =
    myReactionType ??
    publicQuickReactions.reduce<FeedReactionType>((current, reaction) => {
      return (counts[reaction.type] ?? 0) > (counts[current] ?? 0) ? reaction.type : current;
    }, publicQuickReactions[0].type);
  const triggerReaction = reactionMeta(topReactionType);
  const detailReactors =
    detailsType === "ALL"
      ? publicQuickReactions.flatMap((reaction) => (reactors[reaction.type] ?? []).map((reactor) => ({ reaction, reactor })))
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
      {showCounts ? (
        <div className="feed-reaction-counts" aria-label="Reaction counts">
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
        </div>
      ) : null}
      <div className="feed-reaction-control">
        <button
          aria-expanded={choicesOpen}
          aria-label="React"
          className={myReactionType ? "feed-reaction-trigger has-user-reaction" : "feed-reaction-trigger"}
          data-tooltip={reactionTooltip(triggerReaction)}
          onClick={() => setChoicesOpen((open) => !open)}
          type="button"
        >
          <ReactionIcon reaction={triggerReaction} />
        </button>
        <div className="feed-reaction-popover" role="menu" aria-label="Reaction options">
          {quickReactions.map((reaction) => (
            <button
              aria-label={reactionTooltip(reaction)}
              className={myReactionType === reaction.type ? "feed-reaction-choice is-selected" : "feed-reaction-choice"}
              key={reaction.type}
              onClick={() => chooseReaction(reaction.type)}
              role="menuitem"
              title={reactionTooltip(reaction)}
              type="button"
            >
              <ReactionIcon reaction={reaction} />
            </button>
          ))}
        </div>
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

const FeedRichTextInput = forwardRef<
  FeedRichTextHandle,
  {
    ariaLabel: string;
    autoFocus?: boolean;
    className?: string;
    onChange: (value: string) => void;
    onFormatStateChange?: (state: ComposerFormatState) => void;
    placeholder: string;
    value: string;
  }
>(function FeedRichTextInput({ ariaLabel, autoFocus, className, onChange, onFormatStateChange, placeholder, value }, ref) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastMarkdownRef = useRef(value);

  const emitFormatState = useCallback(() => {
    const editor = editorRef.current;
    const selection = document.getSelection();
    const anchor = selection?.anchorNode;

    if (!editor || !anchor || !editor.contains(anchor)) return;

    onFormatStateChange?.({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      bulletList: document.queryCommandState("insertUnorderedList"),
      numberedList: document.queryCommandState("insertOrderedList")
    });
  }, [onFormatStateChange]);

  const emitChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const markdown = editorElementToMarkdown(editor);
    lastMarkdownRef.current = markdown;
    onChange(markdown);
    emitFormatState();
  }, [emitFormatState, onChange]);

  const runCommand = useCallback((command: string, value?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value);
    emitChange();
  }, [emitChange]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editorRef.current?.focus(),
      format: (format) => {
        if (format === "bold") runCommand("bold");
        if (format === "italic") runCommand("italic");
        if (format === "bulletList") runCommand("insertUnorderedList");
        if (format === "numberedList") runCommand("insertOrderedList");
        if (format === "link") {
          const href = window.prompt("Paste the link URL");
          if (!href || safeRichTextHref(href) === "#") return;
          runCommand("createLink", href);
        }
      },
      scrollIntoView: () => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    }),
    [runCommand]
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === lastMarkdownRef.current) return;
    lastMarkdownRef.current = value;
    editor.innerHTML = markdownToEditorHtml(value);
  }, [value]);

  useEffect(() => {
    document.addEventListener("selectionchange", emitFormatState);
    return () => document.removeEventListener("selectionchange", emitFormatState);
  }, [emitFormatState]);

  useEffect(() => {
    if (autoFocus) window.setTimeout(() => editorRef.current?.focus(), 0);
  }, [autoFocus]);

  return (
    <div
      aria-label={ariaLabel}
      className={["form-field feed-rich-composer-input", className].filter(Boolean).join(" ")}
      contentEditable
      data-placeholder={placeholder}
      onBlur={emitChange}
      onInput={emitChange}
      onKeyUp={emitFormatState}
      onMouseUp={emitFormatState}
      ref={editorRef}
      role="textbox"
      suppressContentEditableWarning
    />
  );
});

function ComposerToolbar({
  activeFormats,
  compact = false,
  disabled,
  onEmoji,
  onFile,
  onFormat,
  trailingAction
}: {
  activeFormats?: ComposerFormatState;
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
        <button aria-pressed={Boolean(activeFormats?.bold)} className={activeFormats?.bold ? "is-active" : undefined} disabled={disabled} onClick={() => onFormat("bold")} onMouseDown={(event) => event.preventDefault()} type="button">
          B
        </button>
        <button aria-pressed={Boolean(activeFormats?.italic)} className={activeFormats?.italic ? "is-active" : undefined} disabled={disabled} onClick={() => onFormat("italic")} onMouseDown={(event) => event.preventDefault()} type="button">
          I
        </button>
        <button aria-pressed={Boolean(activeFormats?.bulletList)} className={activeFormats?.bulletList ? "is-active" : undefined} disabled={disabled} onClick={() => onFormat("bulletList")} onMouseDown={(event) => event.preventDefault()} type="button">
          Bullets
        </button>
        <button aria-pressed={Boolean(activeFormats?.numberedList)} className={activeFormats?.numberedList ? "is-active" : undefined} disabled={disabled} onClick={() => onFormat("numberedList")} onMouseDown={(event) => event.preventDefault()} type="button">
          Numbers
        </button>
        <button disabled={disabled} onClick={() => onFormat("link")} onMouseDown={(event) => event.preventDefault()} type="button">
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
  activeFormats,
  commentBody,
  commentError,
  commentImage,
  disabled,
  label,
  onCancel,
  onEmoji,
  onFile,
  onFormat,
  onFormatStateChange,
  onImageRemove,
  onSubmit,
  setEditorRef,
  updateBody
}: {
  activeFormats?: ComposerFormatState;
  commentBody: string;
  commentError?: string;
  commentImage?: FeedImageAttachment;
  disabled: boolean;
  label: string;
  onCancel: () => void;
  onEmoji: (emoji: string) => void;
  onFile: (file: File) => void;
  onFormat: (format: TextFormat) => void;
  onFormatStateChange: (state: ComposerFormatState) => void;
  onImageRemove: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setEditorRef: (node: FeedRichTextHandle | null) => void;
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
      <FeedRichTextInput
        ariaLabel="Reply text"
        className="min-h-16"
        onChange={updateBody}
        onFormatStateChange={onFormatStateChange}
        placeholder="Quick reply..."
        ref={setEditorRef}
        value={commentBody}
      />
      {commentImage ? <ImagePreview image={commentImage} onRemove={onImageRemove} /> : null}
      <ComposerToolbar
        activeFormats={activeFormats}
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
  isAdmin = false,
  onReact,
  onReply,
  onShare
}: {
  comment: FeedCommentView;
  currentUserId?: string;
  depth?: number;
  defaultExpanded?: boolean;
  isAdmin?: boolean;
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
            <AdminObjectId id={comment.id} kind="Comment" visible={isAdmin} />
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
              <button className="comment-reply-link comment-collapse-link" onClick={() => setExpanded((value) => !value)} type="button">
                {expanded ? "Collapse" : `Expand ${loadedReplies.length}`}
              </button>
            ) : null}
            <button aria-label="Reply to comment" className="comment-reply-link comment-reply-icon-link" onClick={() => onReply(comment)} title="Reply" type="button">
              <span aria-hidden="true">{"\u21A9"}</span>
            </button>
            <button aria-label="Share comment" className="comment-share-link comment-share-icon-link" onClick={() => onShare(comment.id)} title="Share" type="button">
              <span aria-hidden="true">{"\u21AA"}</span>
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
              isAdmin={isAdmin}
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
  initialHasMore,
  initialNextCursor,
  initialReplyPostId,
  initialPosts,
  initialReservedStreamAds = [],
  isAdmin = false,
  postTargetProfileUserId,
  refreshPath = "/api/feed/posts",
  showComposerTrigger = true,
  showThreadLinks = true
}: {
  currentAuthor?: FeedCurrentAuthor;
  defaultExpanded?: boolean;
  initialHasMore?: boolean;
  initialNextCursor?: FeedCursor | null;
  initialReplyPostId?: string;
  initialPosts: FeedPostView[];
  initialReservedStreamAds?: AdPlacementCardView[];
  isAdmin?: boolean;
  postTargetProfileUserId?: string;
  refreshPath?: string;
  showComposerTrigger?: boolean;
  showThreadLinks?: boolean;
}) {
  const router = useRouter();
  const feedCacheKey = `theta-space.feed-cache:${refreshPath}`;
  const [initialFeedCache] = useState(() => readFeedCache(feedCacheKey));
  const [posts, setPosts] = useState<FeedPostView[]>(() => {
    return initialFeedCache?.posts?.length ? initialFeedCache.posts : initialPosts;
  });
  const [reservedStreamAds, setReservedStreamAds] = useState<AdPlacementCardView[]>(() => {
    return initialFeedCache?.reservedStreamAds ?? initialReservedStreamAds;
  });
  const usedCachedPosts = Boolean(initialFeedCache?.posts?.length);
  const [nextCursor, setNextCursor] = useState<FeedCursor | null>(() =>
    usedCachedPosts ? initialFeedCache?.nextCursor ?? null : initialNextCursor ?? null
  );
  const [hasMore, setHasMore] = useState(() =>
    usedCachedPosts
      ? Boolean(initialFeedCache?.hasMore && initialFeedCache.nextCursor)
      : Boolean(initialHasMore && initialNextCursor)
  );
  const [paginationReady, setPaginationReady] = useState(() =>
    usedCachedPosts
      ? Boolean(initialFeedCache && ("hasMore" in initialFeedCache || "nextCursor" in initialFeedCache))
      : initialHasMore !== undefined
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [feedMode, setFeedMode] = useState<FeedMode>("latest");
  const [body, setBody] = useState("");
  const [postFormatState, setPostFormatState] = useState<ComposerFormatState>({});
  const [composerOpen, setComposerOpen] = useState(false);
  const [postImage, setPostImage] = useState<FeedImageAttachment | null>(null);
  const [commentBodies, setCommentBodies] = useState<Record<string, string>>({});
  const [commentFormatStates, setCommentFormatStates] = useState<Record<string, ComposerFormatState>>({});
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
  const postEditorRef = useRef<FeedRichTextHandle | null>(null);
  const commentEditorRefs = useRef<Record<string, FeedRichTextHandle | null>>({});
  const reservedStreamImpressionRef = useRef("");
  const pullStartYRef = useRef<number | null>(null);
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

  const focusCommentComposer = useCallback((postId: string, parentCommentId?: string) => {
    const key = parentCommentId ? `${postId}:${parentCommentId}` : postId;
    window.requestAnimationFrame(() => {
      const editor = commentEditorRefs.current[key];
      editor?.focus();
      editor?.scrollIntoView();
    });
  }, []);

  const refreshFeed = useCallback(async () => {
    const response = await fetch(refreshPath, { cache: "no-store" });
    const payload = (await response.json()) as FeedCachePayload;
    if (!response.ok) throw new Error(payload.error ?? "Could not refresh the stream.");

    if (payload.posts) setPosts(payload.posts);
    if (payload.reservedStreamAds) setReservedStreamAds(payload.reservedStreamAds);
    setNextCursor(payload.nextCursor ?? null);
    setHasMore(Boolean(payload.hasMore && payload.nextCursor));
    setPaginationReady(true);
    setLoadMoreError("");
  }, [refreshPath]);

  async function loadMorePosts() {
    if (!nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    setLoadMoreError("");

    try {
      const url = new URL(refreshPath, window.location.origin);
      url.searchParams.set("cursorCreatedAt", nextCursor.createdAt);
      url.searchParams.set("cursorId", nextCursor.id);
      url.searchParams.set("limit", "20");
      const response = await fetch(`${url.pathname}${url.search}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as FeedCachePayload;

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load more posts.");
      }

      const incoming = payload.items ?? payload.posts ?? [];
      setPosts((current) => mergeUniquePosts(current, incoming));
      setNextCursor(payload.nextCursor ?? null);
      setHasMore(Boolean(payload.hasMore && payload.nextCursor && incoming.length > 0));
      setPaginationReady(true);
    } catch (caught) {
      setLoadMoreError(caught instanceof Error ? caught.message : "Could not load more posts.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        feedCacheKey,
        JSON.stringify({
          posts,
          reservedStreamAds,
          ...(paginationReady ? { hasMore, nextCursor } : {})
        })
      );
    } catch {
    }
  }, [feedCacheKey, hasMore, nextCursor, paginationReady, posts, reservedStreamAds]);

  useEffect(() => {
    void refreshFeed().catch(() => undefined);
  }, [refreshFeed]);

  useEffect(() => {
    function openExternalComposer() {
      setComposerOpen(true);
      window.setTimeout(() => postEditorRef.current?.focus(), 0);
    }

    window.addEventListener("theta:open-feed-composer", openExternalComposer);
    return () => window.removeEventListener("theta:open-feed-composer", openExternalComposer);
  }, []);

  useEffect(() => {
    if (initialReplyPostId) {
      const focusTimer = window.setTimeout(() => focusCommentComposer(initialReplyPostId), 80);
      return () => window.clearTimeout(focusTimer);
    }
  }, [focusCommentComposer, initialReplyPostId]);

  useEffect(() => {
    function startPull(event: TouchEvent) {
      if (window.scrollY <= 0) pullStartYRef.current = event.touches[0]?.clientY ?? null;
    }

    function finishPull(event: TouchEvent) {
      const startY = pullStartYRef.current;
      pullStartYRef.current = null;
      if (startY == null || window.scrollY > 0) return;
      const endY = event.changedTouches[0]?.clientY ?? startY;
      if (endY - startY > 86) void refreshFeed().catch(() => undefined);
    }

    window.addEventListener("touchstart", startPull, { passive: true });
    window.addEventListener("touchend", finishPull, { passive: true });
    return () => {
      window.removeEventListener("touchstart", startPull);
      window.removeEventListener("touchend", finishPull);
    };
  }, [refreshFeed]);

  useEffect(() => {
    const firstReservedAd = reservedStreamAds[0];

    if (!showThreadLinks || feedMode !== "latest" || visiblePosts.length <= RESERVED_STREAM_SLOT_INDEX || !firstReservedAd) return;
    if (reservedStreamImpressionRef.current === firstReservedAd.id) return;

    reservedStreamImpressionRef.current = firstReservedAd.id;
    postReservedStreamDeliveryEvent(firstReservedAd, IMPRESSION_EVENT);
  }, [feedMode, reservedStreamAds, showThreadLinks, visiblePosts.length]);

  function formatPostText(format: TextFormat) {
    postEditorRef.current?.format(format);
  }

  function formatCommentText(key: string, format: TextFormat) {
    commentEditorRefs.current[key]?.format(format);
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

    const removeCurrentReaction = (reactors[type] ?? []).some((reactor) => reactor.id === author.id);
    const nextReactors = publicQuickReactions.reduce<FeedReactionReactorsView>((acc, reaction) => {
      const existing = reactors[reaction.type] ?? [];
      acc[reaction.type] = existing.filter((reactor) => reactor.id !== author.id);
      return acc;
    }, {});

    if (type !== FeedReactionType.DISLIKE && !removeCurrentReaction) {
      nextReactors[type] = [author, ...(nextReactors[type] ?? [])];
    }

    const counts = publicQuickReactions.reduce<Partial<Record<FeedReactionType, number>>>((acc, reaction) => {
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
          body: JSON.stringify({ body, visibility: FeedVisibility.MEMBERS, mediaAssetId, targetProfileUserId: postTargetProfileUserId })
        });
        const payload = (await response.json()) as { error?: string; post?: FeedPostView | null };

        if (!response.ok || !payload.post) {
          throw new Error(payload.error ?? "Could not create post.");
        }

        setPosts((current) => [payload.post!, ...current.filter((post) => post.id !== payload.post!.id)]);
        setBody("");
        setPostImage(null);
        setComposerOpen(false);
        void refreshFeed().catch(() => undefined);
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
        const payload = (await response.json()) as { error?: string; post?: FeedPostView | null };

        if (!response.ok || !payload.post) {
          throw new Error(payload.error ?? "Could not add comment.");
        }

        setPosts((current) => current.map((post) => (post.id === payload.post!.id ? payload.post! : post)));
        setCommentBodies((current) => ({ ...current, [key]: "" }));
        setCommentImages((current) => ({ ...current, [key]: undefined }));
        setReplyTargets((current) => ({ ...current, [postId]: undefined }));
        setExpandedComments((current) => ({ ...current, [postId]: true }));
        void refreshFeed().catch(() => undefined);
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
    void fetch("/api/feed/signals/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId }),
      keepalive: true
    });

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
      postEditorRef.current?.focus();
      postEditorRef.current?.scrollIntoView();
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
              <FeedRichTextInput
                ariaLabel="Post to stream"
                autoFocus
                className="min-h-28"
                onChange={setBody}
                onFormatStateChange={setPostFormatState}
                placeholder="Text, picture, link, survey..."
                ref={postEditorRef}
                value={body}
              />
            </label>
            <ComposerToolbar
              activeFormats={postFormatState}
              disabled={isPending}
              onEmoji={appendToPost}
              onFile={(file) => setPostImage(createImageAttachment(file))}
              onFormat={formatPostText}
              trailingAction={
                <button className="btn-primary send-logo-button" data-tooltip="Send Post" disabled={isPending || (!body.trim() && !postImage)} type="submit">
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

      <div className="feed-entry-list" id="feed-entry-list">
        {visiblePosts.map((post, index) => {
          const commentsExpanded = Boolean(expandedComments[post.id]);
          const replyTarget = replyTargets[post.id];
          const activeCommentKey = commentKey(post.id, replyTarget?.parentCommentId);
          const commentImage = commentImages[activeCommentKey];
          const previewComments = showThreadLinks ? post.comments.slice(0, 2) : post.comments;
          const hiddenPreviewCount = showThreadLinks ? Math.max(0, post.comments.length - previewComments.length) : 0;
          const replyCount = post.comments.reduce((total, comment) => total + comment.replyCount, 0);
          const commentSummary = post.comments.length + replyCount;
          const visibleReactionCounts = publicQuickReactions.filter((reaction) => (post.reactions[reaction.type] ?? 0) > 0);
          const commentSummaryLabel = `${commentSummary} ${commentSummary === 1 ? "comment" : "comments"}`;
          const reservedStreamAd = showThreadLinks && feedMode === "latest" && index === RESERVED_STREAM_SLOT_INDEX ? reservedStreamAds[0] : undefined;
          const postLevelReplyInThread = Boolean(replyTarget && !replyTarget.parentCommentId && !showThreadLinks);
          const hasImageMedia = Boolean(post.media?.publicUrl && post.media.mimeType.startsWith("image/"));
          const isLongBody =
            showThreadLinks &&
            (post.body.length > (hasImageMedia ? 170 : 540) || post.body.split("\n").length > (hasImageMedia ? 3 : 8));
          const streamCardClass = showThreadLinks ? ` is-stream-card ${hasImageMedia ? "has-media" : "is-text-only"}` : "";
          const replyComposer = replyTarget ? (
            <CommentComposer
              activeFormats={commentFormatStates[activeCommentKey]}
              commentBody={commentBodies[activeCommentKey] ?? ""}
              commentError={commentErrors[activeCommentKey]}
              commentImage={commentImage}
              disabled={isPending}
              label={replyTarget.label}
              onCancel={() => setReplyTargets((current) => ({ ...current, [post.id]: undefined }))}
              onEmoji={(emoji) => appendToComment(post.id, emoji, replyTarget.parentCommentId)}
              onFile={(file) => setCommentImages((current) => ({ ...current, [activeCommentKey]: createImageAttachment(file) }))}
              onFormat={(format) => formatCommentText(activeCommentKey, format)}
              onFormatStateChange={(state) => setCommentFormatStates((current) => ({ ...current, [activeCommentKey]: state }))}
              onImageRemove={() => setCommentImages((current) => ({ ...current, [activeCommentKey]: undefined }))}
              onSubmit={(event) => submitComment(post.id, event, replyTarget.parentCommentId)}
              setEditorRef={(node) => {
                if (node) {
                  commentEditorRefs.current[activeCommentKey] = node;
                } else {
                  delete commentEditorRefs.current[activeCommentKey];
                }
              }}
              updateBody={(value) => setCommentBodies((current) => ({ ...current, [activeCommentKey]: value }))}
            />
          ) : null;

          return (
            <Fragment key={post.id}>
            <article
              aria-label={`Open ${post.author.displayName}'s post`}
              className={`${showThreadLinks ? "feed-post surface rounded-md is-clickable" : "feed-post surface rounded-md"}${streamCardClass}${post.isAdminAnnouncement ? " is-announcement" : ""}`}
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
                    <AdminObjectId id={post.id} kind="Post" visible={isAdmin} />
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
                  <span
                    className="feed-visibility-chip"
                    data-tooltip={post.visibility === FeedVisibility.FRIENDS ? "Visible to friends." : "Visible to Theta-Space members."}
                    title={post.visibility === FeedVisibility.FRIENDS ? "Visible to friends." : "Visible to Theta-Space members."}
                  >
                    {post.visibility === FeedVisibility.FRIENDS ? "friends" : "members"}
                  </span>
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
              <div className="feed-post-body-preview">
                <RichText value={post.body} />
              </div>
              {isLongBody ? (
                <button className="feed-read-more-button" onClick={() => openThread(post.id)} type="button">
                  Read more
                </button>
              ) : null}
              <FeedMedia media={post.media} />
              <div className="feed-engagement-summary" aria-label="Post engagement">
                <div className="feed-engagement-reactions" aria-label="Reaction summary">
                  {visibleReactionCounts.length > 0 ? (
                    visibleReactionCounts.map((reaction) => (
                      <span className="feed-engagement-reaction-chip" key={reaction.type} title={`${reaction.label}: ${post.reactions[reaction.type]}`}>
                        <ReactionIcon reaction={reaction} />
                        <span>{post.reactions[reaction.type]}</span>
                      </span>
                    ))
                  ) : (
                    <span className="feed-engagement-empty" aria-hidden="true" />
                  )}
                </div>
                {showThreadLinks ? (
                  <Link className="feed-engagement-comment-count" href={`/posts/${post.id}`}>
                    {commentSummaryLabel}
                  </Link>
                ) : (
                  <button className="feed-engagement-comment-count" onClick={() => openThread(post.id)} type="button">
                    {commentSummaryLabel}
                  </button>
                )}
              </div>
              <div className="feed-post-actions">
                <ReactionButtons
                  counts={post.reactions}
                  currentUserId={composerIdentity.id}
                  onReact={(reaction) => reactToPost(post.id, reaction)}
                  reactors={post.reactionReactors}
                  showCounts={false}
                />
                {showThreadLinks ? (
                  <Link aria-label="Comment" className="feed-reply-button" href={`/posts/${post.id}?reply=op`} title="Comment">
                    <span aria-hidden="true">{"\uD83D\uDDE8\uFE0E"}</span>
                    {commentSummary > 0 ? <span>{commentSummary}</span> : null}
                  </Link>
                ) : (
                  <button
                    aria-label="Comment"
                    className="feed-reply-button"
                    onClick={() => activateReply(post.id)}
                    title="Comment"
                    type="button"
                  >
                    <span aria-hidden="true">{"\uD83D\uDDE8\uFE0E"}</span>
                    {commentSummary > 0 ? <span>{commentSummary}</span> : null}
                  </button>
                )}
                <div className="feed-share-menu">
                  <button
                    aria-expanded={Boolean(shareMenus[post.id])}
                    aria-label="Share post"
                    className="feed-share-button"
                    onClick={() => setShareMenus((current) => ({ ...current, [post.id]: !current[post.id] }))}
                    title="Share"
                    type="button"
                  >
                    <span aria-hidden="true">{"\u2934"}</span>
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
                    isAdmin={isAdmin}
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
      {showThreadLinks && paginationReady && posts.length > 0 ? (
        <section
          aria-busy={isLoadingMore}
          aria-label="Stream pagination"
          className="surface mt-4 rounded-md p-4 text-center"
        >
          {loadMoreError ? (
            <p className="mb-3 text-sm text-red-100" id="feed-load-more-error" role="alert">
              {loadMoreError}
            </p>
          ) : null}
          {hasMore && nextCursor ? (
            <button
              aria-controls="feed-entry-list"
              aria-describedby={loadMoreError ? "feed-load-more-error" : undefined}
              className="btn-secondary"
              disabled={isLoadingMore}
              onClick={() => void loadMorePosts()}
              type="button"
            >
              {isLoadingMore ? "Loading more posts..." : loadMoreError ? "Try loading more" : "Load more posts"}
            </button>
          ) : (
            <p className="text-sm text-[var(--muted)]" role="status">
              You have reached the end of this stream.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
