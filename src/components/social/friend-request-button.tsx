"use client";

import { useState, useTransition } from "react";
import { promptForDeletePassword, withDeletePassword } from "@/lib/client/delete-password";

export function FriendRequestButton({
  isFriend,
  pending,
  targetUserId
}: {
  isFriend: boolean;
  pending?: boolean;
  targetUserId: string;
}) {
  const [friends, setFriends] = useState(isFriend);
  const [sent, setSent] = useState(Boolean(pending));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function sendRequest() {
    setError("");
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/social-graph/friend-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not send the friend request.");
        return;
      }
      setSent(true);
    });
  }

  function removeFriend() {
    setError("");
    setMessage("");
    if (!window.confirm("Remove this person from your friends? You can send a new friend request later.")) return;
    const deletePassword = promptForDeletePassword();
    if (!deletePassword) {
      setError("Friend removal cancelled. DELETE password was not entered.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/social-graph/relationships", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withDeletePassword({ toUserId: targetUserId, type: "FRIEND" }, deletePassword))
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not remove this friend.");
        return;
      }
      setFriends(false);
      setSent(false);
      setMessage("Friend removed.");
    });
  }

  return (
    <div className="grid gap-1">
      <button
        className={`btn-secondary family-action-button min-h-11${friends ? " border-red-400/60 text-red-200" : ""}`}
        disabled={sent || isPending}
        onClick={friends ? removeFriend : sendRequest}
        type="button"
      >
        {friends ? (isPending ? "Removing..." : "Remove friend") : sent ? "Request sent" : isPending ? "Sending..." : "Add friend"}
      </button>
      {message ? <p className="max-w-40 text-xs text-[var(--muted)]" role="status">{message}</p> : null}
      {error ? (
        <p className="max-w-40 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
