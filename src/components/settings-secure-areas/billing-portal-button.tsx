"use client";

import { useState, useTransition } from "react";

export function BillingPortalButton({ disabled }: { disabled?: boolean }) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function openPortal() {
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/billing/customer-portal", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          }
        });
        const payload = (await response.json().catch(() => null)) as { error?: string; url?: string } | null;

        if (!response.ok || !payload?.url) {
          setError(payload?.error ?? "Could not open billing management. Try again.");
          return;
        }

        window.location.assign(payload.url);
      } catch {
        setError("Could not open billing management. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="grid gap-2">
      <button className="btn-secondary" disabled={disabled || isPending} onClick={openPortal} type="button">
        {isPending ? "Opening billing..." : "Manage billing"}
      </button>
      {error ? <p className="text-sm text-red-100" role="alert">{error}</p> : null}
    </div>
  );
}
