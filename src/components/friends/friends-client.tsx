"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type UserRef = {
  id: string;
  username: string;
  fullName?: string | null;
  profile?: { displayName?: string | null; avatarUrl?: string | null } | null;
};
type Incoming = { id: string; sender: UserRef };
type Outgoing = { id: string; receiver: UserRef };

async function runBulk(action: "FOLLOW" | "UNFOLLOW" | "SEND_REQUEST" | "UNFRIEND", userIds: string[]) {
  await fetch("/api/connections/bulk", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, userIds }),
  });
  window.location.reload();
}

export function FriendsClient({
  friends,
  incoming,
  outgoing,
  suggestions,
  followingIds,
}: {
  friends: UserRef[];
  incoming: Incoming[];
  outgoing: Outgoing[];
  suggestions: UserRef[];
  followingIds: string[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserRef[]>([]);
  const [searchStatus, setSearchStatus] = useState("");

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const isSelected = (id: string) => selectedSet.has(id);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function quickMessage(username: string) {
    const res = await fetch("/api/messages/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) {
      setStatus("Could not open message thread.");
      return;
    }
    const body = (await res.json()) as { id: string };
    window.location.href = `/messages/${body.id}`;
  }

  async function runSearch() {
    const q = search.trim();
    if (!q) {
      setSearchResults([]);
      setSearchStatus("");
      return;
    }
    setSearchStatus("Searching...");
    try {
      const res = await fetch(`/api/search/people?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!res.ok) {
        setSearchStatus("Could not search right now.");
        return;
      }
      const body = (await res.json()) as { people?: UserRef[] };
      const rows = Array.isArray(body.people) ? body.people : [];
      setSearchResults(rows);
      setSearchStatus(rows.length ? `Found ${rows.length}` : "No matches found.");
    } catch {
      setSearchStatus("Could not search right now.");
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="mb-2 text-lg font-semibold">Find People</h2>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Search by username, name, or email"
          />
          <button className="rounded border border-slate-300 px-3 py-2 text-sm" onClick={() => void runSearch()}>
            Search
          </button>
        </div>
        {searchStatus ? <p className="mt-2 text-xs text-slate-500">{searchStatus}</p> : null}
        {searchResults.length ? (
          <div className="mt-2 space-y-2">
            {searchResults.map((person) => (
              <div key={person.id} className="flex items-center justify-between rounded border border-slate-200 p-2">
                <div>
                  <p className="text-sm">{person.fullName || `@${person.username}`}</p>
                  <p className="text-xs text-slate-500">@{person.username}</p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/profile/${person.username}`} className="rounded border border-slate-300 px-2 py-1 text-xs">View</Link>
                  <button className="rounded bg-blue-600 px-2 py-1 text-xs text-white" onClick={async () => { await fetch("/api/friends/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: person.username }) }); window.location.reload(); }}>
                    Add Friend
                  </button>
                  <button className="rounded border border-red-400 px-2 py-1 text-xs text-red-300" onClick={async () => { await fetch("/api/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: person.username }) }); window.location.reload(); }}>
                    Block
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-lg font-semibold">Mass Controls</h2>
        <p className="mb-3 text-sm text-slate-600">Select people below, then run one action for everyone selected.</p>
        <div className="flex flex-wrap gap-2">
          <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={async () => { setStatus("Working..."); await runBulk("FOLLOW", selected); setStatus("Followed selected users."); }}>Follow</button>
          <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={async () => { setStatus("Working..."); await runBulk("UNFOLLOW", selected); setStatus("Unfollowed selected users."); }}>Unfollow</button>
          <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={async () => { setStatus("Working..."); await runBulk("SEND_REQUEST", selected); setStatus("Sent friend requests where possible."); }}>Send Friend Request</button>
          <button className="rounded border border-red-300 px-2 py-1 text-sm text-red-700" onClick={async () => { setStatus("Working..."); await runBulk("UNFRIEND", selected); setStatus("Unfriended selected users."); }}>Unfriend</button>
          <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={() => setSelected([])}>Clear selection</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{selected.length} selected</p>
        {status ? <p className="mt-1 text-sm text-slate-600">{status}</p> : null}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-lg font-semibold">Incoming Requests</h2>
        <div className="space-y-2">
          {incoming.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded border border-slate-200 p-2">
              <span>@{r.sender.username}</span>
              <div className="flex gap-2">
                <button className="rounded bg-green-600 px-2 py-1 text-sm text-white" onClick={async () => { await fetch(`/api/friends/request/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ACCEPT" }) }); window.location.reload(); }}>Accept</button>
                <button className="rounded bg-slate-200 px-2 py-1 text-sm" onClick={async () => { await fetch(`/api/friends/request/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "DECLINE" }) }); window.location.reload(); }}>Decline</button>
              </div>
            </div>
          ))}
          {incoming.length === 0 ? <p className="text-sm text-slate-600">No incoming requests.</p> : null}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-lg font-semibold">Outgoing Requests</h2>
        <div className="space-y-2">
          {outgoing.map((r) => <p key={r.id} className="text-sm">Pending: @{r.receiver.username}</p>)}
          {outgoing.length === 0 ? <p className="text-sm text-slate-600">No outgoing requests.</p> : null}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-lg font-semibold">Friends</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {friends.map((f) => (
            <div key={f.id} className="rounded-lg bg-[#111a2a] p-2">
              <div className="mb-1 flex items-center justify-between">
                <label className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <input type="checkbox" checked={isSelected(f.id)} onChange={() => toggle(f.id)} />
                  <span>Select</span>
                </label>
                <button className="text-xs text-red-300 underline" onClick={async () => { await fetch("/api/friends/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ friendUserId: f.id }) }); window.location.reload(); }}>Remove</button>
              </div>
              <Link href={`/profile/${f.username}`} className="block overflow-hidden rounded-md">
                {f.profile?.avatarUrl ? (
                  <Image
                    src={f.profile.avatarUrl}
                    alt={f.profile?.displayName || f.username}
                    width={500}
                    height={500}
                    unoptimized
                    className="aspect-square w-full rounded-md object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md bg-[#2a3346] text-xl text-[var(--text-strong)]">
                    {(f.profile?.displayName || f.fullName || f.username).charAt(0).toUpperCase()}
                  </div>
                )}
              </Link>
              <div className="mt-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-slate-100">
                    {f.profile?.displayName || f.fullName || `@${f.username}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <button className="text-xs underline" onClick={() => quickMessage(f.username)}>Message</button>
                    <button className="text-xs text-red-300 underline" onClick={async () => { await fetch("/api/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: f.id }) }); window.location.reload(); }}>Block</button>
                  </div>
                </div>
                <p className="truncate text-xs text-slate-400">@{f.username}</p>
              </div>
            </div>
          ))}
          {friends.length === 0 ? <p className="text-sm text-slate-600">No friends yet.</p> : null}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-lg font-semibold">Suggested Friends</h2>
        <div className="space-y-2">
          {suggestions.map((s) => {
            const following = followingIds.includes(s.id);
            return (
              <div key={s.id} className="flex items-center justify-between rounded border border-slate-200 p-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={isSelected(s.id)} onChange={() => toggle(s.id)} />
                  <span>@{s.username}</span>
                </label>
                <div className="flex gap-2">
                  <button className="rounded bg-blue-600 px-2 py-1 text-sm text-white" onClick={async () => { await fetch("/api/friends/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: s.username }) }); window.location.reload(); }}>Add Friend</button>
                  <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={async () => { await runBulk(following ? "UNFOLLOW" : "FOLLOW", [s.id]); }}>{following ? "Unfollow" : "Follow"}</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
