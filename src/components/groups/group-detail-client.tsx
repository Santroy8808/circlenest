"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { uploadFile, uploadImageWithCompression } from "@/lib/media/image-upload.client";

type GroupData = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  ownerId: string;
  members: Array<{ id: string; username: string; role: string }>;
  joinRequests: Array<{ id: string; userId: string; username: string }>;
  events: Array<{ id: string; title: string; description: string | null; startsAt: string; endsAt: string | null; locationName: string | null; googleMapsUrl: string | null; creatorUsername: string }>;
  threads: Array<{ id: string; title: string; authorUsername: string; posts: Array<{ id: string; content: string; authorUsername: string }> }>;
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

export function GroupDetailClient({ group, currentUserId, currentRole, canModerate }: { group: GroupData; currentUserId: string; currentRole: string | null; canModerate: boolean }) {
  const [status, setStatus] = useState("");
  const [albumFilter, setAlbumFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState<"events" | "forum" | "documents" | "photos" | "members">("forum");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [bulkAlbumId, setBulkAlbumId] = useState<string>("");
  const [bulkAddTags, setBulkAddTags] = useState("");
  const [bulkRemoveTags, setBulkRemoveTags] = useState("");

  const isMember = Boolean(currentRole);
  const isCreator = group.ownerId === currentUserId || currentRole === "CREATOR";
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

  async function run(action: () => Promise<void>, ok = "Saved") {
    setStatus("Working...");
    await action();
    setStatus(ok);
    window.location.reload();
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
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{group.name}</h1>
            <p className="text-sm text-slate-600">{group.description || "No description"}</p>
            <p className="text-xs text-slate-500">{group.visibility} • {group.members.length} members</p>
          </div>
          <div className="flex gap-2">
            {!isMember ? <button className="rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={() => run(async () => { await fetch(`/api/groups/${group.id}/join`, { method: "POST" }); }, "Joined group")}>Join</button> : null}
            {isMember && !isCreator ? <button className="rounded border border-slate-300 px-3 py-2 text-sm" onClick={() => run(async () => { await fetch(`/api/groups/${group.id}/leave`, { method: "POST" }); }, "Left group")}>Leave</button> : null}
          </div>
        </div>
        {status ? <p className="mt-2 text-sm text-slate-600">{status}</p> : null}
      </section>

      <section className="card p-3">
        <div className="flex flex-wrap gap-2">
          <button className={`rounded px-3 py-2 text-sm ${activeTab === "events" ? "bg-slate-900 text-white" : "border border-slate-300"}`} onClick={() => setActiveTab("events")}>Events</button>
          <button className={`rounded px-3 py-2 text-sm ${activeTab === "forum" ? "bg-slate-900 text-white" : "border border-slate-300"}`} onClick={() => setActiveTab("forum")}>Forum</button>
          <button className={`rounded px-3 py-2 text-sm ${activeTab === "documents" ? "bg-slate-900 text-white" : "border border-slate-300"}`} onClick={() => setActiveTab("documents")}>Documents</button>
          <button className={`rounded px-3 py-2 text-sm ${activeTab === "photos" ? "bg-slate-900 text-white" : "border border-slate-300"}`} onClick={() => setActiveTab("photos")}>Photos</button>
          <button className={`rounded px-3 py-2 text-sm ${activeTab === "members" ? "bg-slate-900 text-white" : "border border-slate-300"}`} onClick={() => setActiveTab("members")}>Members</button>
        </div>
      </section>

      {activeTab === "events" ? <section className="card p-4">
        <h2 className="mb-2 text-lg font-semibold">Events</h2>
        <p className="text-sm text-slate-600">Events are now managed in the standalone Events section.</p>
        <Link href="/events" className="mt-3 inline-block rounded border border-slate-300 px-3 py-2 text-sm">Open Events</Link>
      </section> : null}

      {activeTab === "forum" ? <section className="card p-4">
        <h2 className="mb-2 text-lg font-semibold">Forum</h2>
        {isMember ? (
          <form className="grid gap-2" onSubmit={(e) => run(async () => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            await fetch(`/api/groups/${group.id}/forum/threads`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: form.get("title"), content: form.get("content") }),
            });
          }, "Thread created") }>
            <input name="title" placeholder="Thread title" className="rounded border border-slate-300 px-3 py-2" required />
            <textarea name="content" placeholder="Opening post" className="rounded border border-slate-300 px-3 py-2" required />
            <button className="rounded bg-slate-900 px-3 py-2 text-white" type="submit">Start Thread</button>
          </form>
        ) : null}
        <div className="mt-3 space-y-3">
          {group.threads.map((t) => (
            <article key={t.id} className="rounded border border-slate-200 p-3">
              <p className="font-medium">{t.title}</p>
              <p className="text-xs text-slate-500">by @{t.authorUsername}</p>
              <div className="mt-2 space-y-1">
                {t.posts.map((p) => <p key={p.id} className="text-sm"><span className="font-medium">@{p.authorUsername}</span> {p.content}</p>)}
              </div>
              {isMember ? (
                <form className="mt-2 flex gap-2" onSubmit={(e) => run(async () => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  await fetch(`/api/groups/${group.id}/forum/threads/${t.id}/posts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: form.get("content") }),
                  });
                }, "Reply posted") }>
                  <input name="content" placeholder="Reply" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" required />
                  <button className="rounded bg-blue-600 px-2 py-1 text-sm text-white" type="submit">Reply</button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      </section> : null}

      {activeTab === "documents" ? <section className="grid gap-4 lg:grid-cols-1">
        <article className="card p-4">
          <h2 className="mb-2 text-lg font-semibold">Documents</h2>
          {isMember ? (
            <form className="grid gap-2" onSubmit={(e) => run(async () => {
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
              <input name="title" placeholder="Document title" className="rounded border border-slate-300 px-3 py-2" />
              <input
                name="document"
                type="file"
                accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                className="rounded border border-slate-300 px-3 py-2"
                required
              />
              <p className="text-xs text-slate-500">Accepted: PDF, Word, Excel, PowerPoint, and text files up to 20MB.</p>
              <button className="rounded bg-slate-900 px-3 py-2 text-white" type="submit">Upload Document</button>
            </form>
          ) : null}
          <div className="mt-3 space-y-2">
            {group.documents.map((d) => <p key={d.id} className="text-sm"><a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">{d.title}</a> <span className="text-slate-500">by @{d.uploaderUsername}</span></p>)}
          </div>
        </article>
      </section> : null}

      {activeTab === "photos" ? <section className="grid gap-4 lg:grid-cols-1">
        <article className="card p-4">
          <h2 className="mb-2 text-lg font-semibold">Photos</h2>
          {isMember ? (
            <div className="space-y-3">
              <form className="grid gap-2" onSubmit={(e) => run(async () => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                await fetch(`/api/groups/${group.id}/photo-albums`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: form.get("albumTitle"), description: form.get("albumDescription") }),
                });
              }, "Album created") }>
                <p className="text-sm font-medium">Create album</p>
                <input name="albumTitle" placeholder="Album title (e.g. Summer meetup)" className="rounded border border-slate-300 px-3 py-2" required />
                <input name="albumDescription" placeholder="Optional album description" className="rounded border border-slate-300 px-3 py-2" />
                <button className="rounded border border-slate-300 px-3 py-2 text-sm" type="submit">Add Album</button>
              </form>

              <form className="grid gap-2" onSubmit={(e) => run(async () => {
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
                <p className="text-sm font-medium">Upload photo</p>
                <input name="caption" placeholder="Caption" className="rounded border border-slate-300 px-3 py-2" />
                <select name="albumId" className="rounded border border-slate-300 px-3 py-2">
                  <option value="">No album</option>
                  {group.photoAlbums.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
                <input name="tags" placeholder="Tags, comma-separated (e.g. meetup, food, sunset)" className="rounded border border-slate-300 px-3 py-2" />
                <input name="photo" type="file" accept="image/png,image/jpeg,image/webp" className="rounded border border-slate-300 px-3 py-2" required />
                <button className="rounded bg-slate-900 px-3 py-2 text-white" type="submit">Upload Photo</button>
              </form>

              <div
                className={`rounded border-2 border-dashed p-4 text-sm ${dragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50"}`}
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

          <div className="mt-3 rounded border border-slate-200 p-2">
            <p className="mb-2 text-sm font-medium">Filter photos</p>
            <div className="grid gap-2 md:grid-cols-3">
              <select value={albumFilter} onChange={(e) => setAlbumFilter(e.target.value)} className="rounded border border-slate-300 px-2 py-2 text-sm">
                <option value="all">All albums</option>
                {group.photoAlbums.map((a) => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="rounded border border-slate-300 px-2 py-2 text-sm">
                <option value="">All tags</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button className="rounded border border-slate-300 px-2 py-2 text-sm" onClick={() => { setAlbumFilter("all"); setTagFilter(""); }}>
                Clear filters
              </button>
            </div>
          </div>

          {isMember ? (
            <div className="mt-3 rounded border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Bulk actions</p>
                <button
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
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
              <p className="mb-2 text-xs text-slate-600">{selectedPhotoIds.length} selected</p>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-600">Move selected to album</label>
                  <div className="flex gap-2">
                    <select value={bulkAlbumId} onChange={(e) => setBulkAlbumId(e.target.value)} className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs">
                      <option value="">No album</option>
                      {group.photoAlbums.map((a) => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                    <button
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
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
                  <label className="text-xs text-slate-600">Add tags to selected</label>
                  <div className="flex gap-2">
                    <input value={bulkAddTags} onChange={(e) => setBulkAddTags(e.target.value)} placeholder="tag1, tag2" className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
                    <button
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
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
                  <label className="text-xs text-slate-600">Remove tags from selected</label>
                  <div className="flex gap-2">
                    <input value={bulkRemoveTags} onChange={(e) => setBulkRemoveTags(e.target.value)} placeholder="tag1, tag2" className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
                    <button
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
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
              <figure key={p.id} className="rounded border border-slate-200 p-2">
                {isMember ? (
                  <label className="mb-1 flex items-center gap-1 text-[11px] text-slate-600">
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
                <figcaption className="mt-1 text-xs text-slate-600">
                  {p.caption || "Photo"} • @{p.uploaderUsername}
                  <br />
                  Album: {group.photoAlbums.find((a) => a.id === p.albumId)?.title || "None"}
                  <br />
                  Tags: {parsedTags(p.tags).length ? parsedTags(p.tags).join(", ") : "None"}
                </figcaption>
                {isMember ? (
                  <div className="mt-2">
                    <label className="mb-1 block text-[11px] text-slate-500">Move to album</label>
                    <select
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
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
            {visiblePhotos.length === 0 ? <p className="text-sm text-slate-600">No photos match current filters.</p> : null}
          </div>
        </article>
      </section> : null}

      {activeTab === "members" ? <section className="card p-4">
        <h2 className="mb-2 text-lg font-semibold">Members</h2>
        {canModerate && group.joinRequests.length ? (
          <div className="mb-3 space-y-2 rounded border border-slate-200 p-2">
            <p className="text-sm font-medium">Pending Join Requests</p>
            {group.joinRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between rounded border border-slate-200 p-2 text-sm">
                <span>@{request.username}</span>
                <div className="flex gap-2">
                  <button className="rounded border border-emerald-400 px-2 py-1 text-xs" onClick={() => run(async () => {
                    await fetch(`/api/groups/${group.id}/join-requests/${request.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "APPROVE" }),
                    });
                  }, "Join request approved")}>Approve</button>
                  <button className="rounded border border-red-400 px-2 py-1 text-xs" onClick={() => run(async () => {
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
          {group.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded border border-slate-200 p-2 text-sm">
              <span>
                <Link href={`/profile/${m.username}`} className="underline">@{m.username}</Link> • {m.role}
              </span>
              {canModerate && m.id !== group.ownerId ? (
                <div className="flex gap-2">
                  <button className="rounded border border-slate-300 px-2 py-1" onClick={() => run(async () => {
                    await fetch(`/api/groups/${group.id}/members/role`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: m.id, role: "MODERATOR" }),
                    });
                  }, "Moderator assigned")}>Make Mod</button>
                  <button className="rounded border border-slate-300 px-2 py-1" onClick={() => run(async () => {
                    await fetch(`/api/groups/${group.id}/members/role`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: m.id, role: "MEMBER" }),
                    });
                  }, "Role updated")}>Make Member</button>
                  <button className="rounded border border-red-400 px-2 py-1 text-red-300" onClick={() => run(async () => {
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

