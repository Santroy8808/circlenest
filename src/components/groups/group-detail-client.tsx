"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { uploadFile, uploadImageWithCompression } from "@/lib/media/image-upload.client";
import { ReportControl } from "@/components/reports/report-control";
import { TierGate } from "@/components/policy/tier-gate";
import { ForumThreadCard } from "@/components/groups/forum-thread-card";

type GroupData = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  ownerId: string;
  ownerUsername: string;
  members: Array<{ id: string; username: string; role: string }>;
  joinRequests: Array<{ id: string; userId: string; username: string }>;
  events: Array<{ id: string; title: string; description: string | null; startsAt: string; endsAt: string | null; locationName: string | null; googleMapsUrl: string | null; creatorUsername: string }>;
  threads: Array<{
    id: string;
    title: string;
    authorUsername: string;
    allowReplyImages: boolean;
    posts: Array<{
      id: string;
      content: string;
      parentCommentId: string | null;
      mediaUrlsJson: string | null;
      createdAt: string;
      authorUsername: string;
    }>;
  }>;
  documents: Array<{ id: string; title: string; url: string; uploaderUsername: string }>;
  photos: Array<{ id: string; caption: string | null; url: string; uploaderUsername: string; albumId: string | null; tags: string | null }>;
  photoAlbums: Array<{ id: string; title: string; description: string | null }>;
};

async function uploadImage(file: File, groupId: string, albumId?: string, tags?: string[]): Promise<string | null> {
  const result = await uploadImageWithCompression(file, {
    purpose: "group-photo",
    groupId,
    albumId,
    tagNames: tags,
  });
  return result.url;
}

async function uploadDocument(file: File, groupId: string): Promise<string | null> {
  const result = await uploadFile(file, {
    purpose: "group-document",
    groupId,
  });
  return result.url;
}

export function GroupDetailClient({
  group,
  currentUserId,
  currentRole,
  canModerate,
  canAssignModerators,
  creatorMemberCap,
  initialTab = "groups",
}: {
  group: GroupData;
  currentUserId: string;
  currentRole: string | null;
  canModerate: boolean;
  canAssignModerators: boolean;
  creatorMemberCap: number | null;
  initialTab?: "overview" | "groups" | "documents" | "photos" | "members";
}) {
  const router = useRouter();
  const shellCardClass = "rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]";
  const insetCardClass = "rounded-[14px] border border-[var(--border)] bg-[#111a2a] p-3";
  const inputClass = "rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)]/50";
  const textareaClass = `${inputClass} min-h-24`;
  const ghostButtonClass = "rounded-full border border-[#304058] px-4 py-2 text-sm text-slate-200 transition hover:border-[#4a5a78] hover:text-white";
  const primaryButtonClass = "rounded-full bg-[#376ef8] px-4 py-2 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:shadow-[0_10px_24px_rgba(55,110,248,0.28)]";
  const tabClass = (active: boolean) =>
    active
      ? "rounded-[10px] border border-[#cdb66d]/40 bg-[#1a2030] px-3 py-2 text-sm text-white shadow-[inset_0_-2px_0_#d8c36f]"
      : "rounded-[10px] border border-[#2c3951] px-3 py-2 text-sm text-slate-300 transition hover:border-[#4a5a78] hover:text-white";
  const subtleLabelClass = "text-[11px] uppercase tracking-[0.16em] text-slate-500";
  const [status, setStatus] = useState("");
  const [albumFilter, setAlbumFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const [photosUploadOpen, setPhotosUploadOpen] = useState(false);
  const [photosUploadQueue, setPhotosUploadQueue] = useState<File[]>([]);
  const [photosUploadBusy, setPhotosUploadBusy] = useState(false);
  const [photosUploadError, setPhotosUploadError] = useState("");
  const [photosUploadSuccess, setPhotosUploadSuccess] = useState("");
  const [photosUploadCaption, setPhotosUploadCaption] = useState("");
  const [photosUploadAlbumId, setPhotosUploadAlbumId] = useState("");
  const [photosUploadNewAlbum, setPhotosUploadNewAlbum] = useState("");
  const [photosUploadTags, setPhotosUploadTags] = useState("");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [bulkAlbumId, setBulkAlbumId] = useState<string>("");
  const [bulkAddTags, setBulkAddTags] = useState("");
  const [bulkRemoveTags, setBulkRemoveTags] = useState("");
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);
  const photosModalRef = useRef<HTMLDivElement | null>(null);

  const isMember = Boolean(currentRole);
  const isOwner = group.ownerId === currentUserId;
  const displayRole = (role: string) => {
    if (role === "CREATOR" || role === "MODERATOR") return "Moderator";
    return role;
  };
  const parsedTags = (raw: string | null): string[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
    } catch {
      return [];
    }
  };
  const allTags = Array.from(new Set(group.photos.flatMap((p) => parsedTags(p.tags)))).sort();
  const visiblePhotos = group.photos.filter((p) => {
    if (albumFilter !== "all" && p.albumId !== albumFilter) return false;
    if (tagFilter && !parsedTags(p.tags).includes(tagFilter)) return false;
    return true;
  });

  const allVisibleSelected = visiblePhotos.length > 0 && visiblePhotos.every((p) => selectedPhotoIds.includes(p.id));
  const moderators = group.members.filter((member) => member.role === "CREATOR" || member.role === "MODERATOR");

  async function run(action: () => Promise<void>, ok = "Saved") {
    setStatus("Working...");
    await action();
    setStatus(ok);
    router.refresh();
  }

  async function uploadGroupPhoto(file: File, caption = "", albumId = "", tags = "") {
    const normalizedTags = tags
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12);
    const url = await uploadImage(file, group.id, albumId || undefined, normalizedTags);
    if (!url) return;
    await fetch(`/api/groups/${group.id}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caption,
        albumId: albumId || null,
        tags: normalizedTags.join(", "),
        url,
      }),
    });
  }

  async function submitQueuedPhotos() {
    if (!photosUploadQueue.length || photosUploadBusy) return;
    setPhotosUploadBusy(true);
    setPhotosUploadError("");
    try {
      const albumId = photosUploadNewAlbum.trim() || photosUploadAlbumId || "";
      if (photosUploadNewAlbum.trim()) {
        const albumResponse = await fetch(`/api/groups/${group.id}/photo-albums`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: photosUploadNewAlbum.trim(), description: null }),
        });
        if (albumResponse.ok) {
          const albumBody = (await albumResponse.json().catch(() => null)) as { id?: string } | null;
          if (albumBody?.id) {
            setPhotosUploadAlbumId(albumBody.id);
          }
        }
      }
      for (const file of photosUploadQueue) {
        await uploadGroupPhoto(file, photosUploadCaption, albumId, photosUploadTags);
      }
      setPhotosUploadQueue([]);
      setPhotosUploadCaption("");
      setPhotosUploadNewAlbum("");
      setPhotosUploadTags("");
      setPhotosUploadAlbumId("");
      setPhotosUploadOpen(false);
      setPhotosUploadSuccess("Photos uploaded.");
      router.refresh();
    } catch {
      setPhotosUploadError("Could not upload photos.");
    } finally {
      setPhotosUploadBusy(false);
    }
  }

  function openPhotoPicker() {
    photoFileInputRef.current?.click();
  }

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!incoming.length) return;
    setPhotosUploadQueue((prev) => {
      const seen = new Set(prev.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      return [...prev, ...incoming.filter((file) => !seen.has(`${file.name}:${file.size}:${file.lastModified}`))];
    });
    setPhotosUploadOpen(true);
  }

  useEffect(() => {
    if (!photosUploadOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPhotosUploadOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [photosUploadOpen]);

  return (
    <div className="space-y-4">
      <section className={shellCardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-strong)]">{group.name}</h1>
            <p className="text-sm text-slate-400">{group.description || "No description"}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-amber-200">{group.visibility} - {group.members.length} members</p>
            {creatorMemberCap ? <p className="mt-1 text-xs text-amber-300">Free groups are capped at {creatorMemberCap} members.</p> : null}
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              {!isMember ? <button className={primaryButtonClass} onClick={() => run(async () => { await fetch(`/api/groups/${group.id}/join`, { method: "POST" }); }, "Joined group")}>Join</button> : null}
              {isMember && !isOwner && currentRole !== "ADMIN" ? <button className={ghostButtonClass} onClick={() => run(async () => { await fetch(`/api/groups/${group.id}/leave`, { method: "POST" }); }, "Left group")}>Leave</button> : null}
            </div>
            <div className="max-w-sm">
              <ReportControl targetType="GROUP" targetId={group.id} label="Report group" compact />
            </div>
          </div>
        </div>
        {status ? <p className="mt-2 text-sm text-slate-300">{status}</p> : null}
      </section>

      <section className="rounded-[16px] border border-[var(--border)] bg-[#0f1523] p-3">
        <div className="flex flex-wrap gap-2">
          <Link href={`/groups/${group.id}?tab=overview`} className={tabClass(initialTab === "overview")}>Overview</Link>
          <Link href={`/groups/${group.id}?tab=groups`} className={tabClass(initialTab === "groups")}>Groups</Link>
          <Link href={`/groups/${group.id}?tab=documents`} className={tabClass(initialTab === "documents")}>Documents</Link>
          <Link href={`/groups/${group.id}?tab=photos`} className={tabClass(initialTab === "photos")}>Photos</Link>
          <Link href={`/groups/${group.id}?tab=members`} className={tabClass(initialTab === "members")}>Members</Link>
        </div>
      </section>

      {initialTab === "overview" ? <section className={shellCardClass}>
        <div className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[#11192a]">
          <div className="h-32 bg-gradient-to-r from-[#1a2438] via-[#152237] to-[#0d1524]" />
          <div className="space-y-3 p-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-strong)]">Overview</h2>
              <p className="mt-1 text-sm text-slate-400">{group.description || "No description yet."}</p>
            </div>
            <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
              <div>
                <p className={subtleLabelClass}>Creator</p>
                <p className="mt-1">@{group.ownerUsername}</p>
              </div>
              <div>
                <p className={subtleLabelClass}>Visibility</p>
                <p className="mt-1">{group.visibility}</p>
              </div>
            </div>
            <div>
              <p className={subtleLabelClass}>Moderators</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {moderators.length ? moderators.map((member) => (
                  <Link key={member.id} href={`/profile/${member.username}`} className="rounded-full border border-[#304058] px-3 py-1 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white">
                    @{member.username}
                  </Link>
                )) : <span className="text-sm text-slate-400">No moderators listed.</span>}
              </div>
            </div>
          </div>
        </div>
      </section> : null}

      {initialTab === "groups" ? <section className={shellCardClass}>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">Groups</h2>
        {isMember ? (
          <form className={`grid gap-2 ${insetCardClass}`} onSubmit={(e) => run(async () => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            await fetch(`/api/groups/${group.id}/forum/threads`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: form.get("title"),
                content: form.get("content"),
                allowReplyImages: form.get("allowReplyImages") === "on",
              }),
            });
          }, "Group created") }>
            <input name="title" placeholder="Group title" className={inputClass} required />
            <textarea name="content" placeholder="Opening post" className={textareaClass} required />
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input name="allowReplyImages" type="checkbox" className="h-4 w-4" />
              Allow photo replies on this discussion
            </label>
            <button className={primaryButtonClass} type="submit">Create Group</button>
          </form>
        ) : null}
        <div className="mt-3 space-y-3">
          {group.threads.map((t) => (
            <ForumThreadCard
              key={t.id}
              groupId={group.id}
              isMember={isMember}
              thread={{
                id: t.id,
                title: t.title,
                authorUsername: t.authorUsername,
                allowReplyImages: t.allowReplyImages,
                posts: t.posts.map((p) => ({
                  id: p.id,
                  content: p.content,
                  parentCommentId: p.parentCommentId,
                  mediaUrlsJson: p.mediaUrlsJson,
                  createdAt: p.createdAt,
                  author: { username: p.authorUsername },
                })),
              }}
            />
          ))}
        </div>
      </section> : null}

      {initialTab === "documents" ? <section className="grid gap-4 lg:grid-cols-1">
        <article className={shellCardClass}>
          <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">Documents</h2>
          {isMember ? (
            <form className={`grid gap-2 ${insetCardClass}`} onSubmit={(e) => run(async () => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const file = form.get("document") as File | null;
              if (!file || file.size === 0) return;
              const url = await uploadDocument(file, group.id);
              if (!url) return;
              await fetch(`/api/groups/${group.id}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: String(form.get("title") ?? "").trim() || file.name,
                  url,
                }),
              });
            }, "Document uploaded") }>
              <input name="title" placeholder="Document title" className={inputClass} />
              <input
                name="document"
                type="file"
                accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                className="rounded-[10px] border border-[#304058] bg-[#111a2a] px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded-full file:border-0 file:bg-[#376ef8] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#4a7cff]"
                required
              />
              <p className="text-xs text-slate-400">Accepted: PDF, Word, Excel, PowerPoint, and text files up to 20MB.</p>
              <button className={primaryButtonClass} type="submit">Upload Document</button>
            </form>
          ) : null}
          <div className="mt-3 space-y-2">
            {group.documents.map((d) => (
              <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="block rounded-[14px] border border-[#273449] bg-[#111a2a] px-3 py-3 text-sm text-slate-200 transition hover:border-[#3b4f6c] hover:bg-[#162033]">
                <span className="font-medium text-[var(--text-strong)]">{d.title}</span>
                <span className="mt-1 block text-xs uppercase tracking-[0.14em] text-slate-400">Uploaded by @{d.uploaderUsername}</span>
              </a>
            ))}
          </div>
        </article>
      </section> : null}

            {initialTab === "photos" ? <section className="grid gap-4 lg:grid-cols-1">
        <article className={shellCardClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--text-strong)]">Photos</h2>
              <p className="text-sm text-slate-400">Your group gallery is front and center.</p>
            </div>
            {isMember ? (
              <button type="button" className={primaryButtonClass} onClick={() => setPhotosUploadOpen(true)}>
                + Upload
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select value={albumFilter} onChange={(e) => setAlbumFilter(e.target.value)} className={inputClass}>
              <option value="all">All albums</option>
              {group.photoAlbums.map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className={inputClass}>
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button type="button" className={ghostButtonClass} onClick={() => { setAlbumFilter("all"); setTagFilter(""); }}>
              Clear filters
            </button>
          </div>

          {selectedPhotoIds.length > 0 ? (
            <div className="sticky top-3 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-[#2e3c55] bg-[#111a2a] px-3 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
              <span className="text-sm font-semibold text-[var(--text-strong)]">{selectedPhotoIds.length} selected</span>
              <select value={bulkAlbumId} onChange={(e) => setBulkAlbumId(e.target.value)} className={inputClass}>
                <option value="">Move to album</option>
                {group.photoAlbums.map((a) => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
              <input value={bulkAddTags} onChange={(e) => setBulkAddTags(e.target.value)} placeholder="Add tags" className={inputClass} />
              <input value={bulkRemoveTags} onChange={(e) => setBulkRemoveTags(e.target.value)} placeholder="Remove tags" className={inputClass} />
              <button type="button" className={ghostButtonClass} onClick={() => void run(async () => {
                if (!selectedPhotoIds.length) return;
                await fetch(`/api/groups/${group.id}/photos/bulk`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ photoIds: selectedPhotoIds, albumId: bulkAlbumId || null }),
                });
              }, "Bulk move complete")}>Move</button>
              <button type="button" className={ghostButtonClass} onClick={() => void run(async () => {
                if (!selectedPhotoIds.length || !bulkAddTags.trim()) return;
                await fetch(`/api/groups/${group.id}/photos/bulk`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ photoIds: selectedPhotoIds, addTags: bulkAddTags.split(",").map((t) => t.trim()).filter(Boolean) }),
                });
              }, "Tags added")}>Add tags</button>
              <button type="button" className={ghostButtonClass} onClick={() => void run(async () => {
                if (!selectedPhotoIds.length || !bulkRemoveTags.trim()) return;
                await fetch(`/api/groups/${group.id}/photos/bulk`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ photoIds: selectedPhotoIds, removeTags: bulkRemoveTags.split(",").map((t) => t.trim()).filter(Boolean) }),
                });
              }, "Tags removed")}>Remove tags</button>
              <button type="button" className="rounded-full border border-red-400/60 px-3 py-2 text-xs text-red-200 transition hover:border-red-300 hover:text-white" onClick={() => setSelectedPhotoIds([])}>
                Cancel selection
              </button>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visiblePhotos.map((p) => (
              <figure key={p.id} className="group relative overflow-hidden rounded-[16px] border border-[#273449] bg-[#111a2a]">
                {isMember ? (
                  <label className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full border border-[#304058] bg-black/55 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
                    <input
                      type="checkbox"
                      checked={selectedPhotoIds.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPhotoIds((prev) => Array.from(new Set([...prev, p.id])));
                        } else {
                          setSelectedPhotoIds((prev) => prev.filter((id) => id !== p.id));
                        }
                      }}
                    />
                    Select
                  </label>
                ) : null}
                <Image src={p.url} alt={p.caption || "Group photo"} width={800} height={600} unoptimized className="h-56 w-full object-cover" />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-xs text-white opacity-0 transition group-hover:opacity-100">
                  <div className="space-y-1">
                    <p className="font-medium">{p.caption || "Photo"} - @{p.uploaderUsername}</p>
                    <p>Album: {group.photoAlbums.find((a) => a.id === p.albumId)?.title || "None"}</p>
                    <p>Tags: {parsedTags(p.tags).length ? parsedTags(p.tags).join(", ") : "None"}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>

          {visiblePhotos.length === 0 ? (
            <div className="mt-4 rounded-[16px] border border-dashed border-[#2d3b52] bg-[#111a2a] p-8 text-center">
              <p className="text-lg font-semibold text-[var(--text-strong)]">No photos yet</p>
              <p className="mt-1 text-sm text-slate-400">Upload your first photo to get started.</p>
              {isMember ? (
                <button className={`${primaryButtonClass} mt-4`} type="button" onClick={() => setPhotosUploadOpen(true)}>
                  Upload photos
                </button>
              ) : null}
            </div>
          ) : null}
        </article>
      </section> : null}

      {photosUploadOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPhotosUploadOpen(false);
            }
          }}
        >
          <div
            ref={photosModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-photos-title"
            className="w-full max-w-3xl rounded-[22px] border border-[var(--border)] bg-[#0f1523] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const root = photosModalRef.current;
              if (!root) return;
              const focusable = Array.from(root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute("disabled"));
              if (!focusable.length) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="upload-photos-title" className="text-2xl font-semibold text-[var(--text-strong)]">Upload photos</h3>
                <p className="text-sm text-slate-400">Add one or more photos to your group gallery.</p>
              </div>
              <button type="button" className={ghostButtonClass} onClick={() => setPhotosUploadOpen(false)}>Cancel</button>
            </div>

            <input
              ref={photoFileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) {
                  addFiles(event.target.files);
                  event.currentTarget.value = "";
                }
              }}
            />

            <div
              className={`mt-4 rounded-[18px] border-2 border-dashed p-6 text-center transition ${dragActive ? "border-[#4a7cff] bg-[#162033]" : "border-[#304058] bg-[#111a2a]"}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                if (event.dataTransfer.files.length) {
                  addFiles(event.dataTransfer.files);
                }
              }}
            >
              <p className="text-lg font-semibold text-[var(--text-strong)]">Drag and drop photos here</p>
              <p className="mt-1 text-sm text-slate-400">JPG, PNG, GIF up to 10MB each</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <button type="button" className={primaryButtonClass} onClick={openPhotoPicker}>Choose photos</button>
                <button type="button" className={ghostButtonClass} onClick={openPhotoPicker}>Manual upload...</button>
              </div>
              <p className="mt-3 text-xs text-slate-500">You can also upload manually.</p>
            </div>

            {photosUploadQueue.length ? (
              <div className="mt-4 rounded-[18px] border border-[#273449] bg-[#111a2a] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">Selected files</p>
                  <button type="button" className={ghostButtonClass} onClick={() => setPhotosUploadQueue([])}>Clear files</button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {photosUploadQueue.map((file) => (
                    <div key={`${file.name}:${file.size}:${file.lastModified}`} className="rounded-[14px] border border-[#304058] bg-[#0d1524] px-3 py-2 text-sm text-slate-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{file.name}</p>
                          <p className="text-xs text-slate-400">{Math.max(1, Math.ceil(file.size / 1024))} KB</p>
                        </div>
                        <button type="button" className="text-xs text-slate-400 transition hover:text-white" onClick={() => setPhotosUploadQueue((prev) => prev.filter((current) => `${current.name}:${current.size}:${current.lastModified}` !== `${file.name}:${file.size}:${file.lastModified}`))}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                Caption
                <input value={photosUploadCaption} onChange={(event) => setPhotosUploadCaption(event.target.value)} className={inputClass} placeholder="Optional caption" />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Album
                <select value={photosUploadAlbumId} onChange={(event) => setPhotosUploadAlbumId(event.target.value)} className={inputClass}>
                  <option value="">No album</option>
                  {group.photoAlbums.map((album) => (
                    <option key={album.id} value={album.id}>{album.title}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                Create new album
                <input value={photosUploadNewAlbum} onChange={(event) => setPhotosUploadNewAlbum(event.target.value)} className={inputClass} placeholder="Optional new album name" />
              </label>
              <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                Tags
                <input value={photosUploadTags} onChange={(event) => setPhotosUploadTags(event.target.value)} className={inputClass} placeholder="Comma-separated tags" />
              </label>
            </div>

            {photosUploadError ? <p className="mt-3 text-sm text-red-300">{photosUploadError}</p> : null}
            {photosUploadSuccess ? <p className="mt-3 text-sm text-emerald-300">{photosUploadSuccess}</p> : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button type="button" className={ghostButtonClass} onClick={() => setPhotosUploadOpen(false)} disabled={photosUploadBusy}>Cancel</button>
              <button type="button" className={primaryButtonClass} onClick={() => void submitQueuedPhotos()} disabled={photosUploadBusy || photosUploadQueue.length === 0}>
                {photosUploadBusy ? "Uploading..." : "Upload photos"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {initialTab === "members" ? <section className={shellCardClass}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">Members</h2>
            <p className="text-sm text-slate-400">See who is in the group and manage roles from here.</p>
          </div>
          <Link href="/friends" className={ghostButtonClass}>
            Add people from Friends
          </Link>
        </div>
        {canModerate && group.joinRequests.length ? (
          <div className={`mb-3 space-y-2 ${insetCardClass}`}>
            <p className="text-sm font-medium text-[var(--text-strong)]">Pending Join Requests</p>
            {group.joinRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between rounded-[14px] border border-[#273449] bg-[#162033] p-3 text-sm">
                <span className="text-slate-200">@{request.username}</span>
                <div className="flex gap-2">
                  <button className="rounded-full border border-emerald-400/60 px-3 py-1.5 text-xs text-emerald-200 transition hover:border-emerald-300 hover:text-white" onClick={() => run(async () => {
                    await fetch(`/api/groups/${group.id}/join-requests/${request.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "APPROVE" }),
                    });
                  }, "Join request approved")}>Approve</button>
                  <button className="rounded-full border border-red-400/60 px-3 py-1.5 text-xs text-red-200 transition hover:border-red-300 hover:text-white" onClick={() => run(async () => {
                    await fetch(`/api/groups/${group.id}/join-requests/${request.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "DENY" }),
                    });
                  }, "Join request denied")}>Deny</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <div className="space-y-2">
          {canModerate && !canAssignModerators ? (
            <TierGate
              variant="locked"
              title="Moderator access locked"
              message="Upgrade to Activist to assign moderators."
              ctaLabel="Open subscription"
              ctaHref="/settings/subscription"
              secondaryLabel="Compare memberships"
              secondaryHref="/membership"
              compact
            />
          ) : null}
          {group.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-[14px] border border-[#273449] bg-[#111a2a] p-3 text-sm transition hover:border-[#3b4f6c] hover:bg-[#162033]">
              <span className="text-slate-200">
                <Link href={`/profile/${m.username}`} className="text-[var(--text-strong)] underline underline-offset-2">@{m.username}</Link> - {displayRole(m.role)}
              </span>
              {canModerate && m.id !== group.ownerId ? (
                <div className="flex gap-2">
                  <button
                    className="rounded-full border border-[#304058] px-3 py-1.5 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canAssignModerators}
                    title={!canAssignModerators ? "Upgrade to Activist to assign moderators" : undefined}
                    onClick={() => run(async () => {
                      await fetch(`/api/groups/${group.id}/members/role`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: m.id, role: "MODERATOR" }),
                      });
                    }, "Moderator assigned")}
                  >
                    Make Mod
                  </button>
                  <button className="rounded-full border border-[#304058] px-3 py-1.5 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white" onClick={() => run(async () => {
                    await fetch(`/api/groups/${group.id}/members/role`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: m.id, role: "MEMBER" }),
                    });
                  }, "Role updated")}>Make Member</button>
                  <button className="rounded-full border border-red-400/60 px-3 py-1.5 text-xs text-red-200 transition hover:border-red-300 hover:text-white" onClick={() => run(async () => {
                    await fetch(`/api/groups/${group.id}/members/${m.id}`, { method: "DELETE" });
                  }, "Member removed from group")}>Kick</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section> : null}
    </div>
  );
}









