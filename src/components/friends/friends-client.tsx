"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

type UserRef = {
  id: string;
  username: string;
  fullName?: string | null;
  profile?: { displayName?: string | null; avatarUrl?: string | null } | null;
};
type Incoming = { id: string; sender: UserRef };
type Outgoing = { id: string; receiver: UserRef };
type ViewMode = "friends" | "requests" | "find" | "suggestions" | "manage";

async function runBulk(action: "FOLLOW" | "UNFOLLOW" | "SEND_REQUEST" | "UNFRIEND", userIds: string[]) {
  await fetch("/api/connections/bulk", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, userIds }),
  });
}

function displayName(person: UserRef) {
  return person.fullName ?? person.profile?.displayName ?? person.username;
}

function openMailTo(person: UserRef) {
  window.dispatchEvent(new CustomEvent("theta-mail-compose", { detail: { recipient: person.username } }));
}

function Avatar({ person, size = "large" }: { person: UserRef; size?: "small" | "large" }) {
  const name = displayName(person);
  const className = size === "small" ? "h-11 w-11 rounded-full" : "aspect-square w-full rounded-md";
  if (person.profile?.avatarUrl) {
    return (
      <Image
        src={person.profile.avatarUrl}
        alt={name}
        width={size === "small" ? 96 : 384}
        height={size === "small" ? 96 : 384}
        sizes={size === "small" ? "44px" : "(min-width: 768px) 180px, 50vw"}
        className={`${className} object-cover`}
      />
    );
  }

  return (
    <div className={`${className} flex items-center justify-center bg-[var(--bg-soft)] text-2xl font-semibold text-[var(--text-strong)]`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function PersonCard({
  person,
  selected,
  selectable,
  onSelect,
  actions,
}: {
  person: UserRef;
  selected?: boolean;
  selectable?: boolean;
  onSelect?: () => void;
  actions: ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)]">
      <Link href={`/profile/${person.username}`} className="block">
        <Avatar person={person} />
      </Link>
      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/profile/${person.username}`} className="block truncate text-sm font-semibold text-[var(--text-strong)]">
              {displayName(person)}
            </Link>
            <p className="truncate text-xs text-slate-400">@{person.username}</p>
          </div>
          {selectable ? (
            <button
              type="button"
              aria-pressed={selected}
              title={selected ? "Selected" : "Select"}
              className={`h-8 w-8 shrink-0 rounded-md border text-xs font-bold ${selected ? "border-[#d6b24a] bg-[#d6b24a] text-[#1a1204]" : "border-[var(--border)] bg-[var(--bg-soft)] text-slate-300"}`}
              onClick={onSelect}
            >
              {selected ? "OK" : "+"}
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">{actions}</div>
      </div>
    </article>
  );
}

function ActionButton({
  children,
  tone = "neutral",
  onClick,
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "danger";
  onClick: () => void;
}) {
  const toneClass =
    tone === "gold"
      ? "border-[#6a5420] bg-[#c49a35] text-[#1a1204]"
      : tone === "danger"
        ? "border-red-400/50 bg-red-950/30 text-red-100"
        : "border-[var(--border)] bg-[var(--bg-soft)] text-slate-100";
  return (
    <button type="button" className={`rounded-md border px-3 py-2 text-xs font-semibold ${toneClass}`} onClick={onClick}>
      {children}
    </button>
  );
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
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>("friends");
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserRef[]>([]);
  const [searchStatus, setSearchStatus] = useState("");

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const isSelected = (id: string) => selectedSet.has(id);
  const pendingCount = incoming.length + outgoing.length;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  async function refreshAfter(action: Promise<unknown>) {
    await action;
    router.refresh();
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
        setSearchStatus("Search is unavailable.");
        return;
      }
      const body = (await res.json()) as { people?: UserRef[] };
      const rows = Array.isArray(body.people) ? body.people : [];
      setSearchResults(rows);
      setSearchStatus(rows.length ? `${rows.length} found` : "No matches.");
    } catch {
      setSearchStatus("Search is unavailable.");
    }
  }

  async function runSelected(action: "FOLLOW" | "UNFOLLOW" | "SEND_REQUEST" | "UNFRIEND", message: string) {
    if (!selected.length) {
      setStatus("Select people first.");
      return;
    }
    setStatus("Working...");
    await runBulk(action, selected);
    setStatus(message);
    setSelected([]);
    router.refresh();
  }

  const modeCards: Array<{ id: ViewMode; mark: string; label: string; count: string }> = [
    { id: "friends", mark: "FR", label: "Friends", count: String(friends.length) },
    { id: "requests", mark: "IN", label: "Requests", count: String(pendingCount) },
    { id: "find", mark: "SE", label: "Find", count: "Search" },
    { id: "suggestions", mark: "SG", label: "Suggestions", count: String(suggestions.length) },
    { id: "manage", mark: "MG", label: "Manage", count: String(selected.length) },
  ];

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="relative h-40 bg-[var(--bg-soft)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(214,178,74,0.24),transparent_32%),linear-gradient(135deg,#111a2a,#080b12)]" />
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">People</p>
            <h1 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">Friends</h1>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-5">
          {modeCards.map((card) => (
            <button
              key={card.id}
              type="button"
              className={`rounded-md border p-3 text-left ${mode === card.id ? "border-[#d6b24a] bg-[#1a2030]" : "border-[var(--border)] bg-[var(--bg-soft)]"}`}
              onClick={() => setMode(card.id)}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] text-xs font-bold text-[var(--text-strong)]">
                {card.mark}
              </span>
              <span className="mt-3 block text-sm font-semibold text-slate-100">{card.label}</span>
              <span className="mt-1 block text-xs text-slate-400">{card.count}</span>
            </button>
          ))}
        </div>
      </section>

      {mode === "friends" ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {friends.map((friend) => (
            <PersonCard
              key={friend.id}
              person={friend}
              actions={
                <>
                  <ActionButton onClick={() => openMailTo(friend)} tone="gold">Mail</ActionButton>
                  <ActionButton onClick={() => void refreshAfter(fetch("/api/friends/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ friendUserId: friend.id }) }))} tone="danger">Remove</ActionButton>
                </>
              }
            />
          ))}
          {friends.length === 0 ? <p className="card col-span-full p-6 text-center text-sm text-slate-300">No friends yet.</p> : null}
        </section>
      ) : null}

      {mode === "requests" ? (
        <section className="space-y-3">
          {incoming.map((request) => (
            <div key={request.id} className="card flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar person={request.sender} size="small" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{displayName(request.sender)}</p>
                  <p className="truncate text-xs text-slate-400">@{request.sender.username}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <ActionButton onClick={() => void refreshAfter(fetch(`/api/friends/request/${request.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ACCEPT" }) }))} tone="gold">Accept</ActionButton>
                <ActionButton onClick={() => void refreshAfter(fetch(`/api/friends/request/${request.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "DECLINE" }) }))}>Decline</ActionButton>
              </div>
            </div>
          ))}
          {outgoing.map((request) => (
            <div key={request.id} className="card flex items-center gap-3 p-3">
              <Avatar person={request.receiver} size="small" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{displayName(request.receiver)}</p>
                <p className="truncate text-xs text-slate-400">Pending @{request.receiver.username}</p>
              </div>
            </div>
          ))}
          {pendingCount === 0 ? <p className="card p-6 text-center text-sm text-slate-300">No pending requests.</p> : null}
        </section>
      ) : null}

      {mode === "find" ? (
        <section className="card p-4">
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runSearch();
              }}
              placeholder="Handle, name, or email"
            />
            <button type="button" className="rounded-md border border-[#6a5420] bg-[#c49a35] px-4 py-2 text-sm font-semibold text-[#1a1204]" onClick={() => void runSearch()}>
              Search
            </button>
          </div>
          {searchStatus ? <p className="mt-3 text-xs text-slate-400">{searchStatus}</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {searchResults.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                actions={
                  <>
                    <ActionButton onClick={() => void refreshAfter(fetch("/api/friends/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: person.username }) }))} tone="gold">Add</ActionButton>
                    <ActionButton onClick={() => openMailTo(person)}>Mail</ActionButton>
                    <ActionButton onClick={() => void refreshAfter(fetch("/api/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: person.username }) }))} tone="danger">Block</ActionButton>
                    <Link href={`/profile/${person.username}`} className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-center text-xs font-semibold text-slate-100">Profile</Link>
                  </>
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {mode === "suggestions" ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {suggestions.map((person) => {
            const following = followingIds.includes(person.id);
            return (
              <PersonCard
                key={person.id}
                person={person}
                selected={isSelected(person.id)}
                selectable
                onSelect={() => toggle(person.id)}
                actions={
                  <>
                    <ActionButton onClick={() => void refreshAfter(fetch("/api/friends/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: person.username }) }))} tone="gold">Add</ActionButton>
                    <ActionButton onClick={async () => { await runBulk(following ? "UNFOLLOW" : "FOLLOW", [person.id]); router.refresh(); }}>{following ? "Unfollow" : "Follow"}</ActionButton>
                  </>
                }
              />
            );
          })}
          {suggestions.length === 0 ? <p className="card col-span-full p-6 text-center text-sm text-slate-300">No suggestions right now.</p> : null}
        </section>
      ) : null}

      {mode === "manage" ? (
        <section className="card space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ActionButton onClick={() => void runSelected("FOLLOW", "Followed selected people.")} tone="gold">Follow</ActionButton>
            <ActionButton onClick={() => void runSelected("UNFOLLOW", "Unfollowed selected people.")}>Unfollow</ActionButton>
            <ActionButton onClick={() => void runSelected("SEND_REQUEST", "Requests sent.")}>Add</ActionButton>
            <ActionButton onClick={() => void runSelected("UNFRIEND", "Removed selected friends.")} tone="danger">Unfriend</ActionButton>
          </div>
          <p className="text-xs text-slate-400">{selected.length} selected</p>
          {status ? <p className="text-sm text-slate-300">{status}</p> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[...friends, ...suggestions].map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                selected={isSelected(person.id)}
                selectable
                onSelect={() => toggle(person.id)}
                actions={<ActionButton onClick={() => toggle(person.id)}>{isSelected(person.id) ? "Unselect" : "Select"}</ActionButton>}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
