"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommentThread } from "@/components/comments/comment-thread";
import { GalleryUploadSurfaceClient } from "@/components/profile/gallery-upload-surface-client";
import { buildPhotoSystemTags, parseDateTagQuery } from "@/lib/gallery/system-tags";
import { uploadImageWithCompression, type UploadImageOptions } from "@/lib/media/image-upload.client";

type Visibility = "PUBLIC" | "FRIENDS_FAMILY" | "PRIVATE";

type GalleryComment = {
  id: string;
  parentCommentId: string | null;
  content: string;
  mediaUrlsJson?: string | null;
  createdAt: string | Date;
  author: { username: string; fullName?: string | null };
};

type GalleryAlbum = {
  id: string;
  title: string;
  visibility?: string;
  shareGroupIds?: string | null;
  parentAlbumId?: string | null;
  createdAt: string | Date;
  albumTags?: { tag: { id: string; name: string } }[];
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
  album: { id: string; title: string };
};

type GalleryUploadResultPayload = {
  album: { id: string; title: string };
  photos: Array<Omit<GalleryPhoto, "album">>;
};

type GalleryQuery = {
  search: string;
  from: string;
  to: string;
  albumId: string;
  scope: "recent" | "all";
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

function normalizeVisibility(value: string | null | undefined): Visibility {
  if (value === "PRIVATE" || value === "FRIENDS_FAMILY") return value;
  return "PUBLIC";
}

function parsePhotoTagNames(photo: GalleryPhoto | null | undefined): string[] {
  if (!photo) return [];
  if (photo.photoTags?.length) return photo.photoTags.map((entry) => entry.tag.name);
  return parseTags(photo.tags);
}

function mergeSearchableTags(photo: GalleryPhoto) {
  return Array.from(new Set([...parsePhotoTagNames(photo), ...buildPhotoSystemTags(photo.createdAt)]));
}

function hydrateUploadedPhoto(photo: Omit<GalleryPhoto, "album">, album: { id: string; title: string }): GalleryPhoto {
  return { ...photo, album };
}

function mergeUploadedPhotos(previous: GalleryPhoto[], payload: GalleryUploadResultPayload): GalleryPhoto[] {
  const incoming = payload.photos.map((photo) => hydrateUploadedPhoto(photo, payload.album));
  const seen = new Set<string>();
  return [...incoming, ...previous]
    .filter((photo) => {
      if (seen.has(photo.id)) return false;
      seen.add(photo.id);
      return true;
    })
    .sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());
}

function parseDateInputFloor(raw: string) {
  if (!raw.trim()) return null;
  const date = new Date(`${raw.trim()}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateInputCeil(raw: string) {
  if (!raw.trim()) return null;
  const date = new Date(`${raw.trim()}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function photoMatchesFilters(photo: GalleryPhoto, filters: GalleryQuery) {
  if (filters.albumId && photo.albumId !== filters.albumId) return false;

  const photoDate = toDate(photo.createdAt);
  if (filters.from) {
    const floor = parseDateInputFloor(filters.from);
    if (floor && photoDate.getTime() < floor.getTime()) return false;
  }
  if (filters.to) {
    const ceil = parseDateInputCeil(filters.to);
    if (ceil && photoDate.getTime() > ceil.getTime()) return false;
  }

  const search = filters.search.trim().toLowerCase();
  if (!search) return true;

  const dateSearch = parseDateTagQuery(search);
  if (dateSearch) {
    return photoDate.getTime() >= dateSearch.start.getTime() && photoDate.getTime() <= dateSearch.end.getTime();
  }

  const haystack = [
    photo.caption ?? "",
    photo.album.title,
    ...mergeSearchableTags(photo),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
}

function buildGalleryQueryString(filters: GalleryQuery) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.from.trim()) params.set("from", filters.from.trim());
  if (filters.to.trim()) params.set("to", filters.to.trim());
  if (filters.albumId.trim()) params.set("album", filters.albumId.trim());
  if (filters.scope === "all") params.set("scope", "all");
  return params.toString();
}

export function GalleryManagerClient({
  initialAlbums,
  initialPhotos,
  initialUserTags,
  initialAvatarUrl,
  initialBannerUrl,
  initialQuery,
  hasMoreHistory,
}: {
  initialAlbums: GalleryAlbum[];
  initialPhotos: GalleryPhoto[];
  initialUserTags: string[];
  initialAvatarUrl: string | null;
  initialBannerUrl: string | null;
  initialQuery: GalleryQuery;
  hasMoreHistory: boolean;
}) {
  const shellCardClass = "rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]";
  const inputClass = "rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)]/50";
  const ghostButtonClass = "rounded-full border border-[#304058] px-4 py-2 text-sm text-slate-200 transition hover:border-[#4a5a78] hover:text-white";
  const primaryButtonClass = "rounded-full bg-[#376ef8] px-4 py-2 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:shadow-[0_10px_24px_rgba(55,110,248,0.28)]";

  const router = useRouter();
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const mediaButtonTimerRef = useRef<number | null>(null);
  const lastSelectionAnchorRef = useRef<number | null>(null);

  const [albums, setAlbums] = useState(initialAlbums);
  const [photos, setPhotos] = useState(initialPhotos);
  const [status, setStatus] = useState("");
  const [sortMode, setSortMode] = useState<"newest" | "oldest">("newest");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Record<string, boolean>>({});
  const [showOrganizer, setShowOrganizer] = useState(false);
  const [organizerAlbumMode, setOrganizerAlbumMode] = useState<string>("");
  const [organizerNewAlbumTitle, setOrganizerNewAlbumTitle] = useState("");
  const [organizerTags, setOrganizerTags] = useState("");
  const [organizerBusy, setOrganizerBusy] = useState(false);

  const [searchDraft, setSearchDraft] = useState(initialQuery.search);
  const [fromDraft, setFromDraft] = useState(initialQuery.from);
  const [toDraft, setToDraft] = useState(initialQuery.to);
  const [albumDraft, setAlbumDraft] = useState(initialQuery.albumId);

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
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(initialAvatarUrl);
  const [currentBannerUrl, setCurrentBannerUrl] = useState(initialBannerUrl);
  const [mediaButtonFeedback, setMediaButtonFeedback] = useState<null | "avatar" | "banner">(null);

  const filteredPhotos = useMemo(() => {
    const next = photos.filter((photo) => photoMatchesFilters(photo, initialQuery));
    next.sort((a, b) => {
      const delta = toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime();
      return sortMode === "newest" ? -delta : delta;
    });
    return next;
  }, [initialQuery, photos, sortMode]);

  const visiblePhotoGroups = useMemo(() => {
    const groups: Array<{ label: string; photos: GalleryPhoto[] }> = [];
    for (const photo of filteredPhotos) {
      const label = formatStableDate(photo.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.photos.push(photo);
      } else {
        groups.push({ label, photos: [photo] });
      }
    }
    return groups;
  }, [filteredPhotos]);

  const selectedCount = useMemo(() => Object.values(selectedPhotoIds).filter(Boolean).length, [selectedPhotoIds]);
  const openPhoto = useMemo(() => photos.find((photo) => photo.id === openPhotoId) ?? null, [openPhotoId, photos]);
  const openPhotoIndex = useMemo(() => {
    if (!openPhoto) return -1;
    return filteredPhotos.findIndex((photo) => photo.id === openPhoto.id);
  }, [filteredPhotos, openPhoto]);

  useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos]);

  useEffect(() => {
    setAlbums(initialAlbums);
  }, [initialAlbums]);

  useEffect(() => {
    setCurrentAvatarUrl(initialAvatarUrl);
  }, [initialAvatarUrl]);

  useEffect(() => {
    setCurrentBannerUrl(initialBannerUrl);
  }, [initialBannerUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem("theta-gallery-upload-result");
    if (!raw) return;
    window.sessionStorage.removeItem("theta-gallery-upload-result");

    try {
      const payload = JSON.parse(raw) as GalleryUploadResultPayload;
      if (!payload?.album?.id || !Array.isArray(payload.photos) || payload.photos.length === 0) return;
      setAlbums((previous) =>
        previous.some((album) => album.id === payload.album.id)
          ? previous
          : [{ id: payload.album.id, title: payload.album.title, createdAt: new Date().toISOString() }, ...previous],
      );
      setPhotos((previous) => mergeUploadedPhotos(previous, payload));
      setStatus(payload.photos.length === 1 ? "Photo uploaded." : `${payload.photos.length} photos uploaded.`);
    } catch {
      // Ignore invalid upload cache payloads.
    }
  }, []);

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
    if (!openPhoto || !modalReplyToId) return;
    commentInputRef.current?.focus();
  }, [openPhoto, modalReplyToId]);

  useEffect(() => {
    return () => {
      if (mediaButtonTimerRef.current) {
        window.clearTimeout(mediaButtonTimerRef.current);
      }
    };
  }, []);

  function updatePhotoLocally(photoId: string, updater: (photo: GalleryPhoto) => GalleryPhoto) {
    setPhotos((previous) => previous.map((photo) => (photo.id === photoId ? updater(photo) : photo)));
  }

  function mergeUpdatedPhotos(updatedPhotos: GalleryPhoto[]) {
    const byId = new Map(updatedPhotos.map((photo) => [photo.id, photo]));
    setPhotos((previous) => previous.map((photo) => byId.get(photo.id) ?? photo));
  }

  function removePhotoLocally(photoId: string) {
    setPhotos((previous) => previous.filter((photo) => photo.id !== photoId));
    setSelectedPhotoIds((previous) => {
      const copy = { ...previous };
      delete copy[photoId];
      return copy;
    });
    if (openPhotoId === photoId) setOpenPhotoId(null);
  }

  async function deletePhoto(photoId: string) {
    const res = await fetch(`/api/gallery/photos/${photoId}`, { method: "DELETE" });
    if (!res.ok) {
      setStatus("Could not delete photo.");
      return;
    }
    removePhotoLocally(photoId);
    setStatus("Photo deleted.");
  }

  async function deleteSelectedPhotos() {
    const ids = Object.entries(selectedPhotoIds)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
    if (!ids.length) return;
    await Promise.all(ids.map((id) => deletePhoto(id)));
    setSelectedPhotoIds({});
    setShowOrganizer(false);
  }

  async function assignPhotoAs(type: "avatar" | "banner") {
    if (!openPhoto) return;
    const payload = type === "avatar" ? { avatarUrl: openPhoto.url } : { bannerUrl: openPhoto.url };
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setStatus(`Could not update ${type}.`);
      return;
    }

    if (type === "avatar") {
      setCurrentAvatarUrl(openPhoto.url);
      window.dispatchEvent(new CustomEvent("theta-profile-media-updated", { detail: { avatarUrl: openPhoto.url } }));
    } else {
      setCurrentBannerUrl(openPhoto.url);
      window.dispatchEvent(new CustomEvent("theta-profile-media-updated", { detail: { bannerUrl: openPhoto.url } }));
    }

    setMediaButtonFeedback(type);
    if (mediaButtonTimerRef.current) {
      window.clearTimeout(mediaButtonTimerRef.current);
    }
    mediaButtonTimerRef.current = window.setTimeout(() => {
      setMediaButtonFeedback(null);
      mediaButtonTimerRef.current = null;
      router.refresh();
    }, 1400);

    setStatus(`${type === "avatar" ? "Avatar" : "Banner"} updated from this photo.`);
  }

  const avatarButtonLabel =
    mediaButtonFeedback === "avatar" ? "Done!" : openPhoto && currentAvatarUrl === openPhoto.url ? "Avatar pic" : "Set as avatar";
  const bannerButtonLabel =
    mediaButtonFeedback === "banner" ? "Done!" : openPhoto && currentBannerUrl === openPhoto.url ? "Banner pic" : "Set as banner";

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
    updatePhotoLocally(openPhoto.id, () => updated);
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
      const uploaded = (await Promise.all(Array.from(files).map((file) => uploadOne(file, { purpose: "post-media" })))).filter(
        (url): url is string => Boolean(url),
      );
      if (!uploaded.length) {
        setStatus("Could not upload comment media.");
        return;
      }
      setModalCommentMediaUrls((previous) => [...previous, ...uploaded].slice(0, 8));
    } finally {
      setModalCommentUploading(false);
    }
  }

  function applyFilters(nextScope: "recent" | "all" = initialQuery.scope) {
    const nextQuery = buildGalleryQueryString({
      search: searchDraft,
      from: fromDraft,
      to: toDraft,
      albumId: albumDraft,
      scope: nextScope,
    });
    router.push(nextQuery ? `/profile/gallery?${nextQuery}` : "/profile/gallery");
  }

  function clearFilters() {
    setSearchDraft("");
    setFromDraft("");
    setToDraft("");
    setAlbumDraft("");
    router.push("/profile/gallery");
  }

  function togglePhotoSelection(photoId: string, nextValue?: boolean) {
    setSelectedPhotoIds((previous) => {
      const isSelected = nextValue ?? !previous[photoId];
      const next = { ...previous };
      if (isSelected) next[photoId] = true;
      else delete next[photoId];
      return next;
    });
  }

  function handlePhotoCardClick(event: React.MouseEvent<HTMLDivElement>, photoId: string, index: number) {
    if (event.shiftKey && lastSelectionAnchorRef.current !== null) {
      const start = Math.min(lastSelectionAnchorRef.current, index);
      const end = Math.max(lastSelectionAnchorRef.current, index);
      const ids = filteredPhotos.slice(start, end + 1).map((photo) => photo.id);
      setSelectedPhotoIds((previous) => {
        const next = { ...previous };
        ids.forEach((id) => {
          next[id] = true;
        });
        return next;
      });
      setShowOrganizer(false);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      togglePhotoSelection(photoId);
      lastSelectionAnchorRef.current = index;
      setShowOrganizer(false);
      return;
    }

    lastSelectionAnchorRef.current = index;
    setOpenPhotoId(photoId);
  }

  async function applyOrganizerChanges() {
    const photoIds = Object.entries(selectedPhotoIds)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
    if (!photoIds.length || organizerBusy) return;

    const createAlbumTitle = organizerAlbumMode === "__new__" ? organizerNewAlbumTitle.trim() : "";
    const albumId = organizerAlbumMode && organizerAlbumMode !== "__new__" ? organizerAlbumMode : "";
    const tagNames = organizerTags
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!createAlbumTitle && !albumId && !tagNames.length) {
      setStatus("Pick an album or add at least one tag.");
      return;
    }

    setOrganizerBusy(true);
    try {
      const res = await fetch("/api/gallery/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoIds,
          albumId: albumId || undefined,
          createAlbumTitle: createAlbumTitle || undefined,
          tagNames,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { album?: { id: string; title: string } | null; photos?: GalleryPhoto[]; error?: string }
        | null;

      if (!res.ok || !body?.photos) {
        setStatus(body?.error ?? "Could not organize the selected photos.");
        return;
      }

      if (body.album) {
        const createdAlbum = body.album;
        setAlbums((previous) =>
          previous.some((album) => album.id === createdAlbum.id)
            ? previous
            : [{ id: createdAlbum.id, title: createdAlbum.title, createdAt: new Date().toISOString() }, ...previous],
        );
      }

      mergeUpdatedPhotos(body.photos);
      setSelectedPhotoIds({});
      setShowOrganizer(false);
      setOrganizerAlbumMode("");
      setOrganizerNewAlbumTitle("");
      setOrganizerTags("");
      setStatus(body.photos.length === 1 ? "Photo updated." : `${body.photos.length} photos organized.`);
    } finally {
      setOrganizerBusy(false);
    }
  }

  const visibleCountLabel =
    initialQuery.scope === "recent"
      ? `Showing the most recent ${filteredPhotos.length} photos first.`
      : `Showing ${filteredPhotos.length} photos from your gallery history.`;

  const currentUploadAlbumId = albumDraft || albums.find((album) => album.title === "My Pics")?.id || albums[0]?.id;
  const systemTagHint = openPhoto ? mergeSearchableTags(openPhoto).join(", ") : "";

  return (
    <section className="space-y-3">
      <article className={shellCardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-strong)]">Photos</h1>
            <p className="text-sm text-slate-400">One photo pool, organized by tags and albums when you need them.</p>
            <p className="text-xs text-slate-400">{visibleCountLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() => {
                if (typeof window !== "undefined" && window.matchMedia("(max-width: 699px)").matches) {
                  router.push("/profile/gallery/upload");
                  return;
                }
                setShowUploadModal(true);
              }}
            >
              Upload
            </button>
            {initialQuery.scope === "recent" && hasMoreHistory ? (
              <button type="button" className={ghostButtonClass} onClick={() => applyFilters("all")}>
                Expand history
              </button>
            ) : null}
            {initialQuery.scope === "all" ? (
              <button type="button" className={ghostButtonClass} onClick={() => applyFilters("recent")}>
                Recent only
              </button>
            ) : null}
          </div>
        </div>

        <form
          className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters(initialQuery.scope);
          }}
        >
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search tags, captions, or date:2026-06"
            className={inputClass}
          />
          <select value={albumDraft} onChange={(event) => setAlbumDraft(event.target.value)} className={inputClass}>
            <option value="">All albums</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.title}
              </option>
            ))}
          </select>
          <input type="date" value={fromDraft} onChange={(event) => setFromDraft(event.target.value)} className={inputClass} />
          <input type="date" value={toDraft} onChange={(event) => setToDraft(event.target.value)} className={inputClass} />
          <button type="submit" className={primaryButtonClass}>
            Search
          </button>
          <button type="button" className={ghostButtonClass} onClick={clearFilters}>
            Clear
          </button>
        </form>

        {status ? <p className="mt-4 text-sm text-slate-300">{status}</p> : null}
      </article>

      <article className={shellCardClass}>
        {selectedCount > 0 ? (
          <div className="mb-3 space-y-3 rounded-[14px] border border-[#2e3c55] bg-[#111a2a] px-3 py-3 text-[12px] text-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{selectedCount} selected</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={ghostButtonClass} onClick={() => setShowOrganizer((value) => !value)}>
                  Tag / album
                </button>
                <button type="button" className={ghostButtonClass} onClick={() => setSelectedPhotoIds({})}>
                  Clear selection
                </button>
                <button type="button" className="rounded-full border border-red-400/60 px-4 py-2 text-sm text-red-200 transition hover:border-red-300 hover:text-white" onClick={() => void deleteSelectedPhotos()}>
                  Delete selected
                </button>
              </div>
            </div>

            {showOrganizer ? (
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div className="space-y-2">
                  <select value={organizerAlbumMode} onChange={(event) => setOrganizerAlbumMode(event.target.value)} className={inputClass}>
                    <option value="">Keep current album</option>
                    {albums.map((album) => (
                      <option key={album.id} value={album.id}>
                        {album.title}
                      </option>
                    ))}
                    <option value="__new__">New album</option>
                  </select>
                  {organizerAlbumMode === "__new__" ? (
                    <input
                      value={organizerNewAlbumTitle}
                      onChange={(event) => setOrganizerNewAlbumTitle(event.target.value)}
                      placeholder="New album title"
                      className={inputClass}
                    />
                  ) : null}
                </div>
                <input
                  value={organizerTags}
                  onChange={(event) => setOrganizerTags(event.target.value)}
                  placeholder="Add tags, comma separated"
                  className={inputClass}
                />
                <button type="button" className={primaryButtonClass} disabled={organizerBusy} onClick={() => void applyOrganizerChanges()}>
                  {organizerBusy ? "Saving..." : "Apply"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {filteredPhotos.length ? (
          <div className="space-y-5">
            {visiblePhotoGroups.map((group) => (
              <section key={group.label} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-[#273449]" />
                  <p className="text-[11px] uppercase tracking-[0.22em] text-amber-200">{group.label}</p>
                  <div className="h-px flex-1 bg-[#273449]" />
                </div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.photos.map((photo) => {
                    const selected = Boolean(selectedPhotoIds[photo.id]);
                    const index = filteredPhotos.findIndex((entry) => entry.id === photo.id);

                    return (
                      <article key={photo.id} className="group space-y-1">
                        <div
                          role="button"
                          tabIndex={0}
                          className={`relative block aspect-square w-full overflow-hidden rounded-[16px] border bg-[#141d2d] text-left ${selected ? "border-[#5a8bff] ring-2 ring-[#5a8bff]/40" : "border-[#273449]"}`}
                          onClick={(event) => handlePhotoCardClick(event, photo.id, index)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setOpenPhotoId(photo.id);
                            }
                          }}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setData(DRAG_URL_MIME, photo.url);
                            event.dataTransfer.setData("text/plain", photo.url);
                          }}
                        >
                          <Image src={photo.url} alt={photo.caption || "Gallery photo"} width={700} height={700} unoptimized className="h-full w-full object-cover" />

                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 transition group-hover:opacity-100" />

                          <button
                            type="button"
                            className={`absolute left-2 top-2 rounded-full border px-2 py-1 text-[10px] ${selected ? "border-[#5a8bff] bg-[#376ef8] text-white" : "border-white/20 bg-black/50 text-white opacity-0 transition group-hover:opacity-100"}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              togglePhotoSelection(photo.id);
                              lastSelectionAnchorRef.current = index;
                            }}
                            title="Select photo"
                          >
                            {selected ? "Selected" : "Select"}
                          </button>

                          <button
                            type="button"
                            className="absolute right-2 top-2 rounded-full border border-white/20 bg-black/50 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deletePhoto(photo.id);
                            }}
                            title="Delete"
                          >
                            Delete
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2 px-0.5 text-[11px] text-slate-300">
                          <p className="truncate">{photo.caption || photo.album.title}</p>
                          <span className="truncate text-slate-500">{photo.album.title}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-[16px] border border-dashed border-[#2d3b52] bg-[#111a2a] p-8 text-center">
            <p className="text-lg font-semibold text-[var(--text-strong)]">No photos match those filters</p>
            <p className="mt-1 text-sm text-slate-400">Try another date range or search tag.</p>
          </div>
        )}
      </article>

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
                  onClick={() => setOpenPhotoId(filteredPhotos[openPhotoIndex - 1]?.id ?? null)}
                >
                  Prev
                </button>
              ) : null}

              {openPhotoIndex < filteredPhotos.length - 1 ? (
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-black/45 px-2 py-1 text-sm text-white"
                  onClick={() => setOpenPhotoId(filteredPhotos[openPhotoIndex + 1]?.id ?? null)}
                >
                  Next
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
              <p className="mt-1 text-[11px] text-slate-500">System tags: {systemTagHint}</p>

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

              <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                <button type="button" className="hover:underline" onClick={() => void saveModalMetadata()}>
                  Save
                </button>
                <button type="button" className="hover:underline" onClick={() => void assignPhotoAs("avatar")}>
                  {avatarButtonLabel}
                </button>
                <button type="button" className="hover:underline" onClick={() => void assignPhotoAs("banner")}>
                  {bannerButtonLabel}
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
                    comments={openPhoto.comments ?? []}
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
                                [comment.id]: { ...previous[comment.id], Like: (previous[comment.id]?.Like ?? 0) + 1 },
                              }))
                            }
                          >
                            Like {reactions.Like ?? 0}
                          </button>
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() =>
                              setCommentReactions((previous) => ({
                                ...previous,
                                [comment.id]: { ...previous[comment.id], Love: (previous[comment.id]?.Love ?? 0) + 1 },
                              }))
                            }
                          >
                            Love {reactions.Love ?? 0}
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

      {showUploadModal ? (
        <GalleryUploadSurfaceClient
          mode="modal"
          albums={albums.map((album) => ({ id: album.id, title: album.title }))}
          defaultAlbumId={currentUploadAlbumId}
          onClose={() => setShowUploadModal(false)}
          onUploaded={(payload) => {
            setAlbums((previous) =>
              previous.some((album) => album.id === payload.album.id)
                ? previous
                : [{ id: payload.album.id, title: payload.album.title, createdAt: new Date().toISOString() }, ...previous],
            );
            setPhotos((previous) => mergeUploadedPhotos(previous, payload));
            setStatus(payload.photos.length === 1 ? "Photo uploaded." : `${payload.photos.length} photos uploaded.`);
            setShowUploadModal(false);
          }}
        />
      ) : null}
    </section>
  );
}
