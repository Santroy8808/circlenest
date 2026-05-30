"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function messageForReason(reason?: string) {
  if (reason === "idle") return "Secure access expired after 15 minutes of inactivity. Please re-enter your password.";
  if (reason === "locked") return "This secure area is locked. Please re-enter your password to continue.";
  return "Re-enter your password to open this secure area.";
}

export function SecureAreaUnlockClient({ next, reason }: { next: string; reason?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <div className="card w-full p-6">
        <h1 className="mb-2 text-xl font-semibold text-[var(--text-strong)]">Secure Area Unlock</h1>
        <p className="mb-4 text-sm text-slate-300">{messageForReason(reason)}</p>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setStatus("Unlocking...");
            const response = await fetch("/api/auth/secure-area/unlock", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({ password, next }),
            });
            if (!response.ok) {
              const body = (await response.json().catch(() => ({}))) as { error?: string };
              setBusy(false);
              setStatus(body.error ?? "Could not unlock secure area.");
              return;
            }
            router.replace(next);
            router.refresh();
          }}
        >
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
            minLength={8}
            placeholder="Enter your password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-60"
          >
            Unlock Secure Area
          </button>
        </form>
        {status ? <p className="mt-3 text-sm text-slate-300">{status}</p> : null}
      </div>
    </main>
  );
}
