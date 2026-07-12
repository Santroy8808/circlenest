"use client";

import { SocialRelationshipType } from "@prisma/client";
import { useState, useTransition } from "react";
import type { BlockedUserView } from "@/modules/social-graph/blocked-users.service";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function BlockedUsersClient({ initialBlockedUsers }: { initialBlockedUsers: BlockedUserView[] }) {
  const [blockedUsers, setBlockedUsers] = useState(initialBlockedUsers);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingUserId, setPendingUserId] = useState("");
  const [isPending, startTransition] = useTransition();

  function unblock(userId: string) {
    setMessage("");
    setError("");
    setPendingUserId(userId);

    startTransition(async () => {
      const response = await fetch("/api/social-graph/relationships", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: userId,
          type: SocialRelationshipType.BLOCK
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not remove block.");
        setPendingUserId("");
        return;
      }

      setBlockedUsers((current) => current.filter((user) => user.id !== userId));
      setMessage("Block removed.");
      setPendingUserId("");
    });
  }

  return (
    <div className="grid gap-4">
      {message ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      {blockedUsers.length > 0 ? (
        blockedUsers.map((user) => (
          <article className="module-card flex flex-wrap items-center gap-4 rounded-md p-4" key={user.id}>
            <div className="people-avatar h-14 w-14">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={user.avatarUrl} />
              ) : (
                <span>{initials(user.displayName) || "TS"}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-[var(--gold)]">{user.displayName}</h2>
              <p className="text-sm text-[var(--muted)]">@{user.username}</p>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Blocked {new Date(user.blockedAt).toLocaleDateString()}</p>
            </div>
            <button className="btn-secondary" disabled={isPending && pendingUserId === user.id} onClick={() => unblock(user.id)} type="button">
              {isPending && pendingUserId === user.id ? "Removing..." : "Unblock"}
            </button>
          </article>
        ))
      ) : (
        <section className="surface rounded-md p-6 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No blocked users</h2>
          <p className="mt-2 text-[var(--muted)]">You have not blocked any accounts.</p>
        </section>
      )}
    </div>
  );
}
