"use client";

import { useState } from "react";

export function MarketSellerMessageButton({ sellerUserId, compact = false }: { sellerUserId: string; compact?: boolean }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

  async function startMessage() {
    setError("");
    setIsPending(true);

    try {
      const response = await fetch("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: sellerUserId })
      });
      const payload = (await response.json()) as { error?: string; thread?: { id: string } };

      if (!response.ok || !payload.thread) {
        throw new Error(payload.error ?? "Could not start message.");
      }

      window.location.href = `/messages?thread=${payload.thread.id}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start message.");
      setIsPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button className={compact ? "btn-secondary market-card-contact-button" : "btn-secondary"} disabled={isPending} onClick={startMessage} type="button">
        {isPending ? "Opening..." : compact ? "Contact seller" : "Message seller"}
      </button>
      {error ? <p className="text-sm text-red-200">{error}</p> : null}
    </div>
  );
}
