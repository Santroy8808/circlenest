"use client";

import type { MembershipTier } from "@prisma/client";
import { useRef, useState, useTransition } from "react";

export function SubscriptionCheckoutButton({
  disabled,
  planName,
  tier
}: {
  disabled?: boolean;
  planName?: string;
  tier: MembershipTier;
}) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const idempotencyKey = useRef<string | null>(null);

  function startCheckout() {
    setError("");
    startTransition(async () => {
      try {
        idempotencyKey.current ??= crypto.randomUUID();
        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey.current
          },
          body: JSON.stringify({ tier })
        });
        const payload = (await response.json().catch(() => null)) as { error?: string; url?: string } | null;

        if (!response.ok || !payload?.url) {
          setError(payload?.error ?? "Could not start checkout. Try again.");
          return;
        }

        window.location.assign(payload.url);
      } catch {
        setError("Could not open checkout. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="grid gap-2">
      <button className="btn-primary" disabled={disabled || isPending} onClick={startCheckout} type="button">
        {isPending ? "Opening secure checkout..." : planName ? `Upgrade to ${planName}` : "Upgrade with Stripe"}
      </button>
      {error ? <p className="text-sm text-red-100" role="alert">{error}</p> : null}
    </div>
  );
}
