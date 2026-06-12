"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DirectMessageButton } from "@/components/messages/direct-message-button";

type FriendCard = {
  id: string;
  username: string;
  fullName?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  locationLabel?: string | null;
  relationshipStatus?: string | null;
  lastInteractionAt?: string | null;
};

function displayName(person: FriendCard) {
  return person.displayName || person.fullName || `@${person.username}`;
}

function initials(person: FriendCard) {
  return displayName(person).charAt(0).toUpperCase();
}

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
  suggestions,
  followingIds,
  sort,
}: {
  friends: FriendCard[];
  suggestions: FriendCard[];
  followingIds: string[];
  sort: "alpha" | "family" | "interacted" | "location";
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<FriendCard[]>([]);
  const [searchStatus, setSearchStatus] = useState("");

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
      const body = (await res.json()) as { people?: FriendCard[] };
      const rows = Array.isArray(body.people) ? body.people : [];
      setSearchResults(rows.map((person) => ({ ...person, locationLabel: "" })));
      setSearchStatus(rows.length ? `Found ${rows.length}` : "No matches found.");
    } catch {
      setSearchStatus("Could not search right now.");
    }
  }

  const sortLabels: Record<typeof sort, string> = {
    alpha: "Alphabetical",
    family: "Family first",
    interacted: "Most interacted",
    location: "Location",
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-strong)]">Friends</h1>
            <p className="text-sm text-slate-400">A visual view of the people you connect with.</p>
          </div>
          <label className="grid gap-1 text-xs uppercase tracking-[0.16em] text-slate-500">
            Sort by
            <select
              value={sort}
              onChange={(event) => router.push(`/friends?sort=${encodeURIComponent(event.target.value)}`)}
              className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-[var(--accent)]/50"
            >
              <option value="alpha">Alphabetical</option>
              <option value="family">Family first</option>
              <option value="interacted">Most interacted with</option>
              <option value="location">Location</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4">
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">Find People</h2>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-[var(--accent)]/50"
            placeholder="Search by username, name, or email"
          />
          <button className="rounded-full bg-[#376ef8] px-4 py-2 text-sm font-semibold text-white" onClick={() => void runSearch()}>
            Search
          </button>
        </div>
        {searchStatus ? <p className="mt-2 text-xs text-slate-400">{searchStatus}</p> : null}
        {searchResults.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {searchResults.map((person) => (
              <FriendCardView key={person.id} person={person} actions={
                <>
                  <Link href={`/profile/${person.username}`} className="rounded-full border border-[#304058] px-3 py-1.5 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white">
                    View
                  </Link>
                  <DirectMessageButton username={person.username} className="rounded-full border border-[#304058] px-3 py-1.5 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white" />
                  <button className="rounded-full bg-[#376ef8] px-3 py-1.5 text-xs font-semibold text-white" onClick={async () => { await fetch("/api/friends/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: person.username }) }); window.location.reload(); }}>
                    Add Friend
                  </button>
                  <button className="rounded-full border border-red-400/60 px-3 py-1.5 text-xs text-red-200 transition hover:border-red-300 hover:text-white" onClick={async () => { await fetch("/api/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: person.username }) }); window.location.reload(); }}>
                    Block
                  </button>
                </>
              } />
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">Friends</h2>
            <p className="text-sm text-slate-400">{friends.length} friends sorted by {sortLabels[sort].toLowerCase()}.</p>
          </div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">No bulk controls here</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {friends.map((friend) => (
            <FriendCardView
              key={friend.id}
              person={friend}
              actions={
                <>
                  <Link href={`/profile/${friend.username}`} className="rounded-full border border-[#304058] px-3 py-1.5 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white">
                    View
                  </Link>
                  <DirectMessageButton username={friend.username} className="rounded-full border border-[#304058] px-3 py-1.5 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white" />
                  <button className="rounded-full border border-red-400/60 px-3 py-1.5 text-xs text-red-200 transition hover:border-red-300 hover:text-white" onClick={async () => { await fetch("/api/friends/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ friendUserId: friend.id }) }); window.location.reload(); }}>
                    Remove
                  </button>
                  <button className="rounded-full border border-red-400/60 px-3 py-1.5 text-xs text-red-200 transition hover:border-red-300 hover:text-white" onClick={async () => { await fetch("/api/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: friend.id }) }); window.location.reload(); }}>
                    Block
                  </button>
                </>
              }
            />
          ))}
          {friends.length === 0 ? <p className="text-sm text-slate-400">No friends yet.</p> : null}
        </div>
      </section>

      <section className="rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">Suggested Friends</h2>
          <p className="text-sm text-slate-400">A few people you may want to connect with next.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {suggestions.map((person) => {
            const following = followingIds.includes(person.id);
            return (
              <FriendCardView
                key={person.id}
                person={person}
                actions={
                  <>
                    <Link href={`/profile/${person.username}`} className="rounded-full border border-[#304058] px-3 py-1.5 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white">
                      View
                    </Link>
                    <DirectMessageButton username={person.username} className="rounded-full border border-[#304058] px-3 py-1.5 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white" />
                    <button className="rounded-full bg-[#376ef8] px-3 py-1.5 text-xs font-semibold text-white" onClick={async () => { await fetch("/api/friends/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: person.username }) }); window.location.reload(); }}>
                      Add Friend
                    </button>
                    <button className="rounded-full border border-[#304058] px-3 py-1.5 text-xs text-slate-200 transition hover:border-[#4a5a78] hover:text-white" onClick={async () => { await runBulk(following ? "UNFOLLOW" : "FOLLOW", [person.id]); }}>
                      {following ? "Unfollow" : "Follow"}
                    </button>
                  </>
                }
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function FriendCardView({
  person,
  actions,
}: {
  person: FriendCard;
  actions: ReactNode;
}) {
  return (
    <article className="group overflow-hidden rounded-[18px] border border-[#273449] bg-[#111a2a] transition hover:-translate-y-0.5 hover:border-[#3b4f6c] hover:bg-[#162033] hover:shadow-[0_18px_36px_rgba(0,0,0,0.25)]">
      <Link href={`/profile/${person.username}`} className="block p-3">
        <div className="overflow-hidden rounded-[14px] border border-[#304058] bg-[#182232]">
          {person.avatarUrl ? (
            <Image
              src={person.avatarUrl}
              alt={displayName(person)}
              width={640}
              height={640}
              unoptimized
              className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-[#25324a] to-[#131d2c] text-4xl font-semibold text-[var(--text-strong)]">
              {initials(person)}
            </div>
          )}
        </div>
        <div className="mt-3 space-y-1">
          <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{displayName(person)}</p>
          <p className="truncate text-xs uppercase tracking-[0.14em] text-slate-400">@{person.username}</p>
          {person.locationLabel ? <p className="truncate text-xs text-slate-400">{person.locationLabel}</p> : null}
          {person.relationshipStatus ? <p className="truncate text-xs text-amber-200">{person.relationshipStatus}</p> : null}
          {person.lastInteractionAt ? <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Last interacted {new Date(person.lastInteractionAt).toLocaleDateString()}</p> : null}
        </div>
      </Link>
      <div className="flex flex-wrap gap-2 border-t border-[#273449] px-3 py-3">
        {actions}
      </div>
    </article>
  );
}
