"use client";

import { useMemo, useState } from "react";

type UserRef = { id: string; username: string };
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

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const isSelected = (id: string) => selectedSet.has(id);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-4">
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
        <div className="space-y-2">
          {friends.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded border border-slate-200 p-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={isSelected(f.id)} onChange={() => toggle(f.id)} />
                <span>@{f.username}</span>
              </label>
              <div className="flex gap-2">
                <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={async () => { await runBulk("FOLLOW", [f.id]); }}>Follow</button>
                <button className="rounded border border-red-300 px-2 py-1 text-sm text-red-700" onClick={async () => { await fetch("/api/friends/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ friendUserId: f.id }) }); window.location.reload(); }}>Remove</button>
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
