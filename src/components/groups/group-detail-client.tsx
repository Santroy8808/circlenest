"use client";

import { useState } from "react";
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
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [bulkAlbumId, setBulkAlbumId] = useState<string>("");
  const [bulkAddTags, setBulkAddTags] = useState("");
  const [bulkRemoveTags, setBulkRemoveTags] = useState("");

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

  return (
    <div className="space-y-4">
      <section className={shellCardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-strong)]">{group.name}</h1>
            <p className="text-sm text-slate-400">{group.description || "No description"}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-amber-200">{group.visibility} • {group.members.length} members</p>
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
          <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">Photos</h2>
          {isMember ? (
            <div className="space-y-3">
              <form className={`grid gap-2 ${insetCardClass}`} onSubmit={(e) => run(async () => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                await fetch(`/api/groups/${group.id}/photo-albums`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: form.get("albumTitle"), description: form.get("albumDescription") }),
                });
              }, "Album created") }>
                <p className="text-sm font-medium text-[var(--text-strong)]">Create album</p>
                <input name="albumTitle" placeholder="Album title (e.g. Summer meetup)" className={inputClass} required />
                <input name="albumDescription" placeholder="Optional album description" className={inputClass} />
                <button className={ghostButtonClass} type="submit">Add Album</button>
              </form>

              <form className={`grid gap-2 ${insetCardClass}`} onSubmit={(e) => run(async () => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const file = form.get("photo") as File | null;
                if (!file || file.size === 0) return;
                await uploadGroupPhoto(
                  file,
                  String(form.get("caption") ?? ""),
                  String(form.get("albumId") ?? ""),
                  String(form.get("tags") ?? ""),
                );
              }, "Photo added") }>
                <p className="text-sm font-medium text-[var(--text-strong)]">Upload photo</p>
                <input name="caption" placeholder="Caption" className={inputClass} />
                <select name="albumId" className={inputClass}>
                  <option value="">No album</option>
                  {group.photoAlbums.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
                <input name="tags" placeholder="Tags, comma-separated (e.g. meetup, food, sunset)" className={inputClass} />
                <input name="photo" type="file" accept="image/png,image/jpeg,image/webp" className="rounded-[10px] border border-[#304058] bg-[#111a2a] px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded-full file:border-0 file:bg-[#376ef8] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#4a7cff]" required />
                <button className={primaryButtonClass} type="submit">Upload Photo</button>
              </form>

              <div
                className={`rounded-[14px] border-2 border-dashed p-4 text-sm text-slate-300 transition ${dragActive ? "border-[#4a7cff] bg-[#162033]" : "border-[#304058] bg-[#111a2a]"}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (!file) return;
                  await uploadGroupPhoto(file);
                }}
              >
                Drag and drop a photo here for quick upload.
              </div>
            </div>
          ) : null}

          <div className={`mt-3 ${insetCardClass}`}>
            <p className="mb-2 text-sm font-medium text-[var(--text-strong)]">Filter photos</p>
            <div className="grid gap-2 md:grid-cols-3">
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
              <button className={ghostButtonClass} onClick={() => { setAlbumFilter("all"); setTagFilter(""); }}>
                Clear filters
              </button>
            </div>
          </div>

          {isMember ? (
            <div className={`mt-3 ${insetCardClass}`}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--text-strong)]">Bulk actions</p>
                <button
                  className="rounded-full border border-[#304058] px-3 py-1 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white"
                  onClick={() => {
                    if (allVisibleSelected) {
                      setSelectedPhotoIds((prev) => prev.filter((id) => !visiblePhotos.some((p) => p.id === id)));
                    } else {
                      setSelectedPhotoIds((prev) => Array.from(new Set([...prev, ...visiblePhotos.map((p) => p.id)])));
                    }
                  }}
                >
                  {allVisibleSelected ? "Unselect visible" : "Select visible"}
                </button>
              </div>
              <p className="mb-2 text-xs text-slate-400">{selectedPhotoIds.length} selected</p>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Move selected to album</label>
                  <div className="flex gap-2">
                    <select value={bulkAlbumId} onChange={(e) => setBulkAlbumId(e.target.value)} className="flex-1 rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-xs text-slate-100">
                      <option value="">No album</option>
                      {group.photoAlbums.map((a) => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                    <button
                      className="rounded-full border border-[#304058] px-3 py-2 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white"
                      onClick={() => run(async () => {
                        if (!selectedPhotoIds.length) return;
                        await fetch(`/api/groups/${group.id}/photos/bulk`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ photoIds: selectedPhotoIds, albumId: bulkAlbumId || null }),
                        });
                      }, "Bulk move complete")}
                    >
                      Move
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Add tags to selected</label>
                  <div className="flex gap-2">
                    <input value={bulkAddTags} onChange={(e) => setBulkAddTags(e.target.value)} placeholder="tag1, tag2" className="flex-1 rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-400" />
                    <button
                      className="rounded-full border border-[#304058] px-3 py-2 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white"
                      onClick={() => run(async () => {
                        if (!selectedPhotoIds.length || !bulkAddTags.trim()) return;
                        await fetch(`/api/groups/${group.id}/photos/bulk`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            photoIds: selectedPhotoIds,
                            addTags: bulkAddTags.split(",").map((t) => t.trim()).filter(Boolean),
                          }),
                        });
                      }, "Tags added")}
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs text-slate-400">Remove tags from selected</label>
                  <div className="flex gap-2">
                    <input value={bulkRemoveTags} onChange={(e) => setBulkRemoveTags(e.target.value)} placeholder="tag1, tag2" className="flex-1 rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-400" />
                    <button
                      className="rounded-full border border-[#304058] px-3 py-2 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white"
                      onClick={() => run(async () => {
                        if (!selectedPhotoIds.length || !bulkRemoveTags.trim()) return;
                        await fetch(`/api/groups/${group.id}/photos/bulk`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            photoIds: selectedPhotoIds,
                            removeTags: bulkRemoveTags.split(",").map((t) => t.trim()).filter(Boolean),
                          }),
                        });
                      }, "Tags removed")}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            {visiblePhotos.map((p) => (
              <figure key={p.id} className="rounded-[14px] border border-[#273449] bg-[#111a2a] p-2 transition hover:border-[#3b4f6c] hover:bg-[#162033]">
                {isMember ? (
                  <label className="mb-1 flex items-center gap-1 text-[11px] text-slate-400">
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
                <Image src={p.url} alt={p.caption || "Group photo"} width={300} height={200} unoptimized className="h-32 w-full rounded object-cover" />
                <figcaption className="mt-2 text-xs text-slate-300">
                  {p.caption || "Photo"} • @{p.uploaderUsername}
                  <br />
                  Album: {group.photoAlbums.find((a) => a.id === p.albumId)?.title || "None"}
                  <br />
                  Tags: {parsedTags(p.tags).length ? parsedTags(p.tags).join(", ") : "None"}
                </figcaption>
                {isMember ? (
                  <div className="mt-2">
                    <label className="mb-1 block text-[11px] text-slate-400">Move to album</label>
                    <select
                      className="w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-xs text-slate-100"
                      value={p.albumId ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        run(async () => {
                          await fetch(`/api/groups/${group.id}/photos/${p.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ albumId: value || null }),
                          });
                        }, "Photo moved");
                      }}
                    >
                      <option value="">No album</option>
                      {group.photoAlbums.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </figure>
            ))}
            {visiblePhotos.length === 0 ? <p className="text-sm text-slate-400">No photos match current filters.</p> : null}
          </div>
        </article>
      </section> : null}

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
                <Link href={`/profile/${m.username}`} className="text-[var(--text-strong)] underline underline-offset-2">@{m.username}</Link> • {displayRole(m.role)}
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

