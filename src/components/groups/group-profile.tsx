"use client";

import { useState, useTransition } from "react";
import type { GroupMemberView, GroupProfileView } from "@/modules/groups/types";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function GroupProfile({ group }: { group: GroupProfileView }) {
  const [isPinned, setIsPinned] = useState(group.isPinned);
  const [membershipState, setMembershipState] = useState(
    group.viewerRole ? "member" : group.pendingJoinRequest ? "pending" : "none"
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [members, setMembers] = useState(group.membersPreview);
  const [membersNextCursor, setMembersNextCursor] = useState<string | null>(null);
  const [memberIdentifier, setMemberIdentifier] = useState("");
  const [showMemberTools, setShowMemberTools] = useState(false);
  const [isPending, startTransition] = useTransition();

  function join() {
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/groups/${group.slug}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = (await response.json()) as { error?: string; status?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not join group.");
        return;
      }

      setMembershipState(payload.status === "pending" ? "pending" : "member");
      setMessage(payload.status === "pending" ? "Join request sent." : "You joined this group.");
    });
  }

  function togglePin() {
    setError("");
    const next = !isPinned;
    setIsPinned(next);

    startTransition(async () => {
      const response = await fetch(`/api/groups/${group.slug}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: next, sortOrder: 0 })
      });

      if (!response.ok) {
        setIsPinned(!next);
        setError("Could not update pin.");
      }
    });
  }

  function mergeMembers(current: GroupMemberView[], incoming: GroupMemberView[]) {
    const byId = new Map(current.map((member) => [member.id, member]));
    for (const member of incoming) byId.set(member.id, member);
    return Array.from(byId.values());
  }

  function loadMembers(cursor?: string | null, replace = false) {
    setError("");
    startTransition(async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/groups/${group.slug}/members?${params.toString()}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as {
        error?: string;
        members?: GroupMemberView[];
        nextCursor?: string | null;
      };
      if (!response.ok) {
        setError(payload.error ?? "Could not load members.");
        return;
      }

      setMembers((current) => replace ? payload.members ?? [] : mergeMembers(current, payload.members ?? []));
      setMembersNextCursor(payload.nextCursor ?? null);
    });
  }

  function openMemberTools() {
    const next = !showMemberTools;
    setShowMemberTools(next);
    if (next) loadMembers(null, true);
  }

  function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const username = memberIdentifier.trim().replace(/^@/, "");
    if (!username) return;
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/groups/${group.slug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      const payload = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not add that member.");
        return;
      }

      setMemberIdentifier("");
      setMessage(payload.status === "already-member" ? "That person is already a member." : "Member added.");
      loadMembers(null, true);
    });
  }

  function updateMemberRole(member: GroupMemberView, role: "MEMBER" | "MODERATOR") {
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/groups/${group.slug}/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not change that role.");
        return;
      }
      setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role } : item));
    });
  }

  function removeMember(member: GroupMemberView) {
    if (!window.confirm(`Remove ${member.displayName} from this group?`)) return;
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/groups/${group.slug}/members/${member.id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not remove that member.");
        return;
      }
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setMessage(`${member.displayName} was removed.`);
    });
  }

  function leave() {
    if (!window.confirm("Leave this group?")) return;
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/groups/${group.slug}/leave`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not leave this group.");
        return;
      }
      window.location.href = "/groups";
    });
  }

  return (
    <div className="grid gap-5">
      <section className="group-profile-card surface overflow-hidden rounded-md">
        <div className="group-profile-banner">
          {group.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={group.bannerUrl} />
          ) : null}
        </div>
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className="group-profile-avatar">
                {group.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={group.avatarUrl} />
                ) : (
                  initials(group.name)
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm uppercase tracking-[0.18em] text-[var(--gold)]">
                  {group.visibility.toLowerCase()} · {group.memberCount} members
                </p>
                <h1 className="mt-2 text-4xl font-semibold">{group.name}</h1>
                <p className="mt-2 max-w-2xl text-[var(--muted)]">{group.tagline ?? "No tagline yet."}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" disabled={isPending} onClick={togglePin} type="button">
                {isPinned ? "Unpin" : "Pin"}
              </button>
              {group.canModerate ? (
                <button className="btn-secondary" disabled={isPending} onClick={openMemberTools} type="button">
                  {showMemberTools ? "Close member tools" : "Manage members"}
                </button>
              ) : null}
              {membershipState === "none" ? (
                <button className="btn-primary" disabled={isPending} onClick={join} type="button">
                  {group.joinPolicy === "OPEN" ? "Join" : "Request to join"}
                </button>
              ) : (
                <span className="pill rounded-full px-4 py-3 text-sm">
                  {membershipState === "pending" ? "Request pending" : group.viewerRole ?? "Member"}
                </span>
              )}
              {membershipState === "member" && group.viewerRole !== "OWNER" ? (
                <button className="btn-secondary" disabled={isPending} onClick={leave} type="button">
                  Leave group
                </button>
              ) : null}
            </div>
          </div>
          {message ? <p className="mt-4 rounded-md border border-[var(--line)] p-3 text-sm text-[var(--gold)]">{message}</p> : null}
          {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
        </div>
      </section>

      {group.canModerate && showMemberTools ? (
        <section className="surface rounded-md p-6" aria-labelledby="member-tools-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--gold)]" id="member-tools-title">Manage members</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">Add someone by username, then manage their access below.</p>
            </div>
            <span className="pill rounded-full px-3 py-2 text-xs">Up to 500 members</span>
          </div>

          <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={addMember}>
            <label className="grid flex-1 gap-2">
              <span className="form-label">Username</span>
              <input
                autoComplete="off"
                className="form-field"
                onChange={(event) => setMemberIdentifier(event.target.value)}
                placeholder="username"
                value={memberIdentifier}
              />
            </label>
            <button className="btn-primary self-end" disabled={isPending || !memberIdentifier.trim()} type="submit">
              {isPending ? "Working…" : "Add member"}
            </button>
          </form>

          <div className="mt-6 grid gap-3">
            {members.length === 0 ? <p className="text-sm text-[var(--muted)]">No members to show.</p> : null}
            {members.map((member) => {
              const canRemove =
                member.role !== "OWNER" &&
                (group.viewerRole === "OWNER" ||
                  group.viewerRole === null ||
                  (group.viewerRole === "MODERATOR" && member.role === "MEMBER"));
              return (
                <div className="group-member-row flex-wrap" key={member.id}>
                  <span className="group-member-avatar">{initials(member.displayName)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{member.displayName}</span>
                    <span className="text-sm text-[var(--muted)]">@{member.username} · {member.role.toLowerCase()}</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {group.viewerRole === "OWNER" && member.role !== "OWNER" ? (
                      <button
                        className="btn-secondary px-3 py-2 text-sm"
                        disabled={isPending}
                        onClick={() => updateMemberRole(member, member.role === "MODERATOR" ? "MEMBER" : "MODERATOR")}
                        type="button"
                      >
                        {member.role === "MODERATOR" ? "Make member" : "Make moderator"}
                      </button>
                    ) : null}
                    {canRemove ? (
                      <button
                        className="btn-secondary px-3 py-2 text-sm"
                        disabled={isPending}
                        onClick={() => removeMember(member)}
                        type="button"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {membersNextCursor ? (
            <button
              className="btn-secondary mt-4"
              disabled={isPending}
              onClick={() => loadMembers(membersNextCursor)}
              type="button"
            >
              Load more members
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Overview</p>
        <p className="mt-4 whitespace-pre-wrap leading-7 text-[var(--muted)]">{group.description || "No group description yet."}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <a className="module-card rounded-md p-6" href={`/groups/${group.slug}/forum`}>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Forum</p>
          <h2 className="mt-3 text-2xl font-semibold">Open group discussion</h2>
          <p className="mt-2 text-[var(--muted)]">Collapsed threads, focused full-thread view, replies, reactions, and end-thread controls.</p>
        </a>
        <a className="module-card rounded-md p-6" href={`/groups/${group.slug}/media`}>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Media & Docs</p>
          <h2 className="mt-3 text-2xl font-semibold">Open group files</h2>
          <p className="mt-2 text-[var(--muted)]">Simple photos and documents with headlines, comments, and a 40MB group storage cap.</p>
        </a>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="surface rounded-md p-6">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Moderators</h2>
          <div className="mt-4 grid gap-3">
            {group.moderators.map((moderator) => (
              <div className="group-member-row" key={`${moderator.id}-${moderator.role}`}>
                <span className="group-member-avatar">{initials(moderator.displayName)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{moderator.displayName}</span>
                  <span className="text-sm text-[var(--muted)]">{moderator.role}</span>
                </span>
              </div>
            ))}
          </div>
        </article>
        <article className="surface rounded-md p-6">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Members</h2>
          <div className="mt-4 grid gap-3">
            {group.membersPreview.map((member) => (
              <div className="group-member-row" key={member.id}>
                <span className="group-member-avatar">{initials(member.displayName)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{member.displayName}</span>
                  <span className="text-sm text-[var(--muted)]">{member.isProvider ? "Provider" : member.role}</span>
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
