"use client";

import { useState, useTransition } from "react";

export function AdCreditCheckoutButton({ disabled, packageKey }: { disabled?: boolean; packageKey: string }) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function startCheckout() {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/billing/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageKey })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; url?: string } | null;

      if (!response.ok || !payload?.url) {
        setError(payload?.error ?? "Could not start credit checkout.");
        return;
      }

      window.location.href = payload.url;
    });
  }

  return (
    <div className="grid gap-2">
      <button className="btn-primary" disabled={disabled || isPending} onClick={startCheckout} type="button">
        {isPending ? "Opening Stripe..." : "Buy credits"}
      </button>
      {error ? <p className="text-sm text-red-100">{error}</p> : null}
    </div>
  );
}
