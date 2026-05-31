"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { uploadImageWithCompression, type UploadImageOptions } from "@/lib/media/image-upload.client";

type Visibility = "PUBLIC" | "FRIENDS_FAMILY" | "PRIVATE";
type AlbumVisibility = "PUBLIC" | "FRIENDS" | "FAMILY" | "FRIENDS_FAMILY" | "GROUPS" | "PRIVATE";

type GroupOption = { id: string; name: string };

type GalleryComment = {
  id: string;
  parentCommentId: string | null;
  content: string;
  mediaUrlsJson?: string | null;
  createdAt: string | Date;
  author: { username: string; fullName?: string | null };
};

type GalleryPhoto = {
  id: string;
  url: string;
  caption: string | null;
  tags: string | null;
  albumId: string;
  visibility: string;
  createdAt: string | Date;
  comments: GalleryComment[];
  photoTags?: { tag: { id: string; name: string } }[];
};

type GalleryAlbum = {
  id: string;
  title: string;
  visibility?: string;
  shareGroupIds?: string | null;
  createdAt: string | Date;
  photos: GalleryPhoto[];
  albumTags?: { tag: { id: string; name: string } }[];
};

type CommentNode = GalleryComment & { children: CommentNode[] };

const DRAG_URL_MIME = "application/x-theta-space-photo-url";
const STORAGE_LIMIT_BYTES = 100 * 1024 * 1024;

async function uploadOne(file: File, options?: UploadImageOptions): Promise<string | null> {
  const result = await uploadImageWithCompression(file, options);
  return result.url;
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function formatRelativeDate(value: string | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (abs < 60) return rtf.format(diffSeconds, "second");
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) return rtf.format(diffDays, "day");

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatStableDate(value: string | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function parseCommentMedia(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function buildCommentTree(comments: GalleryComment[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  const sorted = [...comments].sort((a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime());
  for (const comment of sorted) {
    byId.set(comment.id, { ...comment, children: [] });
  }

  for (const comment of sorted) {
    const node = byId.get(comment.id);
    if (!node) continue;
    if (comment.parentCommentId) {
      const parent = byId.get(comment.parentCommentId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  return roots;
}

function flattenPhotos(albums: GalleryAlbum[]): GalleryPhoto[] {
  return albums.flatMap((album) => album.photos);
}

function normalizeVisibility(value: string | null | undefined): Visibility {
  if (value === "PRIVATE" || value === "FRIENDS_FAMILY") return value;
  return "PUBLIC";
}

function normalizeAlbumVisibility(value: string | null | undefined): AlbumVisibility {
  if (value === "PRIVATE" || value === "FRIENDS_FAMILY" || value === "FRIENDS" || value === "FAMILY" || value === "GROUPS") return value;
  return "PUBLIC";
}

function parseShareGroupIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function parseAlbumTagNames(album: GalleryAlbum | null | undefined): string[] {
  return album?.albumTags?.map((entry) => entry.tag.name) ?? [];
}

function parsePhotoTagNames(photo: GalleryPhoto | null | undefined): string[] {
  if (!photo) return [];
  if (photo.photoTags?.length) return photo.photoTags.map((entry) => entry.tag.name);
  return parseTags(photo.tags);
}

export function GalleryManagerClient({
  initialAlbums,
  initialAvatarUrl,
  initialBannerUrl,
  initialUserTags,
  initialGroups,
  initialUsageBytes,
}: {
  initialAlbums: GalleryAlbum[];
  initialAvatarUrl: string | null;
  initialBannerUrl: string | null;
  initialUserTags: string[];
  initialGroups: GroupOption[];
  initialUsageBytes: number;
}) {
  const [albums, setAlbums] = useState(initialAlbums);
  const [activeAlbumId, setActiveAlbumId] = useState(initialAlbums[0]?.id ?? "");
  const [viewMode, setViewMode] = useState<"albums" | "album">("albums");
  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [notifyFriendsAndFamily, setNotifyFriendsAndFamily] = useState(true);
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [albumVisibility, setAlbumVisibility] = useState<AlbumVisibility>("PUBLIC");
  const [albumShareGroupIds, setAlbumShareGroupIds] = useState<string[]>([]);
  const [albumTagNames, setAlbumTagNames] = useState<string[]>([]);
  const [tagChoice, setTagChoice] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [uploadTagNames, setUploadTagNames] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string>("ALL");
  const [userTags, setUserTags] = useState<string[]>(initialUserTags);
  const [groups] = useState<GroupOption[]>(initialGroups);
  const [usageBytes, setUsageBytes] = useState<number>(initialUsageBytes);
  const [sortMode, setSortMode] = useState<"newest" | "oldest">("newest");

  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [bannerUrl, setBannerUrl] = useState(initialBannerUrl);
  const [dragUrl, setDragUrl] = useState<string | null>(null);

  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Record<string, boolean>>({});
  const [starredPhotoIds, setStarredPhotoIds] = useState<Record<string, boolean>>({});

  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [modalCaption, setModalCaption] = useState("");
  const [modalTags, setModalTags] = useState("");
  const [modalAlbumId, setModalAlbumId] = useState("");
  const [modalVisibility, setModalVisibility] = useState<Visibility>("PUBLIC");
  const [modalComment, setModalComment] = useState("");
  const [modalCommentMediaUrls, setModalCommentMediaUrls] = useState<string[]>([]);
  const [modalCommentUploading, setModalCommentUploading] = useState(false);
  const [modalReplyToId, setModalReplyToId] = useState<string | null>(null);
  const [commentReactions, setCommentReactions] = useState<Record<string, Record<string, number>>>({});
  const [collapsedCommentIds, setCollapsedCommentIds] = useState<Record<string, boolean>>({});
  const [zoomed, setZoomed] = useState(false);

  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const allPhotos = useMemo(() => flattenPhotos(albums), [albums]);
  const activeAlbum = useMemo(
    () => albums.find((album) => album.id === activeAlbumId) ?? albums[0] ?? null,
    [albums, activeAlbumId],
  );

  const visiblePhotos = useMemo(() => {
    if (!activeAlbum) return [];
    const filtered = tagFilter === "ALL"
      ? activeAlbum.photos
      : activeAlbum.photos.filter((photo) => parsePhotoTagNames(photo).includes(tagFilter));
    const sorted = [...filtered].sort((a, b) => {
      const delta = toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime();
      return sortMode === "newest" ? -delta : delta;
    });
    return sorted;
  }, [activeAlbum, sortMode, tagFilter]);

  const openPhoto = useMemo(() => allPhotos.find((photo) => photo.id === openPhotoId) ?? null, [allPhotos, openPhotoId]);

  const openPhotoIndex = useMemo(() => {
    if (!openPhoto) return -1;
    return visiblePhotos.findIndex((photo) => photo.id === openPhoto.id);
  }, [openPhoto, visiblePhotos]);

  const openPhotoCommentTree = useMemo(() => (openPhoto ? buildCommentTree(openPhoto.comments) : []), [openPhoto]);

  const selectedCount = useMemo(
    () => Object.values(selectedPhotoIds).filter(Boolean).length,
    [selectedPhotoIds],
  );

  const storageUsedMb = useMemo(() => (usageBytes / (1024 * 1024)).toFixed(2), [usageBytes]);
  const storageLimitMb = useMemo(() => (STORAGE_LIMIT_BYTES / (1024 * 1024)).toFixed(0), []);
  const storagePercent = useMemo(
    () => Math.min(100, Math.round((usageBytes / STORAGE_LIMIT_BYTES) * 100)),
    [usageBytes],
  );

  useEffect(() => {
    if (!activeAlbum) return;
    setAlbumVisibility(normalizeAlbumVisibility(activeAlbum.visibility));
    setAlbumShareGroupIds(parseShareGroupIds(activeAlbum.shareGroupIds));
    const tags = parseAlbumTagNames(activeAlbum);
    setAlbumTagNames(tags);
    setUploadTagNames(tags.length ? tags : ["Stream_Image"]);
  }, [activeAlbum]);

  useEffect(() => {
    if (!openPhoto) return;
    setModalCaption(openPhoto.caption ?? "");
    setModalTags(parsePhotoTagNames(openPhoto).join(", "));
    setModalAlbumId(openPhoto.albumId);
    setModalVisibility(normalizeVisibility(openPhoto.visibility));
    setModalComment("");
    setModalCommentMediaUrls([]);
    setModalReplyToId(null);
    setZoomed(false);
  }, [openPhoto]);

  useEffect(() => {
    if (!openPhoto) return;
    if (!modalReplyToId) return;
    commentInputRef.current?.focus();
  }, [openPhoto, modalReplyToId]);

  async function refreshUsage() {
    const res = await fetch("/api/gallery/usage", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { usedBytes?: number };
    setUsageBytes(body.usedBytes ?? 0);
  }

  function updatePhotoLocally(photoId: string, updater: (photo: GalleryPhoto) => GalleryPhoto) {
    setAlbums((previous) =>
      previous.map((album) => ({
        ...album,
        photos: album.photos.map((photo) => (photo.id === photoId ? updater(photo) : photo)),
      })),
    );
  }

  function removePhotoLocally(photoId: string) {
    setAlbums((previous) =>
      previous.map((album) => ({
        ...album,
        photos: album.photos.filter((photo) => photo.id !== photoId),
      })),
    );
    setSelectedPhotoIds((previous) => {
      const copy = { ...previous };
      delete copy[photoId];
      return copy;
    });
    if (openPhotoId === photoId) setOpenPhotoId(null);
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;

    setBusy(true);
    setStatus("Uploading photos...");

    let targetAlbum = activeAlbum;
    if (!targetAlbum) {
      const createdAlbumRes = await fetch("/api/gallery/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "stream_photos", visibility: albumVisibility, shareGroupIds: albumShareGroupIds, tagNames: albumTagNames }),
      });
      if (!createdAlbumRes.ok) {
        setBusy(false);
        setStatus("Could not create a default album.");
        return;
      }
      const createdAlbum = (await createdAlbumRes.json()) as GalleryAlbum;
      targetAlbum = { ...createdAlbum, photos: [] };
      setAlbums((previous) => [targetAlbum!, ...previous]);
      setActiveAlbumId(targetAlbum.id);
    }

    const urls = (
      await Promise.all(
        list.map((file) =>
          uploadOne(file, {
            purpose: "gallery-photo",
            albumId: targetAlbum!.id,
            tagNames: uploadTagNames,
          }),
        ),
      )
    ).filter((url): url is string => Boolean(url));
    if (!urls.length) {
      setBusy(false);
      setStatus("Upload failed.");
      return;
    }

    const saveRes = await fetch("/api/gallery/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumId: targetAlbum.id,
        urls,
        notifyFriendsAndFamily,
        visibility,
        tagNames: uploadTagNames,
      }),
    });

    if (!saveRes.ok) {
      let message = "Could not save uploaded photos.";
      try {
        const body = (await saveRes.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // no-op
      }
      setBusy(false);
      setStatus(message);
      return;
    }

    const payload = (await saveRes.json()) as { photos: GalleryPhoto[] };
    const createdPhotos = (Array.isArray(payload.photos) ? payload.photos : []).map((photo) => ({
      ...photo,
      comments: Array.isArray(photo.comments) ? photo.comments : [],
    }));

    setAlbums((previous) =>
      previous.map((album) =>
        album.id === targetAlbum!.id
          ? { ...album, photos: [...createdPhotos, ...album.photos] }
          : album,
      ),
    );

    setBusy(false);
    setStatus(`Uploaded ${createdPhotos.length} photo${createdPhotos.length === 1 ? "" : "s"}.`);
    void refreshUsage();
  }

  async function createAlbum() {
    const title = newAlbumTitle.trim();
    if (!title) return;
    const res = await fetch("/api/gallery/albums", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        visibility: albumVisibility,
        shareGroupIds: albumShareGroupIds,
        tagNames: albumTagNames,
      }),
    });
    if (!res.ok) {
      setStatus("Could not create album.");
      return;
    }
    const created = (await res.json()) as GalleryAlbum;
    const nextAlbum = { ...created, photos: [] };
    setAlbums((previous) => [nextAlbum, ...previous]);
    setActiveAlbumId(nextAlbum.id);
    setViewMode("album");
    setUserTags((previous) => Array.from(new Set([...previous, ...albumTagNames])).sort((a, b) => a.localeCompare(b)));
    setNewAlbumTitle("");
    setStatus(`Album "${nextAlbum.title}" created.`);
  }

  function toggleAlbumShareGroup(groupId: string) {
    setAlbumShareGroupIds((previous) =>
      previous.includes(groupId) ? previous.filter((id) => id !== groupId) : [...previous, groupId],
    );
  }

  function addAlbumTagByName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAlbumTagNames((previous) => (previous.includes(trimmed) ? previous : [...previous, trimmed]));
    setUploadTagNames((previous) => (previous.includes(trimmed) ? previous : [...previous, trimmed]));
    setUserTags((previous) => Array.from(new Set([...previous, trimmed])).sort((a, b) => a.localeCompare(b)));
  }

  async function saveAlbumProperties() {
    if (!activeAlbum) return;
    const res = await fetch("/api/gallery/albums", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumId: activeAlbum.id,
        visibility: albumVisibility,
        shareGroupIds: albumShareGroupIds,
        tagNames: albumTagNames,
      }),
    });
    if (!res.ok) {
      let message = "Could not save album settings.";
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // no-op
      }
      setStatus(message);
      return;
    }

    const updated = (await res.json()) as GalleryAlbum;
    setAlbums((previous) => previous.map((album) => (album.id === updated.id ? { ...album, ...updated } : album)));
    setUserTags((previous) => Array.from(new Set([...previous, ...albumTagNames])).sort((a, b) => a.localeCompare(b)));
    setStatus("Album settings updated.");
  }

  async function assignProfileImage(type: "avatar" | "banner", url: string) {
    const payload = type === "avatar" ? { avatarUrl: url } : { bannerUrl: url };
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setStatus(`Could not update ${type}.`);
      return;
    }

    if (type === "avatar") setAvatarUrl(url);
    else setBannerUrl(url);
    setStatus(`${type === "avatar" ? "Avatar" : "Banner"} updated.`);
  }

  async function assignFromDrop(type: "avatar" | "banner", e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const directUrl = e.dataTransfer.getData(DRAG_URL_MIME) || e.dataTransfer.getData("text/plain") || dragUrl;
    if (directUrl) {
      await assignProfileImage(type, directUrl);
      return;
    }

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const uploaded = await uploadOne(file, { purpose: type === "avatar" ? "profile-avatar" : "profile-banner" });
    if (!uploaded) {
      setStatus(`Could not upload dropped file for ${type}.`);
      return;
    }
    await assignProfileImage(type, uploaded);
    void refreshUsage();
  }

  async function assignFromPicker(type: "avatar" | "banner", file: File | null) {
    if (!file) return;
    const uploaded = await uploadOne(file, { purpose: type === "avatar" ? "profile-avatar" : "profile-banner" });
    if (!uploaded) {
      setStatus(`Could not upload selected file for ${type}.`);
      return;
    }
    await assignProfileImage(type, uploaded);
    void refreshUsage();
  }

  async function deletePhoto(photoId: string) {
    const res = await fetch(`/api/gallery/photos/${photoId}`, { method: "DELETE" });
    if (!res.ok) {
      setStatus("Could not delete photo.");
      return;
    }
    removePhotoLocally(photoId);
    setStatus("Photo deleted.");
    void refreshUsage();
  }

  async function saveModalMetadata() {
    if (!openPhoto) return;

    const body = {
      caption: modalCaption,
      tagNames: modalTags
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      albumId: modalAlbumId,
      visibility: modalVisibility,
    };

    const res = await fetch(`/api/gallery/photos/${openPhoto.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setStatus("Could not save photo details.");
      return;
    }

    const updated = (await res.json()) as GalleryPhoto;

    setAlbums((previous) => {
      const removedFromAll = previous.map((album) => ({ ...album, photos: album.photos.filter((photo) => photo.id !== openPhoto.id) }));
      const targetIndex = removedFromAll.findIndex((album) => album.id === updated.albumId);
      if (targetIndex === -1) {
        return removedFromAll;
      }
      const next = [...removedFromAll];
      next[targetIndex] = { ...next[targetIndex], photos: [updated, ...next[targetIndex].photos] };
      return next;
    });

    setStatus("Photo details saved.");
  }

  async function submitComment() {
    if (!openPhoto) return;
    const content = modalComment.trim();
    if (!content && modalCommentMediaUrls.length === 0) return;

    const res = await fetch(`/api/gallery/photos/${openPhoto.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, parentCommentId: modalReplyToId, mediaUrls: modalCommentMediaUrls }),
    });

    if (!res.ok) {
      setStatus("Could not post comment.");
      return;
    }

    const created = (await res.json()) as GalleryComment;
    updatePhotoLocally(openPhoto.id, (photo) => ({ ...photo, comments: [...photo.comments, created] }));

    setModalComment("");
    setModalCommentMediaUrls([]);
    setModalReplyToId(null);
    setStatus("Comment posted.");
  }

  async function uploadCommentMedia(files: FileList | null) {
    if (!files?.length) return;
    setModalCommentUploading(true);
    try {
      const uploaded = (
        await Promise.all(
          Array.from(files).map((file) => uploadOne(file, { purpose: "post-media" })),
        )
      ).filter((url): url is string => Boolean(url));

      if (!uploaded.length) {
        setStatus("Could not upload comment media.");
        return;
      }
      setModalCommentMediaUrls((previous) => [...previous, ...uploaded].slice(0, 8));
    } finally {
      setModalCommentUploading(false);
    }
  }

  async function shareAlbum() {
    if (!activeAlbum) return;
    const url = `${window.location.origin}/profile/gallery?album=${activeAlbum.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Album link copied.");
    } catch {
      setStatus("Could not copy album link.");
    }
  }

  function renderCommentNode(node: CommentNode, depth = 0): JSX.Element {
    const collapsed = Boolean(collapsedCommentIds[node.id]);
    const reactions = commentReactions[node.id] ?? {};

    return (
      <div key={node.id} className="space-y-1" style={{ marginLeft: `${Math.min(depth, 3) * 14}px` }}>
        <div className="rounded-md bg-[#141d2d] px-2 py-1.5">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="font-semibold text-[var(--text-strong)]">@{node.author.username}</span>
            <span>{formatRelativeDate(node.createdAt)}</span>
            {node.children.length > 0 ? (
              <button
                type="button"
                className="ml-auto text-[10px] text-slate-300 hover:underline"
                onClick={() => setCollapsedCommentIds((previous) => ({ ...previous, [node.id]: !previous[node.id] }))}
              >
                {collapsed ? `Show ${node.children.length} repl${node.children.length === 1 ? "y" : "ies"}` : "Hide replies"}
              </button>
            ) : null}
          </div>
          {node.content ? <p className="mt-1 text-[12px] text-slate-200">{node.content}</p> : null}
          {parseCommentMedia(node.mediaUrlsJson).length ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {parseCommentMedia(node.mediaUrlsJson).map((url) => (
                <a key={`${node.id}-${url}`} href={url} target="_blank" rel="noreferrer" className="block">
                  <Image src={url} alt="Comment media" width={420} height={320} className="h-24 w-full rounded-md object-cover" />
                </a>
              ))}
            </div>
          ) : null}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-300">
            <button
              type="button"
              className="hover:underline"
              onClick={() => {
                setModalReplyToId(node.id);
                setModalComment(`@${node.author.username} `);
                commentInputRef.current?.focus();
              }}
            >
              Reply
            </button>
            <button
              type="button"
              className="hover:underline"
              onClick={() =>
                setCommentReactions((previous) => ({
                  ...previous,
                  [node.id]: { ...previous[node.id], "👍": (previous[node.id]?.["👍"] ?? 0) + 1 },
                }))
              }
            >
              👍 {reactions["👍"] ?? 0}
            </button>
            <button
              type="button"
              className="hover:underline"
              onClick={() =>
                setCommentReactions((previous) => ({
                  ...previous,
                  [node.id]: { ...previous[node.id], "❤️": (previous[node.id]?.["❤️"] ?? 0) + 1 },
                }))
              }
            >
              ❤️ {reactions["❤️"] ?? 0}
            </button>
          </div>
        </div>
        {!collapsed ? node.children.map((child) => renderCommentNode(child, depth + 1)) : null}
      </div>
    );
  }

  const updatedAt = activeAlbum
    ? activeAlbum.photos.reduce((latest, photo) => {
        const stamp = toDate(photo.createdAt).getTime();
        return stamp > latest ? stamp : latest;
      }, toDate(activeAlbum.createdAt).getTime())
    : null;

  return (
    <section className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[1fr_2fr]">
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            void assignFromDrop("avatar", event);
          }}
          className="group relative overflow-hidden rounded-md bg-[#111a2a]"
        >
          {avatarUrl ? (
            <Image src={avatarUrl} alt="Avatar" width={420} height={420} className="aspect-square h-full w-full object-cover" />
          ) : (
            <div className="flex aspect-square items-center justify-center text-xs text-slate-400">Drop image for avatar</div>
          )}
          <label className="absolute inset-x-0 bottom-0 cursor-pointer bg-black/55 px-2 py-1.5 text-center text-xs text-slate-100 opacity-0 transition group-hover:opacity-100">
            Change Avatar
            <input
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => void assignFromPicker("avatar", event.currentTarget.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            void assignFromDrop("banner", event);
          }}
          className="group relative overflow-hidden rounded-md bg-[#111a2a]"
        >
          {bannerUrl ? (
            <Image src={bannerUrl} alt="Banner" width={1400} height={560} className="h-full min-h-[220px] w-full object-cover" />
          ) : (
            <div className="flex min-h-[220px] items-center justify-center text-xs text-slate-400">Drop image for banner</div>
          )}
          <label className="absolute inset-x-0 bottom-0 cursor-pointer bg-black/55 px-2 py-1.5 text-center text-xs text-slate-100 opacity-0 transition group-hover:opacity-100">
            Change Banner
            <input
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => void assignFromPicker("banner", event.currentTarget.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>

      <article className="rounded-md bg-[#111a2a] p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-strong)]">{activeAlbum?.title ?? "Gallery"}</h1>
            <p className="text-xs text-slate-400">
              {activeAlbum?.photos.length ?? 0} Photos
              {updatedAt ? ` • Updated ${formatStableDate(new Date(updatedAt))}` : ""}
            </p>
            <div className="mt-2 w-full max-w-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Storage used</span>
                <span>{storageUsedMb}MB / {storageLimitMb}MB</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-[#1a2538]">
                <div
                  className={`h-full ${storagePercent >= 90 ? "bg-red-400" : storagePercent >= 75 ? "bg-amber-400" : "bg-emerald-400"}`}
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Upload limit: 100MB per account. Text-only posts do not count.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <button type="button" className="hover:underline" onClick={() => void shareAlbum()}>
              Share
            </button>
            <label className="flex items-center gap-1 text-slate-300">
              Sort
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as "newest" | "oldest")} className="rounded border px-1 py-0.5 text-[12px]">
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-slate-300">
              Album
              <select
                value={activeAlbum?.id ?? ""}
                onChange={(event) => setActiveAlbumId(event.target.value)}
                className="rounded border px-1 py-0.5 text-[12px]"
              >
                {albums.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </article>

      <article className="rounded-md bg-[#111a2a] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="gallery-upload-input" className="cursor-pointer rounded border border-[var(--border)] bg-[#1f2a3d] px-2 py-1 text-[12px] text-slate-100">
            Upload Photos
          </label>
          <input
            id="gallery-upload-input"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              if (!event.currentTarget.files) return;
              void uploadFiles(event.currentTarget.files);
            }}
          />

          <div className="flex items-center gap-1 text-[12px] text-slate-300">
            Album
            <input
              value={newAlbumTitle}
              onChange={(event) => setNewAlbumTitle(event.target.value)}
              placeholder="New album"
              className="w-36 rounded border px-1.5 py-1"
            />
            <button type="button" className="hover:underline" onClick={() => void createAlbum()}>
              Create
            </button>
          </div>

          <label className="flex items-center gap-1 text-[12px] text-slate-300">
            Visibility
            <select value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)} className="rounded border px-1 py-0.5 text-[12px]">
              <option value="PUBLIC">Public</option>
              <option value="FRIENDS_FAMILY">Friends & Family</option>
              <option value="PRIVATE">Private</option>
            </select>
          </label>

          <label className="ml-auto inline-flex items-center gap-1 text-[12px] text-slate-300">
            <input type="checkbox" checked={notifyFriendsAndFamily} onChange={(event) => setNotifyFriendsAndFamily(event.target.checked)} />
            Notify Friends and Family
          </label>
        </div>

        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (busy) return;
            if (event.dataTransfer.files?.length) {
              void uploadFiles(event.dataTransfer.files);
            }
          }}
          className="mt-2 rounded-md bg-[#141d2d] px-3 py-4 text-center text-[12px] text-slate-300"
        >
          Drag photos here or use Upload Photos.
        </div>

        {status ? <p className="mt-2 text-[11px] text-slate-300">{status}</p> : null}
      </article>

      {activeAlbum ? (
        <article className="rounded-md bg-[#111a2a] p-2">
          {selectedCount > 0 ? (
            <div className="mb-2 flex items-center justify-between rounded bg-[#141d2d] px-2 py-1 text-[12px] text-slate-300">
              <span>{selectedCount} selected</span>
              <button
                type="button"
                className="text-red-300 hover:underline"
                onClick={async () => {
                  const ids = Object.entries(selectedPhotoIds)
                    .filter(([, selected]) => selected)
                    .map(([id]) => id);
                  for (const id of ids) {
                    await deletePhoto(id);
                  }
                }}
              >
                Delete selected
              </button>
            </div>
          ) : null}

          {visiblePhotos.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 min-[1750px]:grid-cols-5 min-[2200px]:grid-cols-6">
              {visiblePhotos.map((photo) => {
                const selected = Boolean(selectedPhotoIds[photo.id]);
                const starred = Boolean(starredPhotoIds[photo.id]);

                return (
                  <article key={photo.id} className="group space-y-1">
                    <div
                      role="button"
                      tabIndex={0}
                      className="relative block aspect-square w-full overflow-hidden rounded-md bg-[#141d2d] text-left"
                      onClick={() => setOpenPhotoId(photo.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setOpenPhotoId(photo.id);
                        }
                      }}
                      draggable
                      onDragStart={(event) => {
                        setDragUrl(photo.url);
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData(DRAG_URL_MIME, photo.url);
                        event.dataTransfer.setData("text/plain", photo.url);
                      }}
                    >
                      <Image src={photo.url} alt={photo.caption || "Gallery photo"} width={700} height={700} className="h-full w-full object-cover" />

                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent opacity-0 transition group-hover:opacity-100" />

                      <div className="absolute left-1.5 top-1.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            event.stopPropagation();
                            const nextChecked = event.currentTarget.checked;
                            setSelectedPhotoIds((previous) => ({ ...previous, [photo.id]: nextChecked }));
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>

                      <div className="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          className="rounded bg-black/50 px-1 text-[10px] text-white"
                          onClick={(event) => {
                            event.stopPropagation();
                            setStarredPhotoIds((previous) => ({ ...previous, [photo.id]: !previous[photo.id] }));
                          }}
                          title="Favorite"
                        >
                          {starred ? "★" : "☆"}
                        </button>
                        <button
                          type="button"
                          className="rounded bg-black/50 px-1 text-[10px] text-white"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deletePhoto(photo.id);
                          }}
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {photo.caption ? (
                      <p className="truncate px-0.5 text-[11px] text-slate-300">{photo.caption}</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="px-1 py-8 text-center text-sm text-slate-400">No photos yet in this album.</p>
          )}
        </article>
      ) : (
        <div className="rounded-md bg-[#111a2a] p-3 text-sm text-slate-400">No albums yet. Create one and upload photos.</div>
      )}

      {openPhoto ? (
        <div className="fixed inset-0 z-50 bg-black/75 p-3 md:p-6" onClick={() => setOpenPhotoId(null)}>
          <div
            className="mx-auto grid h-full max-w-[1320px] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-lg bg-[#0f1727] md:grid-cols-[minmax(0,1fr)_360px]"
            onClick={(event) => event.stopPropagation()}
          >
            <section className="relative flex min-h-[360px] items-center justify-center bg-[#0a1120]">
              <Image
                src={openPhoto.url}
                alt={openPhoto.caption || "Gallery photo"}
                width={1200}
                height={900}
                className={`h-full w-full ${zoomed ? "object-cover" : "object-contain"}`}
              />

              {openPhotoIndex > 0 ? (
                <button
                  type="button"
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded bg-black/45 px-2 py-1 text-sm text-white"
                  onClick={() => setOpenPhotoId(visiblePhotos[openPhotoIndex - 1]?.id ?? null)}
                >
                  ◀
                </button>
              ) : null}

              {openPhotoIndex < visiblePhotos.length - 1 ? (
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-black/45 px-2 py-1 text-sm text-white"
                  onClick={() => setOpenPhotoId(visiblePhotos[openPhotoIndex + 1]?.id ?? null)}
                >
                  ▶
                </button>
              ) : null}

              <button
                type="button"
                className="absolute right-3 top-3 rounded bg-black/45 px-2 py-1 text-[12px] text-white"
                onClick={() => setZoomed((value) => !value)}
              >
                {zoomed ? "Fit" : "Zoom"}
              </button>
            </section>

            <aside className="flex h-full flex-col overflow-auto border-l border-[var(--border)] bg-[#111a2a] p-3">
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">Photo Details</h2>
              <p className="text-[11px] text-slate-400">Uploaded {formatStableDate(openPhoto.createdAt)}</p>

              <label className="mt-2 text-[11px] text-slate-300">
                Caption
                <textarea value={modalCaption} onChange={(event) => setModalCaption(event.target.value)} className="mt-1 h-16 w-full rounded border px-2 py-1 text-[12px]" />
              </label>

              <label className="mt-2 text-[11px] text-slate-300">
                Tags
                <input value={modalTags} onChange={(event) => setModalTags(event.target.value)} placeholder="portrait, travel" className="mt-1 w-full rounded border px-2 py-1 text-[12px]" />
              </label>

              <label className="mt-2 text-[11px] text-slate-300">
                Album
                <select value={modalAlbumId} onChange={(event) => setModalAlbumId(event.target.value)} className="mt-1 w-full rounded border px-2 py-1 text-[12px]">
                  {albums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-2 text-[11px] text-slate-300">
                Visibility
                <select value={modalVisibility} onChange={(event) => setModalVisibility(event.target.value as Visibility)} className="mt-1 w-full rounded border px-2 py-1 text-[12px]">
                  <option value="PUBLIC">Public</option>
                  <option value="FRIENDS_FAMILY">Friends & Family</option>
                  <option value="PRIVATE">Private</option>
                </select>
              </label>

              <div className="mt-2 flex items-center gap-3 text-[12px]">
                <button type="button" className="hover:underline" onClick={() => void saveModalMetadata()}>
                  Save
                </button>
                <button
                  type="button"
                  className="text-red-300 hover:underline"
                  onClick={() => {
                    void deletePhoto(openPhoto.id);
                  }}
                >
                  Delete
                </button>
              </div>

              <div className="mt-3 border-t border-[var(--border)] pt-2">
                <h3 className="text-[12px] font-semibold text-[var(--text-strong)]">Comments</h3>
                <div className="mt-2 space-y-2">{openPhotoCommentTree.map((node) => renderCommentNode(node))}</div>
                {!openPhotoCommentTree.length ? <p className="mt-2 text-[11px] text-slate-400">No comments yet.</p> : null}

                {modalReplyToId ? (
                  <p className="mt-2 text-[11px] text-slate-300">
                    Replying in thread.
                    <button type="button" className="ml-2 hover:underline" onClick={() => setModalReplyToId(null)}>
                      Cancel
                    </button>
                  </p>
                ) : null}

                <div className="mt-2 space-y-1">
                  <textarea
                    ref={commentInputRef}
                    value={modalComment}
                    onChange={(event) => setModalComment(event.target.value)}
                    placeholder="Write reply... Use @username to mention"
                    className="h-16 w-full rounded border px-2 py-1 text-[12px]"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded border border-[#3d4e6d] bg-[#1a2335] px-2 py-1 text-[11px] text-slate-200 hover:bg-[#243149]">
                      {modalCommentUploading ? "Uploading..." : "Add photo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className="hidden"
                        disabled={modalCommentUploading}
                        onChange={(event) => {
                          void uploadCommentMedia(event.currentTarget.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {modalCommentMediaUrls.length ? (
                      <button type="button" className="text-[11px] text-slate-300 hover:underline" onClick={() => setModalCommentMediaUrls([])}>
                        Clear media
                      </button>
                    ) : null}
                  </div>
                  {modalCommentMediaUrls.length ? (
                    <div className="grid grid-cols-4 gap-2">
                      {modalCommentMediaUrls.map((url, index) => (
                        <div key={`${url}-${index}`} className="relative">
                          <Image src={url} alt="Reply upload" width={180} height={180} className="h-14 w-full rounded object-cover" />
                          <button
                            type="button"
                            className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white"
                            onClick={() => setModalCommentMediaUrls((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <button type="button" className="text-[12px] hover:underline" onClick={() => void submitComment()}>
                    Post Reply
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </section>
  );
}
