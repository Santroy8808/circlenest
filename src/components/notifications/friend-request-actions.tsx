"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function FriendRequestActions({ onResolved, requestId }: { onResolved?: () => void; requestId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [resolved, setResolved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function respond(action: "approve" | "deny") {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/social-graph/friend-requests/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = (await response.json()) as { error?: string; status?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not update friend request.");
        return;
      }

      setResolved(true);
      setMessage(payload.status === "APPROVED" ? "Friend request approved." : "Friend request denied.");
      onResolved?.();
      router.refresh();
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {!resolved ? (
        <>
          <button className="btn-primary" disabled={isPending} onClick={() => respond("approve")} type="button">
            Approve friend
          </button>
          <button className="btn-secondary" disabled={isPending} onClick={() => respond("deny")} type="button">
            Deny
          </button>
        </>
      ) : null}
      {message ? <span className="text-sm text-[var(--muted)]">{message}</span> : null}
    </div>
  );
}
