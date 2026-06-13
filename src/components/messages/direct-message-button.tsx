"use client";

import { useState } from "react";

export function DirectMessageButton({
  username,
  userId,
  className,
  label = "Message",
}: {
  username?: string;
  userId?: string;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={
          className ??
          "inline-flex min-h-9 items-center rounded-md border border-[#6a5420] bg-[#b89033] px-3 py-1.5 text-sm font-semibold text-[#1a1204] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)] transition hover:bg-[#c59a36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6b25a] disabled:opacity-60"
        }
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          const normalized = username?.trim().replace(/^@+/, "") ?? "";
          if (!normalized && !userId) {
            setError("No message target found.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/messages/threads", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(userId ? { userId } : { username: normalized }),
            });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              setError(body.error ?? "Could not open direct message.");
              return;
            }
            const body = (await res.json()) as { id: string };
            try {
              window.localStorage.setItem("theta.activeChatThreadId", body.id);
            } catch {}
            window.dispatchEvent(
              new CustomEvent("theta-chat-open", {
                detail: {
                  threadId: body.id,
                  title: normalized ? `@${normalized}` : "Chat",
                  subtitle: "Opening thread...",
                },
              }),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening..." : label}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
