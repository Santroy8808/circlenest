"use client";

import { useState, useTransition } from "react";

export function FriendRequestButton({
  isFriend,
  pending,
  targetUserId
}: {
  isFriend: boolean;
  pending?: boolean;
  targetUserId: string;
}) {
  const [sent, setSent] = useState(Boolean(pending));
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function sendRequest() {
    setError("");
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

  return (
    <div className="grid gap-1">
      <button
        className="btn-secondary family-action-button min-h-11"
        disabled={isFriend || sent || isPending}
        onClick={sendRequest}
        type="button"
      >
        {isFriend ? "Friends" : sent ? "Request sent" : isPending ? "Sending..." : "Add friend"}
      </button>
      {error ? (
        <p className="max-w-40 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
