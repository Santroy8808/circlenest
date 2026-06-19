"use client";

import { useState, useTransition } from "react";

export function FamilyRequestActions({ requestId }: { requestId: string }) {
  const [message, setMessage] = useState("");
  const [resolved, setResolved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function respond(action: "approve" | "deny") {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/social-graph/family-requests/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = (await response.json()) as { error?: string; status?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not update family request.");
        return;
      }

      setResolved(true);
      setMessage(payload.status === "APPROVED" ? "Family tag approved." : "Family tag denied.");
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {!resolved ? (
        <>
          <button className="btn-primary" disabled={isPending} onClick={() => respond("approve")} type="button">
            Approve family tag
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
