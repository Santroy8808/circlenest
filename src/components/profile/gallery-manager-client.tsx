"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { uploadImageWithCompression, type UploadImageOptions } from "@/lib/media/image-upload.client";
import { CommentThread } from "@/components/comments/comment-thread";

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
  parentAlbumId?: string | null;
  createdAt: string | Date;
  photos: GalleryPhoto[];
  albumTags?: { tag: { id: string; name: string } }[];
};

type UploadProgressState = {
  phase: "preparing" | "uploading" | "saving";
  total: number;
  completed: number;
  currentName: string | null;
};

const DRAG_URL_MIME = "application/x-theta-space-photo-url";

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
  initialLimitBytes,
}: {
  initialAlbums: GalleryAlbum[];
  initialAvatarUrl: string | null;
  initialBannerUrl: string | null;
  initialUserTags: string[];
  initialGroups: GroupOption[];
  initialUsageBytes: number;
  initialLimitBytes: number;
}) {
  const shellCardClass = "rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]";
  const insetCardClass = "rounded-[14px] border border-[var(--border)] bg-[#111a2a] p-3";
  const inputClass = "rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)]/50";
  const ghostButtonClass = "rounded-full border border-[#304058] px-4 py-2 text-sm text-slate-200 transition hover:border-[#4a5a78] hover:text-white";
  const primaryButtonClass = "rounded-full bg-[#376ef8] px-4 py-2 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:shadow-[0_10px_24px_rgba(55,110,248,0.28)]";
  const [albums, setAlbums] = useState(initialAlbums);
  const [activeAlbumId, setActiveAlbumId] = useState(initialAlbums[0]?.id ?? "");
  const [viewMode, setViewMode] = useState<"albums" | "album">("albums");
  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  const [newAlbumParentId, setNewAlbumParentId] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [notifyFriendsAndFamily, setNotifyFriendsAndFamily] = useState(true);
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [albumVisibility, setAlbumVisibility] = useState<AlbumVisibility>("PUBLIC");
  const [albumShareGroupIds, setAlbumShareGroupIds] = useState<string[]>([]);
  const [albumTagNames, setAlbumTagNames] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("ALL");
  const [userTags, setUserTags] = useState<string[]>(initialUserTags);
  const [groups] = useState<GroupOption[]>(initialGroups);
  const [usageBytes, setUsageBytes] = useState<number>(initialUsageBytes);
  const [storageLimitBytes, setStorageLimitBytes] = useState<number>(initialLimitBytes);
  const [sortMode, setSortMode] = useState<"newest" | "oldest">("newest");
  const [showTools, setShowTools] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);

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
  const [zoomed, setZoomed] = useState(false);

  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const allPhotos = useMemo(() => flattenPhotos(albums), [albums]);
  const activeAlbum = useMemo(
    () => albums.find((album) => album.id === activeAlbumId) ?? albums[0] ?? null,
    [albums, activeAlbumId],
  );

  const visiblePhotos = useMemo(() => {
    if (!activeAlbum) return [];
    const albumTagMatches = tagFilter !== "ALL" && parseAlbumTagNames(activeAlbum).includes(tagFilter);
    const filtered = tagFilter === "ALL"
      ? activeAlbum.photos
      : activeAlbum.photos.filter((photo) => albumTagMatches || parsePhotoTagNames(photo).includes(tagFilter));
    const sorted = [...filtered].sort((a, b) => {
      const delta = toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime();
      return sortMode === "newest" ? -delta : delta;
    });
    return sorted;
  }, [activeAlbum, sortMode, tagFilter]);

  const availableTagFilters = useMemo(() => {
    const names = new Set<string>();
    for (const tag of userTags) names.add(tag);
    if (activeAlbum) {
      for (const tag of parseAlbumTagNames(activeAlbum)) names.add(tag);
      for (const photo of activeAlbum.photos) {
        for (const tag of parsePhotoTagNames(photo)) names.add(tag);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [activeAlbum, userTags]);

  const visiblePhotoGroups = useMemo(() => {
    const groups: Array<{ label: string; photos: GalleryPhoto[] }> = [];
    for (const photo of visiblePhotos) {
      const label = formatStableDate(photo.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.photos.push(photo);
      } else {
        groups.push({ label, photos: [photo] });
      }
    }
    return groups;
  }, [visiblePhotos]);

  const openPhoto = useMemo(() => allPhotos.find((photo) => photo.id === openPhotoId) ?? null, [allPhotos, openPhotoId]);

  const openPhotoIndex = useMemo(() => {
    if (!openPhoto) return -1;
    return visiblePhotos.findIndex((photo) => photo.id === openPhoto.id);
  }, [openPhoto, visiblePhotos]);

  const selectedCount = useMemo(
    () => Object.values(selectedPhotoIds).filter(Boolean).length,
    [selectedPhotoIds],
  );

  const storageUsedMb = useMemo(() => (usageBytes / (1024 * 1024)).toFixed(2), [usageBytes]);
  const storageLimitLabel = useMemo(() => {
    if (storageLimitBytes >= Number.MAX_SAFE_INTEGER / 2) return "Unlimited";
    return `${(storageLimitBytes / (1024 * 1024)).toFixed(0)}MB`;
  }, [storageLimitBytes]);
  const storagePercent = useMemo(
    () => (storageLimitBytes >= Number.MAX_SAFE_INTEGER / 2 ? 0 : Math.min(100, Math.round((usageBytes / storageLimitBytes) * 100))),
    [usageBytes, storageLimitBytes],
  );

  useEffect(() => {
    if (!activeAlbum) return;
    setAlbumVisibility(normalizeAlbumVisibility(activeAlbum.visibility));
    setAlbumShareGroupIds(parseShareGroupIds(activeAlbum.shareGroupIds));
    const tags = parseAlbumTagNames(activeAlbum);
    setAlbumTagNames(tags);
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
    const body = (await res.json()) as { usedBytes?: number; limitBytes?: number };
    setUsageBytes(body.usedBytes ?? 0);
    if (typeof body.limitBytes === "number") {
      setStorageLimitBytes(body.limitBytes);
    }
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
    setShowTools(true);
    setUploadProgress({
      phase: "preparing",
      total: list.length,
      completed: 0,
      currentName: list[0]?.name ?? null,
    });
    setStatus(`Preparing ${list.length} photo${list.length === 1 ? "" : "s"}...`);

    let targetAlbum = activeAlbum;
    if (!targetAlbum) {
      const createdAlbumRes = await fetch("/api/gallery/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "stream_photos", visibility: albumVisibility, shareGroupIds: albumShareGroupIds, tagNames: albumTagNames, parentAlbumId: newAlbumParentId || null }),
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

    const urls: string[] = [];
    for (const [index, file] of list.entries()) {
      setUploadProgress({
        phase: "uploading",
        total: list.length,
        completed: index,
        currentName: file.name,
      });
      setStatus(`Uploading ${index + 1} of ${list.length}: ${file.name}`);
      const uploaded = await uploadOne(file, {
        purpose: "gallery-photo",
        albumId: targetAlbum!.id,
      });
      if (uploaded) urls.push(uploaded);
      setUploadProgress({
        phase: "uploading",
        total: list.length,
        completed: index + 1,
        currentName: file.name,
      });
    }

    if (!urls.length) {
      setBusy(false);
      setUploadProgress(null);
      setStatus("Upload failed.");
      return;
    }

    setUploadProgress({
      phase: "saving",
      total: list.length,
      completed: urls.length,
      currentName: null,
    });
    setStatus(`Saving ${urls.length} uploaded photo${urls.length === 1 ? "" : "s"}...`);
    const saveRes = await fetch("/api/gallery/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumId: targetAlbum.id,
        urls,
        notifyFriendsAndFamily,
        visibility,
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
      setUploadProgress(null);
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
    setUploadProgress(null);
    setStatus(`Uploaded ${createdPhotos.length} of ${list.length} photo${list.length === 1 ? "" : "s"}.`);
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
        parentAlbumId: newAlbumParentId || null,
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
    setUserTags((previous) => Array.from(new Set([...previous, trimmed])).sort((a, b) => a.localeCompare(b)));
  }

  function removeAlbumTag(name: string) {
    setAlbumTagNames((previous) => previous.filter((entry) => entry !== name));
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
        parentAlbumId: newAlbumParentId || null,
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
            <Image src={avatarUrl} alt="Avatar" width={420} height={420} unoptimized className="aspect-square h-full w-full object-cover" />
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
            <Image src={bannerUrl} alt="Banner" width={1400} height={560} unoptimized className="h-full min-h-[220px] w-full object-cover" />
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

      <article className={shellCardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-strong)]">Photos</h1>
            <p className="text-sm text-slate-400">{activeAlbum?.title ?? "Gallery"}</p>
            <p className="text-xs text-slate-400">
              {activeAlbum?.photos.length ?? 0} photos{updatedAt ? ` • Updated ${formatStableDate(new Date(updatedAt))}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={primaryButtonClass} onClick={() => setShowTools(true)}>
              Upload
            </button>
            <label className="flex items-center gap-1 text-[12px] text-slate-300">
              Sort
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as "newest" | "oldest")} className={inputClass}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-[12px] text-slate-300">
              Album
              <select value={activeAlbum?.id ?? ""} onChange={(event) => setActiveAlbumId(event.target.value)} className={inputClass}>
                {albums.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[12px] text-slate-300">
              Tag
              <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className={inputClass}>
                <option value="ALL">All tags</option>
                {availableTagFilters.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
            {tagFilter !== "ALL" ? (
              <button type="button" className={ghostButtonClass} onClick={() => setTagFilter("ALL")}>
                Clear tag
              </button>
            ) : null}
            <button type="button" className={ghostButtonClass} onClick={() => setShowTools((value) => !value)}>
              {showTools ? "Hide tools" : "Manage"}
            </button>
          </div>
        </div>
        {uploadProgress ? (
          <div className="mt-4 rounded-[14px] border border-[#2b3850] bg-[#111a2a] px-3 py-3">
            <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
              <span>
                {uploadProgress.phase === "preparing"
                  ? "Preparing upload"
                  : uploadProgress.phase === "saving"
                    ? "Saving photos"
                    : `Uploading ${uploadProgress.completed} of ${uploadProgress.total}`}
              </span>
              <span className="text-xs text-slate-400">
                {uploadProgress.completed}/{uploadProgress.total}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#1a2538]">
              <div
                className="h-full rounded-full bg-[#376ef8] transition-all duration-300"
                style={{
                  width: `${Math.max(
                    uploadProgress.phase === "saving"
                      ? 96
                      : Math.round((uploadProgress.completed / Math.max(uploadProgress.total, 1)) * 100),
                    8,
                  )}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {uploadProgress.currentName ?? "Finalizing your upload..."}
            </p>
          </div>
        ) : status ? (
          <p className="mt-4 text-sm text-slate-300">{status}</p>
        ) : null}
      </article>

      {showTools ? (
        <article className={shellCardClass}>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="gallery-upload-input" className={`${primaryButtonClass} cursor-pointer`}>
              Choose photos
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
            <button type="button" className={ghostButtonClass} onClick={() => void shareAlbum()}>
              Share album
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-[14px] border border-[#273449] bg-[#111a2a] p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">Create album</p>
              <div className="grid gap-2">
                <input
                  value={newAlbumTitle}
                  onChange={(event) => setNewAlbumTitle(event.target.value)}
                  placeholder="New album"
                  className={inputClass}
                />
                <select value={newAlbumParentId} onChange={(event) => setNewAlbumParentId(event.target.value)} className={inputClass}>
                  <option value="">No parent album</option>
                  {albums.map((album) => (
                    <option key={album.id} value={album.id}>{album.title}</option>
                  ))}
                </select>
                <button type="button" className={ghostButtonClass} onClick={() => void createAlbum()}>
                  Create
                </button>
              </div>
            </div>

            <div className="rounded-[14px] border border-[#273449] bg-[#111a2a] p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">Upload settings</p>
              <div className="grid gap-3">
                <div className="rounded-[12px] border border-[#2b3850] bg-[#0f1624] px-3 py-2 text-[11px] text-slate-300">
                  Storage: {storageUsedMb}MB / {storageLimitLabel}
                  {storagePercent > 0 ? ` (${storagePercent}%)` : ""}
                </div>
                <label className="flex items-center gap-2 text-[12px] text-slate-300">
                  <input type="checkbox" checked={notifyFriendsAndFamily} onChange={(event) => setNotifyFriendsAndFamily(event.target.checked)} />
                  Notify Friends and Family
                </label>
                <label className="flex items-center gap-2 text-[12px] text-slate-300">
                  Visibility
                  <select value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)} className={inputClass}>
                    <option value="PUBLIC">Public</option>
                    <option value="FRIENDS_FAMILY">Friends & Family</option>
                    <option value="PRIVATE">Private</option>
                  </select>
                </label>
                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (busy) return;
                    if (event.dataTransfer.files?.length) {
                      void uploadFiles(event.dataTransfer.files);
                    }
                  }}
                  className="rounded-[16px] border border-dashed border-[#304058] bg-[#111a2a] px-3 py-5 text-center text-[12px] text-slate-300"
                >
                  Drag photos here or choose photos.
                </div>
              </div>
            </div>
          </div>

          {activeAlbum ? (
            <div className="mt-3 rounded-[14px] border border-[#273449] bg-[#111a2a] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">Album tags</p>
                <button type="button" className={ghostButtonClass} onClick={() => void saveAlbumProperties()}>
                  Save album tags
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {albumTagNames.length ? (
                  albumTagNames.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="rounded-full border border-[#304058] bg-[#0f1624] px-3 py-1 text-xs text-slate-200"
                      onClick={() => removeAlbumTag(tag)}
                    >
                      {tag} x
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">No album tags yet.</p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={newTagName}
                  onChange={(event) => setNewTagName(event.target.value)}
                  placeholder="Add album tag"
                  className={`${inputClass} min-w-[180px]`}
                />
                <button
                  type="button"
                  className={ghostButtonClass}
                  onClick={() => {
                    addAlbumTagByName(newTagName);
                    setNewTagName("");
                  }}
                >
                  Add tag
                </button>
                {userTags.length ? (
                  <select
                    defaultValue=""
                    className={inputClass}
                    onChange={(event) => {
                      if (!event.target.value) return;
                      addAlbumTagByName(event.target.value);
                      event.target.value = "";
                    }}
                  >
                    <option value="">Use existing tag</option>
                    {userTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>
          ) : null}
        </article>
      ) : null}

      {activeAlbum ? (
        <article className={shellCardClass}>
          {selectedCount > 0 ? (
            <div className="mb-3 flex items-center justify-between rounded-[14px] border border-[#2e3c55] bg-[#111a2a] px-3 py-2 text-[12px] text-slate-300">
              <span>{selectedCount} selected</span>
              <button
                type="button"
                className="rounded-full border border-red-400/60 px-3 py-1.5 text-red-200 transition hover:border-red-300 hover:text-white"
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
            <div className="space-y-5">
              {visiblePhotoGroups.map((group) => (
                <section key={group.label} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-[#273449]" />
                    <p className="text-[11px] uppercase tracking-[0.22em] text-amber-200">{group.label}</p>
                    <div className="h-px flex-1 bg-[#273449]" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {group.photos.map((photo) => {
                      const selected = Boolean(selectedPhotoIds[photo.id]);
                      const starred = Boolean(starredPhotoIds[photo.id]);

                      return (
                        <article key={photo.id} className="group space-y-1">
                          <div
                            role="button"
                            tabIndex={0}
                            className="relative block aspect-square w-full overflow-hidden rounded-[16px] border border-[#273449] bg-[#141d2d] text-left"
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
                            <Image src={photo.url} alt={photo.caption || "Gallery photo"} width={700} height={700} unoptimized className="h-full w-full object-cover" />

                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent opacity-0 transition group-hover:opacity-100" />

                            <div className="absolute left-2 top-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
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

                            <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                              <button
                                type="button"
                                className="rounded-full border border-white/20 bg-black/50 px-2 text-[10px] text-white"
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
                                className="rounded-full border border-white/20 bg-black/50 px-2 text-[10px] text-white"
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
                </section>
              ))}
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-[#2d3b52] bg-[#111a2a] p-8 text-center">
              <p className="text-lg font-semibold text-[var(--text-strong)]">No photos yet</p>
              <p className="mt-1 text-sm text-slate-400">Upload your first photo to get started.</p>
            </div>
          )}
        </article>
      ) : (
        <div className="rounded-[16px] border border-dashed border-[#2d3b52] bg-[#111a2a] p-8 text-center text-sm text-slate-400">No albums yet. Upload your first photo to get started.</div>
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
                  className="rounded-full border border-red-400/60 px-3 py-1.5 text-red-200 transition hover:border-red-300 hover:text-white"
                  onClick={() => {
                    void deletePhoto(openPhoto.id);
                  }}
                >
                  Delete
                </button>
              </div>

              <div className="mt-3 border-t border-[var(--border)] pt-2">
                <h3 className="text-[12px] font-semibold text-[var(--text-strong)]">Comments</h3>
                <div className="mt-2">
                  <CommentThread
                    comments={openPhoto?.comments ?? []}
                    compact
                    emptyText="No comments yet."
                    renderMeta={(comment) => formatRelativeDate(comment.createdAt)}
                    onReply={(comment) => {
                      setModalReplyToId(comment.id);
                      setModalComment((previous) => (previous.trim().length > 0 ? previous : `@${comment.author.username} `));
                      commentInputRef.current?.focus();
                    }}
                    renderActions={(comment) => {
                      const reactions = commentReactions[comment.id] ?? {};
                      return (
                        <>
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() =>
                              setCommentReactions((previous) => ({
                                ...previous,
                                [comment.id]: { ...previous[comment.id], "👍": (previous[comment.id]?.["👍"] ?? 0) + 1 },
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
                                [comment.id]: { ...previous[comment.id], "❤️": (previous[comment.id]?.["❤️"] ?? 0) + 1 },
                              }))
                            }
                          >
                            ❤️ {reactions["❤️"] ?? 0}
                          </button>
                        </>
                      );
                    }}
                  />
                </div>

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
                          <Image src={url} alt="Reply upload" width={180} height={180} unoptimized className="h-14 w-full rounded object-cover" />
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



















