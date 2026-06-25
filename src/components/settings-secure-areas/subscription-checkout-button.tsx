"use client";

import type { MembershipTier } from "@prisma/client";
import { useState, useTransition } from "react";

export function SubscriptionCheckoutButton({ disabled, tier }: { disabled?: boolean; tier: MembershipTier }) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function startCheckout() {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; url?: string } | null;

      if (!response.ok || !payload?.url) {
        setError(payload?.error ?? "Could not start checkout.");
        return;
      }

      window.location.href = payload.url;
    });
  }

  return (
    <div className="grid gap-2">
      <button className="btn-primary" disabled={disabled || isPending} onClick={startCheckout} type="button">
        {isPending ? "Opening Stripe..." : "Upgrade with Stripe"}
      </button>
      {error ? <p className="text-sm text-red-100">{error}</p> : null}
    </div>
  );
}
