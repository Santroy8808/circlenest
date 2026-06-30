"use client";

import { MediaVisibility } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import type { GalleryAssetCommentView, GalleryAssetView } from "@/modules/gallery-media-storage/types";

type GalleryAccess = "PRIVATE" | "MEMBERS_NO_COMMENTS" | "MEMBERS_COMMENTS" | "PUBLIC_NO_COMMENTS" | "PUBLIC_COMMENTS";

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

export function GalleryAssetEngagement({
  asset,
  initialComments
}: {
  asset: GalleryAssetView;
  initialComments: GalleryAssetCommentView[];
}) {
  const router = useRouter();
  const [access, setAccess] = useState<GalleryAccess>(() => accessFromAsset(asset));
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const settings = accessToSettings(access);

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

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/media/assets/${asset.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body })
      });
      const payload = (await response.json()) as { error?: string; comment?: GalleryAssetCommentView };

      if (!response.ok || !payload.comment) {
        setError(payload.error ?? "Could not add comment.");
        return;
      }

      setComments((current) => [...current, payload.comment as GalleryAssetCommentView]);
      setBody("");
      setMessage("Comment added.");
    });
  }

  return (
    <section className="gallery-engagement surface rounded-md p-5">
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

      <div className="gallery-comment-area mt-5 grid gap-3">
        <div className="gallery-comment-list">
          {comments.length ? (
            comments.map((comment) => (
              <article className="gallery-comment" key={comment.id}>
                <Link className="profile-inline-link" href={`/profile/${comment.author.username}`}>
                  <strong>{comment.author.displayName}</strong>
                </Link>
                <span>
                  <Link className="profile-inline-link" href={`/profile/${comment.author.username}`}>
                    @{comment.author.username}
                  </Link>{" "}
                  | {new Date(comment.createdAt).toLocaleDateString()}
                </span>
                <p>{comment.body}</p>
              </article>
            ))
          ) : (
            <p className="text-sm text-[var(--muted)]">No comments yet.</p>
          )}
        </div>

        {settings.commentsEnabled ? (
          <form className="grid gap-3" onSubmit={submitComment}>
            <textarea
              className="form-field min-h-20 resize-y"
              disabled={isPending}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write a comment..."
              value={body}
            />
            <button className="btn-secondary justify-self-end" disabled={isPending || !body.trim()} type="submit">
              Comment
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
