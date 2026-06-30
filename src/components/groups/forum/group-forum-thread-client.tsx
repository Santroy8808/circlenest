"use client";

import { GroupAssetKind, GroupForumReactionType } from "@prisma/client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import { ThetaLikeTriangle } from "@/components/reactions/theta-like-triangle";
import type { GroupForumThreadDetailView } from "@/modules/group-forum/types";

const quickReactions = [
  GroupForumReactionType.LIKE,
  GroupForumReactionType.LOVE,
  GroupForumReactionType.CARE,
  GroupForumReactionType.HAHA
];

const groupReactionLabels: Record<GroupForumReactionType, string> = {
  [GroupForumReactionType.LIKE]: "Like",
  [GroupForumReactionType.LOVE]: "Love",
  [GroupForumReactionType.CARE]: "Care",
  [GroupForumReactionType.HAHA]: "Haha",
  [GroupForumReactionType.WOW]: "Wow",
  [GroupForumReactionType.SAD]: "Sad",
  [GroupForumReactionType.ANGRY]: "Angry"
};

const groupReactionGlyphs: Partial<Record<GroupForumReactionType, string>> = {
  [GroupForumReactionType.LOVE]: "\u2764\uFE0F",
  [GroupForumReactionType.CARE]: "\u{1F917}",
  [GroupForumReactionType.HAHA]: "\u{1F602}",
  [GroupForumReactionType.WOW]: "\u{1F62E}",
  [GroupForumReactionType.SAD]: "\u{1F622}",
  [GroupForumReactionType.ANGRY]: "\u{1F621}"
};

function GroupReactionDisplay({ reaction }: { reaction: GroupForumReactionType }) {
  if (reaction === GroupForumReactionType.LIKE) {
    return <ThetaLikeTriangle />;
  }

  return <span aria-hidden="true">{groupReactionGlyphs[reaction] ?? groupReactionLabels[reaction]}</span>;
}

export function GroupForumThreadClient({
  group,
  initialThread,
  viewerCanPost
}: {
  group: { id: string; slug: string; name: string };
  initialThread: GroupForumThreadDetailView;
  viewerCanPost: boolean;
}) {
  const [thread, setThread] = useState(initialThread);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string; progress: number } | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function refreshThread() {
    const response = await fetch(`/api/groups/${group.slug}/forum/threads/${thread.id}`, { cache: "no-store" });
    if (response.ok) {
      const payload = (await response.json()) as { thread: GroupForumThreadDetailView; viewerCanPost: boolean };
      setThread(payload.thread);
    }
  }

  function choosePhoto(file: File | null) {
    setError("");

    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);

    if (!file) {
      setPhoto(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setPhoto(null);
      setError("Choose a JPG, PNG, GIF, or WEBP image.");
      return;
    }

    setPhoto({
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0
    });
  }

  async function uploadReplyPhoto() {
    if (!photo) return "";

    const intentResponse = await fetch(`/api/groups/${group.slug}/media/upload-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: photo.file.name,
        mimeType: photo.file.type,
        sizeBytes: photo.file.size,
        kind: GroupAssetKind.PHOTO,
        forumThreadId: thread.id
      })
    });
    const intent = (await intentResponse.json()) as { error?: string; uploadUrl?: string; storageKey?: string };

    if (!intentResponse.ok || !intent.uploadUrl || !intent.storageKey) {
      throw new Error(intent.error ?? "Could not prepare photo upload.");
    }

    await uploadWithResilientFallback({
      uploadUrl: intent.uploadUrl,
      storageKey: intent.storageKey,
      file: photo.file,
      onProgress: (progress) => setPhoto((current) => (current ? { ...current, progress } : current)),
      proxyUrl: `/api/groups/${group.slug}/media/proxy-upload`,
      fields: {
        kind: GroupAssetKind.PHOTO,
        forumThreadId: thread.id
      }
    });

    const completeResponse = await fetch(`/api/groups/${group.slug}/media/complete-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storageKey: intent.storageKey,
        fileName: photo.file.name,
        mimeType: photo.file.type,
        sizeBytes: photo.file.size,
        kind: GroupAssetKind.PHOTO,
        forumThreadId: thread.id,
        headline: `Forum photo: ${photo.file.name}`,
        description: thread.title
      })
    });
    const complete = (await completeResponse.json()) as { error?: string; asset?: { mediaAssetId?: string } };

    if (!completeResponse.ok || !complete.asset?.mediaAssetId) {
      throw new Error(complete.error ?? "Could not save photo.");
    }

    return complete.asset.mediaAssetId;
  }

  function reply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        const mediaAssetId = await uploadReplyPhoto();
      const response = await fetch(`/api/groups/${group.slug}/forum/threads/${thread.id}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, mediaAssetId })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not reply.");
        return;
      }

      setBody("");
        if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
        setPhoto(null);
      await refreshThread();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not reply.");
      }
    });
  }

  function endThread() {
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/groups/${group.slug}/forum/threads/${thread.id}/end`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not end thread.");
        return;
      }

      await refreshThread();
    });
  }

  function deleteThread() {
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/groups/${group.slug}/forum/threads/${thread.id}/delete`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not delete thread.");
        return;
      }

      window.location.href = `/groups/${group.slug}/forum`;
    });
  }

  function reactToThread(type: GroupForumReactionType) {
    startTransition(async () => {
      await fetch(`/api/groups/${group.slug}/forum/threads/${thread.id}/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      await refreshThread();
    });
  }

  function reactToPost(postId: string, type: GroupForumReactionType) {
    startTransition(async () => {
      await fetch(`/api/groups/${group.slug}/forum/posts/${postId}/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      await refreshThread();
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <Link className="text-sm text-[var(--gold)]" href={`/groups/${group.slug}/forum`}>
          Back to forum
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-[var(--gold)]">{group.name}</p>
            <h1 className="mt-2 text-4xl font-semibold">{thread.title}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              by{" "}
              <Link className="profile-inline-link" href={`/profile/${thread.author.username}`}>
                {thread.author.displayName}
              </Link>{" "}
              · {new Date(thread.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {thread.endedAt ? <span className="pill rounded-full px-4 py-3 text-sm">Ended</span> : null}
            {thread.viewerCanEnd ? (
              <button className="btn-secondary" disabled={isPending} onClick={endThread} type="button">
                End thread
              </button>
            ) : null}
            {thread.viewerCanDelete ? (
              <button className="btn-secondary" disabled={isPending} onClick={deleteThread} type="button">
                Delete ended thread
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <article className="forum-open-post surface rounded-md p-6">
        <p className="whitespace-pre-wrap leading-7">{thread.body}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {quickReactions.map((reaction) => (
            <button
              aria-label={groupReactionLabels[reaction]}
              className="btn-secondary group-reaction-button px-3 py-2 text-sm"
              key={reaction}
              onClick={() => reactToThread(reaction)}
              title={groupReactionLabels[reaction]}
              type="button"
            >
              <GroupReactionDisplay reaction={reaction} /> <span>{thread.reactions[reaction] ?? 0}</span>
            </button>
          ))}
        </div>
      </article>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Replies</h2>
        <div className="mt-5 grid gap-3">
          {thread.posts.length === 0 ? <p className="text-[var(--muted)]">No replies yet.</p> : null}
          {thread.posts.map((post) => (
            <article className="forum-reply-bubble" key={post.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link className="profile-inline-link font-semibold" href={`/profile/${post.author.username}`}>
                    {post.author.displayName}
                  </Link>
                  <p className="text-xs text-[var(--muted)]">{new Date(post.createdAt).toLocaleString()}</p>
                </div>
                <span className="text-xs text-[var(--muted)]">{post.replyCount} nested replies</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap leading-7">{post.body}</p>
              {post.mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="mt-3 max-h-72 rounded-md object-cover" src={post.mediaUrl} />
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {quickReactions.map((reaction) => (
                  <button
                    aria-label={groupReactionLabels[reaction]}
                    className="btn-secondary group-reaction-button px-3 py-2 text-sm"
                    key={reaction}
                    onClick={() => reactToPost(post.id, reaction)}
                    title={groupReactionLabels[reaction]}
                    type="button"
                  >
                    <GroupReactionDisplay reaction={reaction} /> <span>{post.reactions[reaction] ?? 0}</span>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {viewerCanPost ? (
        <form className="surface rounded-md p-5" onSubmit={reply}>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Reply</p>
          <textarea
            className="form-field mt-3 min-h-28 resize-y"
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a reply..."
            value={body}
          />
          {thread.allowPhotoReplies ? (
            <div className="mt-4 grid gap-3">
              <input
                ref={fileInputRef}
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={(event) => choosePhoto(event.target.files?.[0] ?? null)}
                type="file"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  aria-label={photo ? "Change image" : "Attach image"}
                  className="btn-secondary icon-glyph-button"
                  disabled={isPending}
                  onClick={() => fileInputRef.current?.click()}
                  title={photo ? "Change image" : "Attach image"}
                  type="button"
                >
                  <span aria-hidden="true">▧</span>
                </button>
                {photo ? (
                  <button className="btn-secondary" disabled={isPending} onClick={() => choosePhoto(null)} type="button">
                    Remove
                  </button>
                ) : null}
                <p className="text-sm text-[var(--muted)]">Photo replies count against this group&apos;s assigned storage.</p>
              </div>
              {photo ? (
                <div className="forum-reply-photo-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" src={photo.previewUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--gold)]">{photo.file.name}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
                      <span className="block h-full rounded-full bg-[var(--blue)]" style={{ width: `${photo.progress}%` }} />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="mt-3 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          <button className="btn-primary send-logo-button mt-4" disabled={isPending || (!body.trim() && !photo)} type="submit">
            <span aria-hidden="true" className="send-logo-icon" />
            <span className="sr-only">{isPending ? "Replying..." : "Post reply"}</span>
          </button>
        </form>
      ) : (
        <section className="surface rounded-md p-5 text-[var(--muted)]">
          {thread.endedAt ? "This thread has ended." : "Join the group to reply."}
        </section>
      )}
    </div>
  );
}
