"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { CommentThread } from "@/components/comments/comment-thread";
import { uploadImageWithCompression } from "@/lib/media/image-upload.client";

type GroupPhotoComment = {
  id: string;
  parentCommentId: string | null;
  content: string;
  mediaUrlsJson: string | null;
  createdAt: string | Date;
  authorUsername: string;
  authorFullName: string | null;
};

type GroupPhotoItem = {
  id: string;
  caption: string | null;
  url: string;
  sizeBytes: number;
  uploaderUsername: string;
  albumId: string | null;
  tags: string | null;
  comments: GroupPhotoComment[];
};

function formatBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)}MB`;
  return `${Math.max(0, Math.round(bytes / 1024))}KB`;
}

export function GroupPhotoGallery({
  groupId,
  currentUsername,
  canModerate,
  canUploadAssets,
  usageBytes,
  limitBytes,
  photos,
  onStatus,
  onRefresh,
}: {
  groupId: string;
  currentUserId: string;
  currentUsername: string;
  canModerate: boolean;
  canUploadAssets: boolean;
  usageBytes: number;
  limitBytes: number;
  photos: GroupPhotoItem[];
  onStatus: (message: string) => void;
  onRefresh: () => void;
}) {
  const [headline, setHeadline] = useState("");
  const [uploading, setUploading] = useState(false);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [draftHeadline, setDraftHeadline] = useState("");
  const [draftComment, setDraftComment] = useState("");
  const [commentMediaUrls, setCommentMediaUrls] = useState<string[]>([]);
  const [commentBusy, setCommentBusy] = useState(false);
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const [savingHeadline, setSavingHeadline] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);

  const openPhoto = useMemo(() => photos.find((photo) => photo.id === openPhotoId) ?? null, [photos, openPhotoId]);
  const canDeleteOpenPhoto = openPhoto ? canModerate || openPhoto.uploaderUsername === currentUsername : false;

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length || !canUploadAssets) return;
    setUploading(true);
    onStatus("Uploading...");
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadImageWithCompression(file, { purpose: "group-photo", groupId });
        if (!uploaded.url) throw new Error("Could not upload photo.");
        const saveRes = await fetch(`/api/groups/${groupId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caption: headline.trim() || null,
            url: uploaded.url,
            sizeBytes: uploaded.sizeBytes,
          }),
        });
        if (!saveRes.ok) {
          const body = (await saveRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Could not save photo.");
        }
      }
      setHeadline("");
      onStatus("Photo uploaded.");
      onRefresh();
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Could not upload photo.");
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(photoId: string) {
    const res = await fetch(`/api/groups/${groupId}/photos/${photoId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      onStatus(body.error ?? "Could not delete photo.");
      return;
    }
    setOpenPhotoId((current) => (current === photoId ? null : current));
    onStatus("Photo deleted.");
    onRefresh();
  }

  async function saveHeadline() {
    if (!openPhoto) return;
    setSavingHeadline(true);
    const res = await fetch(`/api/groups/${groupId}/photos/${openPhoto.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: draftHeadline }),
    });
    setSavingHeadline(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      onStatus(body.error ?? "Could not save headline.");
      return;
    }
    onStatus("Headline saved.");
    onRefresh();
  }

  async function uploadCommentMedia(files: FileList | null) {
    if (!files?.length) return;
    setCommentBusy(true);
    try {
      const uploaded = (
        await Promise.all(
          Array.from(files).map(async (file) => {
            const result = await uploadImageWithCompression(file, { purpose: "group-post-media", groupId });
            return result.url;
          }),
        )
      ).filter((value): value is string => Boolean(value));
      setCommentMediaUrls((previous) => [...previous, ...uploaded].slice(0, 8));
    } finally {
      setCommentBusy(false);
    }
  }

  async function submitComment() {
    if (!openPhoto) return;
    const content = draftComment.trim();
    if (!content && commentMediaUrls.length === 0) return;
    const res = await fetch(`/api/groups/${groupId}/photos/${openPhoto.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, parentCommentId: replyToCommentId, mediaUrls: commentMediaUrls }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      onStatus(body.error ?? "Could not post comment.");
      return;
    }
    setDraftComment("");
    setCommentMediaUrls([]);
    setReplyToCommentId(null);
    onStatus("Comment posted.");
    onRefresh();
  }

  return (
    <article className="card rounded-[18px] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">Group Photos</h2>
          <p className="text-sm text-slate-300">Simple gallery for the group.</p>
          <p className="text-xs text-slate-400">
            Storage used: {formatBytes(usageBytes)} / {formatBytes(limitBytes)}
          </p>
        </div>
        {canUploadAssets ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
              placeholder="Headline"
              className="rounded-full border border-[var(--border)] bg-[#1a2335] px-4 py-2 text-sm"
            />
            <label className="cursor-pointer rounded-full border border-[#6a5420] bg-[#c49a35] px-4 py-2 text-sm font-semibold text-[#1a1204]">
              {uploading ? "Uploading..." : "Upload"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  void uploadPhotos(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Only the group creator, moderators, or flagged providers can upload.</p>
        )}
      </div>

      {photos.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => {
                setOpenPhotoId(photo.id);
                setDraftHeadline(photo.caption ?? "");
                setDraftComment("");
                setCommentMediaUrls([]);
                setReplyToCommentId(null);
              }}
              className="overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--card)] text-left transition hover:border-[var(--accent)]/55 hover:bg-[#162235]"
            >
              <Image src={photo.url} alt={photo.caption || "Group photo"} width={420} height={420} unoptimized className="aspect-square w-full object-cover" />
              <div className="space-y-1 px-3 py-2">
                <p className="truncate text-sm font-medium text-slate-100">{photo.caption || "Untitled photo"}</p>
                <p className="text-[11px] text-slate-400">
                  @{photo.uploaderUsername} | {photo.comments.length} comment{photo.comments.length === 1 ? "" : "s"}
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-[14px] border border-dashed border-[var(--border)] bg-[#10192a] p-4 text-sm text-slate-400">No group photos yet.</p>
      )}

      {openPhoto ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-3 md:p-6" onClick={() => setOpenPhotoId(null)}>
          <div
            className="mx-auto grid h-full max-w-[1200px] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)] shadow-[0_20px_50px_rgba(0,0,0,0.42)] md:grid-cols-[minmax(0,1fr)_360px]"
            onClick={(event) => event.stopPropagation()}
          >
            <section className="flex items-center justify-center bg-[#0c1322] p-3">
              <Image src={openPhoto.url} alt={openPhoto.caption || "Group photo"} width={1200} height={900} unoptimized className="max-h-full w-full object-contain" />
            </section>
            <aside className="flex h-full flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--card)] p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-strong)]">Photo</h3>
                {canDeleteOpenPhoto ? (
                  <button type="button" className="rounded-full border border-red-400/60 px-3 py-1 text-xs text-red-100" onClick={() => void deletePhoto(openPhoto.id)}>
                    Delete
                  </button>
                ) : null}
              </div>

              <label className="mt-3 text-xs text-slate-300">
                Headline
                <div className="mt-1 flex gap-2">
                  <input value={draftHeadline} onChange={(event) => setDraftHeadline(event.target.value)} className="flex-1 rounded-full border border-[var(--border)] bg-[#1a2335] px-3 py-2 text-sm" />
                  {(canModerate || openPhoto.uploaderUsername === currentUsername) ? (
                    <button type="button" className="rounded-full border border-[var(--border)] px-3 py-2 text-xs text-slate-100" onClick={() => void saveHeadline()}>
                      {savingHeadline ? "Saving..." : "Save"}
                    </button>
                  ) : null}
                </div>
              </label>

              <p className="mt-2 text-[11px] text-slate-400">Uploaded by @{openPhoto.uploaderUsername} | {formatBytes(openPhoto.sizeBytes)}</p>

              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <h4 className="text-sm font-semibold text-slate-100">Comments</h4>
                <div className="mt-2">
                  <CommentThread
                    comments={openPhoto.comments.map((comment) => ({
                      id: comment.id,
                      parentCommentId: comment.parentCommentId,
                      content: comment.content,
                      mediaUrlsJson: comment.mediaUrlsJson,
                      createdAt: comment.createdAt,
                      author: { username: comment.authorUsername, fullName: comment.authorFullName },
                    }))}
                    compact
                    emptyText="No comments yet."
                    onReply={(comment) => {
                      setReplyToCommentId(comment.id);
                      setDraftComment((previous) => (previous.trim().length ? previous : `@${comment.author.username} `));
                      commentInputRef.current?.focus();
                    }}
                  />
                </div>

                <div className="mt-3 space-y-2">
                  {replyToCommentId ? <p className="text-[11px] text-slate-400">Replying in thread.</p> : null}
                  <textarea
                    ref={commentInputRef}
                    value={draftComment}
                    onChange={(event) => setDraftComment(event.target.value)}
                    placeholder="Write a comment"
                    className="h-20 w-full rounded-[14px] border border-[var(--border)] bg-[#1a2335] px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="cursor-pointer rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-slate-200">
                      {commentBusy ? "Uploading..." : "Add photo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className="hidden"
                        disabled={commentBusy}
                        onChange={(event) => {
                          void uploadCommentMedia(event.currentTarget.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <button type="button" className="rounded-full border border-[#6a5420] bg-[#c49a35] px-4 py-2 text-sm font-semibold text-[#1a1204]" onClick={() => void submitComment()}>
                      Comment
                    </button>
                  </div>
                  {commentMediaUrls.length ? (
                    <div className="grid grid-cols-4 gap-2">
                      {commentMediaUrls.map((url, index) => (
                        <div key={`${url}-${index}`} className="relative">
                          <Image src={url} alt="Comment upload" width={180} height={180} unoptimized className="h-14 w-full rounded object-cover" />
                          <button
                            type="button"
                            className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white"
                            onClick={() => setCommentMediaUrls((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </article>
  );
}
