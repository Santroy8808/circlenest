"use client";

import { FeedReactionType, MediaVisibility } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { ActionGlyph } from "@/components/reactions/action-glyph";
import { ThetaLikeTriangle } from "@/components/reactions/theta-like-triangle";
import type {
  GalleryAssetCommentView,
  GalleryAssetView,
  GalleryReactionReactorsView,
  GalleryReactionUserView
} from "@/modules/gallery-media-storage/types";

type GalleryAccess = "PRIVATE" | "MEMBERS_NO_COMMENTS" | "MEMBERS_COMMENTS" | "PUBLIC_NO_COMMENTS" | "PUBLIC_COMMENTS";

type GalleryReactionState = {
  counts: Partial<Record<FeedReactionType, number>>;
  reactors: GalleryReactionReactorsView;
};

type GalleryReactionChoice = {
  type: FeedReactionType;
  icon: string;
  label: string;
};

const galleryReactionChoices = [
  { type: FeedReactionType.LIKE, icon: "", label: "Like" },
  { type: FeedReactionType.LOVE, icon: "\u{2764}\u{FE0F}", label: "Love" },
  { type: FeedReactionType.CARE, icon: "\u{1F917}", label: "Care" },
  { type: FeedReactionType.HAHA, icon: "\u{1F602}", label: "Haha" },
  { type: FeedReactionType.WOW, icon: "\u{1F62E}", label: "Wow" },
  { type: FeedReactionType.SAD, icon: "\u{1F622}", label: "Sad" },
  { type: FeedReactionType.ANGRY, icon: "\u{1F621}", label: "Angry" },
  { type: FeedReactionType.DISLIKE, icon: "\u{1F44E}", label: "Dislike privately" }
] satisfies GalleryReactionChoice[];

const publicGalleryReactionChoices = galleryReactionChoices.filter((reaction) => reaction.type !== FeedReactionType.DISLIKE);

function GalleryReactionIcon({ reaction }: { reaction: GalleryReactionChoice }) {
  if (reaction.type === FeedReactionType.LIKE) {
    return <ThetaLikeTriangle />;
  }

  return <span aria-hidden="true">{reaction.icon}</span>;
}

function reactionTooltip(reaction: GalleryReactionChoice) {
  return reaction.type === FeedReactionType.LIKE ? "Like it!" : reaction.label;
}

function currentReaction(reactors: GalleryReactionReactorsView, currentUserId: string) {
  return publicGalleryReactionChoices.find((reaction) => reactors[reaction.type]?.some((user) => user.id === currentUserId))?.type ?? null;
}

function nextReactionState(
  state: GalleryReactionState,
  reactionType: FeedReactionType,
  currentUser: GalleryReactionUserView
): GalleryReactionState {
  const selectedType = currentReaction(state.reactors, currentUser.id);
  const reactors: GalleryReactionReactorsView = {};

  publicGalleryReactionChoices.forEach((reaction) => {
    const reactionUsers = state.reactors[reaction.type]?.filter((user) => user.id !== currentUser.id) ?? [];
    if (reactionUsers.length > 0) {
      reactors[reaction.type] = reactionUsers;
    }
  });

  if (reactionType !== FeedReactionType.DISLIKE && selectedType !== reactionType) {
    reactors[reactionType] = [...(reactors[reactionType] ?? []), currentUser];
  }

  const counts: Partial<Record<FeedReactionType, number>> = {};
  publicGalleryReactionChoices.forEach((reaction) => {
    const count = reactors[reaction.type]?.length ?? 0;
    if (count > 0) counts[reaction.type] = count;
  });

  return { counts, reactors };
}

function GalleryReactionControls({
  compact = false,
  currentUser,
  onReact,
  state
}: {
  compact?: boolean;
  currentUser: GalleryReactionUserView;
  onReact: (reactionType: FeedReactionType) => void;
  state: GalleryReactionState;
}) {
  const selectedType = currentReaction(state.reactors, currentUser.id);

  return (
    <div className={compact ? "gallery-reaction-controls is-compact" : "gallery-reaction-controls"} aria-label="Reaction options">
      {publicGalleryReactionChoices.map((reaction) => {
        const count = state.counts[reaction.type] ?? 0;
        const selected = selectedType === reaction.type;

        return (
          <button
            aria-label={reactionTooltip(reaction)}
            aria-pressed={selected}
            className={selected ? "gallery-reaction-button is-selected" : "gallery-reaction-button"}
            key={reaction.type}
            onClick={() => onReact(reaction.type)}
            title={reactionTooltip(reaction)}
            type="button"
          >
            <GalleryReactionIcon reaction={reaction} />
            {!compact ? <span>{reaction.label}</span> : null}
            {count > 0 ? <strong>{count}</strong> : null}
          </button>
        );
      })}
    </div>
  );
}

type GalleryReplyTarget = {
  id: string;
  authorDisplayName: string;
  authorUsername: string;
};

function mapCommentTree(
  comments: GalleryAssetCommentView[],
  commentId: string,
  update: (comment: GalleryAssetCommentView) => GalleryAssetCommentView
): GalleryAssetCommentView[] {
  return comments.map((comment) => {
    if (comment.id === commentId) return update(comment);

    if (comment.replies?.length) {
      return {
        ...comment,
        replies: mapCommentTree(comment.replies, commentId, update)
      };
    }

    return comment;
  });
}

function appendCommentToThread(comments: GalleryAssetCommentView[], comment: GalleryAssetCommentView) {
  if (!comment.parentCommentId) return [...comments, comment];

  let inserted = false;
  const next = comments.map((candidate) => {
    if (candidate.id !== comment.parentCommentId) return candidate;

    inserted = true;
    const replies = [...(candidate.replies ?? []), comment];

    return {
      ...candidate,
      replyCount: Math.max(candidate.replyCount + 1, replies.length),
      replies
    };
  });

  return inserted ? next : [...comments, comment];
}

function GalleryCommentThreadItem({
  canReply,
  comment,
  currentUser,
  onReact,
  onReply,
  onShare,
  depth = 0
}: {
  canReply: boolean;
  comment: GalleryAssetCommentView;
  currentUser: GalleryReactionUserView;
  onReact: (commentId: string, reactionType: FeedReactionType) => void;
  onReply: (comment: GalleryAssetCommentView) => void;
  onShare: (commentId: string) => void;
  depth?: number;
}) {
  const replies = comment.replies ?? [];

  return (
    <article className={depth > 0 ? "gallery-comment is-reply" : "gallery-comment"} id={`comment-${comment.id}`}>
      <div className="gallery-comment-main">
        <Link className="profile-inline-link" href={`/profile/${comment.author.username}`}>
          <strong>{comment.author.displayName}</strong>
        </Link>
        <span>
          <Link className="profile-inline-link" href={`/profile/${comment.author.username}`}>
            @{comment.author.username}
          </Link>{" "}
          | {new Date(comment.createdAt).toLocaleDateString()}
          {comment.replyCount > 0 ? ` | ${comment.replyCount} repl${comment.replyCount === 1 ? "y" : "ies"}` : ""}
        </span>
        <p>{comment.body}</p>
        <div className="gallery-comment-actions">
          <GalleryReactionControls
            compact
            currentUser={currentUser}
            onReact={(reactionType) => onReact(comment.id, reactionType)}
            state={{ counts: comment.reactions, reactors: comment.reactionReactors }}
          />
          {canReply ? (
            <button aria-label="Reply" className="gallery-comment-action-button" onClick={() => onReply(comment)} title="Reply" type="button">
              <ActionGlyph kind="comment" />
            </button>
          ) : null}
          <button aria-label="Share" className="gallery-comment-action-button is-share" onClick={() => onShare(comment.id)} title="Share" type="button">
            <ActionGlyph kind="share" />
          </button>
        </div>
      </div>
      {replies.length > 0 ? (
        <div className="gallery-comment-replies">
          {replies.map((reply) => (
            <GalleryCommentThreadItem
              canReply={canReply}
              comment={reply}
              currentUser={currentUser}
              depth={depth + 1}
              key={reply.id}
              onReact={onReact}
              onReply={onReply}
              onShare={onShare}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function accessFromAsset(asset: GalleryAssetView): GalleryAccess {
  if (asset.visibility === MediaVisibility.PUBLIC && asset.commentsEnabled) return "PUBLIC_COMMENTS";
  if (asset.visibility === MediaVisibility.PUBLIC) return "PUBLIC_NO_COMMENTS";
  if (asset.visibility === MediaVisibility.MEMBERS && asset.commentsEnabled) return "MEMBERS_COMMENTS";
  if (asset.visibility === MediaVisibility.MEMBERS) return "MEMBERS_NO_COMMENTS";
  return "PRIVATE";
}

function accessToSettings(access: GalleryAccess) {
  if (access === "MEMBERS_COMMENTS") return { visibility: MediaVisibility.MEMBERS, commentsEnabled: true };
  if (access === "PUBLIC_NO_COMMENTS") return { visibility: MediaVisibility.PUBLIC, commentsEnabled: false };
  if (access === "PUBLIC_COMMENTS") return { visibility: MediaVisibility.PUBLIC, commentsEnabled: true };
  if (access === "MEMBERS_NO_COMMENTS") return { visibility: MediaVisibility.MEMBERS, commentsEnabled: false };
  return { visibility: MediaVisibility.PRIVATE, commentsEnabled: false };
}

export function GalleryAssetVisibilityControls({ asset }: { asset: GalleryAssetView }) {
  const router = useRouter();
  const [access, setAccess] = useState<GalleryAccess>(() => accessFromAsset(asset));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveSettings(nextAccess: GalleryAccess) {
    setAccess(nextAccess);
    setError("");
    setMessage("");
    const nextSettings = accessToSettings(nextAccess);

    startTransition(async () => {
      const response = await fetch(`/api/media/assets/${asset.id}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings)
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not save photo settings.");
        setAccess(accessFromAsset(asset));
        return;
      }

      setMessage("Photo visibility saved.");
      router.refresh();
    });
  }

  return (
    <section className="surface rounded-md p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Visibility and comments</p>
      <label className="mt-4 grid gap-2">
        <span className="text-sm text-[var(--muted)]">Who can view this photo?</span>
        <select className="form-field" disabled={isPending} onChange={(event) => saveSettings(event.target.value as GalleryAccess)} value={access}>
          <option value="PRIVATE">Private - only me, comments off</option>
          <option value="MEMBERS_NO_COMMENTS">Members can view, comments off</option>
          <option value="MEMBERS_COMMENTS">Members can view and comment</option>
          <option value="PUBLIC_NO_COMMENTS">Public can view, comments off</option>
          <option value="PUBLIC_COMMENTS">Public can view, members can comment</option>
        </select>
      </label>
      {message ? <p className="mt-4 rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
    </section>
  );
}

export function GalleryAssetEngagement({
  asset,
  currentUser,
  initialComments
}: {
  asset: GalleryAssetView;
  currentUser: GalleryReactionUserView;
  initialComments: GalleryAssetCommentView[];
}) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [assetReactions, setAssetReactions] = useState<GalleryReactionState>({
    counts: asset.reactions,
    reactors: asset.reactionReactors
  });
  const [body, setBody] = useState("");
  const [replyTarget, setReplyTarget] = useState<GalleryReplyTarget | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const threadItemCount = useMemo(
    () => comments.reduce((count, comment) => count + 1 + (comment.replies?.length ?? 0), 0),
    [comments]
  );

  async function reactToPhoto(reactionType: FeedReactionType) {
    setAssetReactions((current) => nextReactionState(current, reactionType, currentUser));

    const response = await fetch(`/api/media/assets/${asset.id}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: reactionType })
    });

    if (!response.ok) {
      setError("Could not save photo reaction.");
      router.refresh();
      return;
    }

    router.refresh();
  }

  async function reactToComment(commentId: string, reactionType: FeedReactionType) {
    setComments((current) =>
      mapCommentTree(current, commentId, (comment) => {
        const next = nextReactionState(
          { counts: comment.reactions, reactors: comment.reactionReactors },
          reactionType,
          currentUser
        );

        return {
          ...comment,
          reactions: next.counts,
          reactionReactors: next.reactors
        };
      })
    );

    const response = await fetch(`/api/media/assets/${asset.id}/comments/${commentId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: reactionType })
    });

    if (!response.ok) {
      setError("Could not save comment reaction.");
      router.refresh();
      return;
    }

    router.refresh();
  }

  function startReply(comment: GalleryAssetCommentView) {
    setReplyTarget({
      id: comment.parentCommentId ?? comment.id,
      authorDisplayName: comment.author.displayName,
      authorUsername: comment.author.username
    });
    setMessage("");
    setError("");
    window.requestAnimationFrame(() => commentInputRef.current?.focus());
  }

  async function shareComment(commentId: string) {
    setError("");
    setMessage("");
    const url = `${window.location.origin}/profile/gallery/${asset.id}#comment-${commentId}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Theta-Space photo comment", url });
        setMessage("Comment shared.");
        return;
      }

      await navigator.clipboard.writeText(url);
      setMessage("Comment link copied.");
    } catch {
      setError("Could not share that comment from this browser.");
    }
  }

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/media/assets/${asset.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentCommentId: replyTarget?.id ?? null })
      });
      const payload = (await response.json()) as { error?: string; comment?: GalleryAssetCommentView };

      if (!response.ok || !payload.comment) {
        setError(payload.error ?? "Could not add comment.");
        return;
      }

      setComments((current) => appendCommentToThread(current, payload.comment as GalleryAssetCommentView));
      setBody("");
      setReplyTarget(null);
      setMessage(replyTarget ? "Reply added." : "Comment added.");
    });
  }

  return (
    <section className="gallery-engagement surface rounded-md p-5">
      <div className="gallery-engagement-heading">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Comments</p>
        <span className="text-xs text-[var(--muted)]">{threadItemCount} thread item{threadItemCount === 1 ? "" : "s"}</span>
      </div>

      <div className="gallery-photo-reactions mt-5">
        <GalleryReactionControls currentUser={currentUser} onReact={reactToPhoto} state={assetReactions} />
      </div>

      <div className="gallery-comment-area mt-5 grid gap-3">
        <div className="gallery-comment-list">
          {comments.length ? (
            comments.map((comment) => (
              <GalleryCommentThreadItem
                canReply={asset.commentsEnabled}
                comment={comment}
                currentUser={currentUser}
                key={comment.id}
                onReact={reactToComment}
                onReply={startReply}
                onShare={(commentId) => void shareComment(commentId)}
              />
            ))
          ) : (
            <p className="text-sm text-[var(--muted)]">No comments yet.</p>
          )}
        </div>

        {asset.commentsEnabled ? (
          <form className="grid gap-3" onSubmit={submitComment}>
            {replyTarget ? (
              <div className="gallery-reply-context">
                <span>
                  Replying to <strong>@{replyTarget.authorUsername}</strong>
                </span>
                <button onClick={() => setReplyTarget(null)} type="button">
                  Cancel
                </button>
              </div>
            ) : null}
            <textarea
              ref={commentInputRef}
              className="form-field min-h-20 resize-y"
              disabled={isPending}
              onChange={(event) => setBody(event.target.value)}
              placeholder={replyTarget ? `Reply to @${replyTarget.authorUsername}...` : "Write a comment..."}
              value={body}
            />
            <button
              className="btn-secondary send-logo-button is-compact justify-self-end"
              data-tooltip="Send this comment."
              disabled={isPending || !body.trim()}
              type="submit"
            >
              <span aria-hidden="true" className="send-logo-icon" />
              <span className="sr-only">{isPending ? "Sending..." : "Send comment"}</span>
            </button>
          </form>
        ) : (
          <p className="rounded-md border border-[rgba(214,178,74,0.16)] bg-black/10 p-3 text-sm text-[var(--muted)]">
            Comments are off for this photo.
          </p>
        )}
      </div>

      {message ? <p className="mt-4 rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
    </section>
  );
}
