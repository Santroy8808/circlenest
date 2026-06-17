"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadFile } from "@/lib/media/image-upload.client";
import { ReportControl } from "@/components/reports/report-control";
import { TierGate } from "@/components/policy/tier-gate";
import { ForumThreadCard } from "@/components/groups/forum-thread-card";
import { GroupPhotoGallery } from "@/components/groups/group-photo-gallery";

type GroupData = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  ownerId: string;
  members: Array<{ id: string; username: string; role: string; isProvider: boolean }>;
  joinRequests: Array<{ id: string; userId: string; username: string }>;
  events: Array<{
    id: string;
    title: string;
    description: string | null;
    startsAt: string;
    endsAt: string | null;
    locationName: string | null;
    googleMapsUrl: string | null;
    creatorUsername: string;
  }>;
  threads: Array<{
    id: string;
    authorId: string;
    title: string;
    authorUsername: string;
    allowReplyImages: boolean;
    isPinned: boolean;
    status: string;
    posts: Array<{
      id: string;
      content: string;
      parentCommentId: string | null;
      mediaUrlsJson: string | null;
      createdAt: string;
      authorUsername: string;
      authorFullName?: string | null;
      authorDisplayName?: string | null;
      authorAvatarUrl?: string | null;
    }>;
  }>;
  documents: Array<{ id: string; title: string; url: string; uploaderUsername: string }>;
  photos: Array<{
    id: string;
    caption: string | null;
    url: string;
    sizeBytes: number;
    uploaderUsername: string;
    albumId: string | null;
    tags: string | null;
    comments: Array<{
      id: string;
      parentCommentId: string | null;
      content: string;
      mediaUrlsJson: string | null;
      createdAt: string;
      authorUsername: string;
      authorFullName: string | null;
      authorDisplayName?: string | null;
      authorAvatarUrl?: string | null;
    }>;
  }>;
  photoAlbums: Array<{ id: string; title: string; description: string | null }>;
};

export function GroupDetailClient({
  group,
  currentUserId,
  currentRole,
  canModerate,
  canAssignModerators,
  creatorMemberCap,
  canUploadAssets,
  groupAssetUsageBytes,
  groupAssetLimitBytes,
}: {
  group: GroupData;
  currentUserId: string;
  currentRole: string | null;
  canModerate: boolean;
  canAssignModerators: boolean;
  creatorMemberCap: number | null;
  canUploadAssets: boolean;
  groupAssetUsageBytes: number;
  groupAssetLimitBytes: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"events" | "forum" | "documents" | "photos" | "members">("forum");

  const isMember = Boolean(currentRole);
  const isOwner = group.ownerId === currentUserId;
  const currentUsername = group.members.find((member) => member.id === currentUserId)?.username ?? "";
  const selectedThread = selectedThreadId ? group.threads.find((thread) => thread.id === selectedThreadId) ?? null : null;

  const displayRole = (role: string) => {
    if (role === "CREATOR" || role === "MODERATOR") return "Moderator";
    return role;
  };

  async function run(action: () => Promise<void>, ok = "Saved") {
    setStatus("Working...");
    try {
      await action();
      setStatus(ok);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  async function updateThreadPreference(threadId: string, action: "pin" | "unpin" | "move-up" | "move-down") {
    await run(async () => {
      const response = await fetch(`/api/groups/${group.id}/forum/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, action }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not update thread order.");
      }
    }, "Thread order saved");
  }

  async function endThread(threadId: string) {
    await run(async () => {
      const response = await fetch(`/api/groups/${group.id}/forum/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "END" }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not end thread.");
      }
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null);
      }
    }, "Thread ended");
  }

  async function deleteEndedThread(threadId: string) {
    await run(async () => {
      const response = await fetch(`/api/groups/${group.id}/forum/threads/${threadId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not delete thread.");
      }
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null);
      }
    }, "Thread deleted");
  }

  return (
    <div className="space-y-4">
      <section className="card rounded-[18px] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-strong)]">{group.name}</h1>
            <p className="text-sm text-slate-300">{group.description || "No description"}</p>
            <p className="text-xs text-slate-400">
              {group.visibility} | {group.members.length} members
            </p>
            {creatorMemberCap ? (
              <p className="mt-1 text-xs text-amber-300">Free groups are capped at {creatorMemberCap} members.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              {!isMember ? (
                <button
                  className="rounded-full border border-[#6a5420] bg-[#c49a35] px-4 py-2 text-sm font-semibold text-[#1a1204]"
                  onClick={() =>
                    run(async () => {
                      await fetch(`/api/groups/${group.id}/join`, { method: "POST" });
                    }, "Joined group")
                  }
                >
                  Join
                </button>
              ) : null}
              {isMember && !isOwner && currentRole !== "ADMIN" ? (
                <button
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-slate-200"
                  onClick={() =>
                    run(async () => {
                      await fetch(`/api/groups/${group.id}/leave`, { method: "POST" });
                    }, "Left group")
                  }
                >
                  Leave
                </button>
              ) : null}
            </div>
            <div className="max-w-sm">
              <ReportControl targetType="GROUP" targetId={group.id} label="Report group" />
            </div>
          </div>
        </div>
        {status ? <p className="mt-2 text-sm text-slate-300">{status}</p> : null}
      </section>

      <section className="card rounded-[18px] p-3">
        <div className="flex flex-wrap gap-2">
          <button className={`rounded-full px-4 py-2 text-sm transition ${activeTab === "events" ? "border border-[#d6b24a] bg-[#1a2335] font-semibold text-[var(--text-strong)] shadow-[inset_0_0_0_1px_rgba(214,178,74,0.12)]" : "border border-[var(--border)] text-slate-200"}`} onClick={() => setActiveTab("events")}>Events</button>
          <button className={`rounded-full px-4 py-2 text-sm transition ${activeTab === "forum" ? "border border-[#d6b24a] bg-[#1a2335] font-semibold text-[var(--text-strong)] shadow-[inset_0_0_0_1px_rgba(214,178,74,0.12)]" : "border border-[var(--border)] text-slate-200"}`} onClick={() => setActiveTab("forum")}>Forum</button>
          <button className={`rounded-full px-4 py-2 text-sm transition ${activeTab === "documents" ? "border border-[#d6b24a] bg-[#1a2335] font-semibold text-[var(--text-strong)] shadow-[inset_0_0_0_1px_rgba(214,178,74,0.12)]" : "border border-[var(--border)] text-slate-200"}`} onClick={() => setActiveTab("documents")}>Documents</button>
          <button className={`rounded-full px-4 py-2 text-sm transition ${activeTab === "photos" ? "border border-[#d6b24a] bg-[#1a2335] font-semibold text-[var(--text-strong)] shadow-[inset_0_0_0_1px_rgba(214,178,74,0.12)]" : "border border-[var(--border)] text-slate-200"}`} onClick={() => setActiveTab("photos")}>Photos</button>
          <button className={`rounded-full px-4 py-2 text-sm transition ${activeTab === "members" ? "border border-[#d6b24a] bg-[#1a2335] font-semibold text-[var(--text-strong)] shadow-[inset_0_0_0_1px_rgba(214,178,74,0.12)]" : "border border-[var(--border)] text-slate-200"}`} onClick={() => setActiveTab("members")}>Members</button>
        </div>
      </section>

      {activeTab === "events" ? (
        <section className="card rounded-[18px] p-4">
          <h2 className="mb-2 text-lg font-semibold">Events</h2>
          <p className="text-sm text-slate-300">Events are now managed in the standalone Events section.</p>
          <Link href="/events" className="mt-3 inline-block rounded-full border border-[var(--border)] px-4 py-2 text-sm text-slate-100">Open Events</Link>
        </section>
      ) : null}

      {activeTab === "forum" ? (
        <section className="card rounded-[18px] p-4">
          <h2 className="mb-2 text-lg font-semibold">Forum</h2>
          {isMember ? (
            <form
              className="grid gap-2 rounded-[14px] border border-[var(--border)] bg-[#11192a] p-3"
              onSubmit={(e) =>
                run(async () => {
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
                }, "Thread created")
              }
            >
              <input name="title" placeholder="Thread title" className="rounded border border-slate-300 px-3 py-2" required />
              <textarea name="content" placeholder="Opening post" className="rounded border border-slate-300 px-3 py-2" required />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input name="allowReplyImages" type="checkbox" className="h-4 w-4" />
                Allow photo replies on this thread
              </label>
              <button className="rounded bg-slate-900 px-3 py-2 text-white" type="submit">Start Thread</button>
            </form>
          ) : null}
          <div className="mt-3 space-y-3">
            {(selectedThread ? [selectedThread] : group.threads).map((thread, index, list) => (
              <ForumThreadCard
                key={thread.id}
                groupId={group.id}
                isMember={isMember}
                collapsed={!selectedThread}
                focused={selectedThreadId === thread.id}
                onOpenThread={() => setSelectedThreadId(thread.id)}
                onBackToThreads={() => setSelectedThreadId(null)}
                isPinned={thread.isPinned}
                canMoveUp={index > 0}
                canMoveDown={index < list.length - 1}
                onPinToggle={() => void updateThreadPreference(thread.id, thread.isPinned ? "unpin" : "pin")}
                onMoveUp={() => void updateThreadPreference(thread.id, "move-up")}
                onMoveDown={() => void updateThreadPreference(thread.id, "move-down")}
                canEndThread={thread.authorId === currentUserId || canModerate}
                canDeleteEndedThread={canModerate && thread.status === "ENDED"}
                isEnded={thread.status === "ENDED"}
                onEndThread={() => void endThread(thread.id)}
                onDeleteEndedThread={() => void deleteEndedThread(thread.id)}
                thread={{
                  id: thread.id,
                  title: thread.title,
                  authorUsername: thread.authorUsername,
                  allowReplyImages: thread.allowReplyImages,
                  posts: thread.posts.map((post) => ({
                    id: post.id,
                    content: post.content,
                    parentCommentId: post.parentCommentId,
                    mediaUrlsJson: post.mediaUrlsJson,
                    createdAt: post.createdAt,
                    author: {
                      username: post.authorUsername,
                      fullName: post.authorFullName,
                      profile: { displayName: post.authorDisplayName, avatarUrl: post.authorAvatarUrl },
                    },
                  })),
                }}
              />
            ))}
            {!group.threads.length ? (
              <p className="rounded-[14px] border border-[var(--border)] bg-[#11192a] px-3 py-3 text-sm text-slate-400">No threads yet.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "documents" ? (
        <section className="grid gap-4 lg:grid-cols-1">
          <article className="card rounded-[18px] p-4">
            <h2 className="mb-2 text-lg font-semibold">Documents</h2>
            {canUploadAssets ? (
              <form
                className="grid gap-2"
                onSubmit={(e) =>
                  run(async () => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    const file = form.get("document") as File | null;
                    if (!file || file.size === 0) return;
                    const uploaded = await uploadFile(file, {
                      purpose: "group-document",
                      groupId: group.id,
                    });
                    if (!uploaded.url) return;
                    await fetch(`/api/groups/${group.id}/documents`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title: String(form.get("title") ?? "").trim() || file.name,
                        url: uploaded.url,
                        sizeBytes: uploaded.sizeBytes,
                      }),
                    });
                  }, "Document uploaded")
                }
              >
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
            ) : (
              <p className="text-sm text-slate-400">Only the group creator, moderators, or flagged providers can upload group assets.</p>
            )}
            <div className="mt-3 space-y-2">
              {group.documents.map((document) => (
                <p key={document.id} className="text-sm">
                  <a href={document.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">{document.title}</a>{" "}
                  <span className="text-slate-500">by @{document.uploaderUsername}</span>
                </p>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "photos" ? (
        <GroupPhotoGallery
          groupId={group.id}
          currentUserId={currentUserId}
          currentUsername={currentUsername}
          canModerate={canModerate}
          canUploadAssets={canUploadAssets}
          usageBytes={groupAssetUsageBytes}
          limitBytes={groupAssetLimitBytes}
          photos={group.photos}
          onStatus={setStatus}
          onRefresh={() => router.refresh()}
        />
      ) : null}

      {activeTab === "members" ? (
        <section className="card rounded-[18px] p-4">
          <h2 className="mb-2 text-lg font-semibold">Members</h2>
          {canModerate && group.joinRequests.length ? (
            <div className="mb-3 space-y-2 rounded-[14px] border border-[var(--border)] bg-[#10192a] p-3">
              <p className="text-sm font-medium">Pending Join Requests</p>
              {group.joinRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between rounded-[12px] border border-[var(--border)] bg-[#111a2a] p-3 text-sm">
                  <span>@{request.username}</span>
                  <div className="flex gap-2">
                    <button
                      className="rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-100"
                      onClick={() =>
                        run(async () => {
                          await fetch(`/api/groups/${group.id}/join-requests/${request.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "APPROVE" }),
                          });
                        }, "Join request approved")
                      }
                    >
                      Approve
                    </button>
                    <button
                      className="rounded-full border border-red-400/50 px-3 py-1 text-xs text-red-100"
                      onClick={() =>
                        run(async () => {
                          await fetch(`/api/groups/${group.id}/join-requests/${request.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "DENY" }),
                          });
                        }, "Join request denied")
                      }
                    >
                      Deny
                    </button>
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
                message="Upgrade to Contributor to assign moderators."
                ctaLabel="Open subscription"
                ctaHref="/settings/subscription"
                secondaryLabel="Compare memberships"
                secondaryHref="/membership"
                compact
              />
            ) : null}
            {group.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-[12px] border border-[var(--border)] bg-[#111a2a] p-3 text-sm">
                <span>
                  <Link href={`/profile/${member.username}`} className="underline">@{member.username}</Link> | {displayRole(member.role)}
                  {member.isProvider ? " | Provider" : ""}
                </span>
                {canModerate && member.id !== group.ownerId ? (
                  <div className="flex gap-2">
                    <button
                      className="rounded-full border border-[var(--border)] px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canAssignModerators}
                      title={!canAssignModerators ? "Upgrade to Contributor to assign moderators" : undefined}
                      onClick={() =>
                        run(async () => {
                          await fetch(`/api/groups/${group.id}/members/role`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId: member.id, role: "MODERATOR" }),
                          });
                        }, "Moderator assigned")
                      }
                    >
                      Make Mod
                    </button>
                    <button
                      className="rounded-full border border-[var(--border)] px-3 py-1"
                      onClick={() =>
                        run(async () => {
                          await fetch(`/api/groups/${group.id}/members/role`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId: member.id, role: "MEMBER" }),
                          });
                        }, "Role updated")
                      }
                    >
                      Make Member
                    </button>
                    <button
                      className="rounded-full border border-[var(--border)] px-3 py-1"
                      onClick={() =>
                        run(async () => {
                          await fetch(`/api/groups/${group.id}/members/role`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId: member.id, isProvider: !member.isProvider }),
                          });
                        }, member.isProvider ? "Provider removed" : "Provider granted")
                      }
                    >
                      {member.isProvider ? "Remove Provider" : "Make Provider"}
                    </button>
                    <button
                      className="rounded-full border border-red-400/50 px-3 py-1 text-red-100"
                      onClick={() =>
                        run(async () => {
                          await fetch(`/api/groups/${group.id}/members/${member.id}`, { method: "DELETE" });
                        }, "Member removed from group")
                      }
                    >
                      Kick
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
