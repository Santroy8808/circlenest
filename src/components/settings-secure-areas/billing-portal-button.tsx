"use client";

import { useState, useTransition } from "react";
import { ThetaLoading } from "@/components/platform/theta-loading";

export function BillingPortalButton({ disabled }: { disabled?: boolean }) {
  const [error, setError] = useState("");
  const [confirmCancellation, setConfirmCancellation] = useState(false);
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

  function beginBillingManagement() {
    setError("");
    setConfirmCancellation(true);
  }

  return (
    <div className="grid gap-3">
      <button className="btn-secondary" disabled={disabled || isPending} onClick={beginBillingManagement} type="button">
        {isPending ? <ThetaLoading inline label="Opening billing" size="sm" /> : "Manage billing"}
      </button>
      {confirmCancellation ? (
        <div className="grid gap-3 rounded-md border border-amber-400/50 bg-amber-950/20 p-4" role="alert">
          <p className="font-semibold text-amber-100">Before you cancel</p>
          <p className="text-sm leading-6 text-amber-50/90">
            Cancellation takes effect at the end of your paid billing period. Your account will return to the Free storage limit of 200 MB. If you are over that limit, Theta-Space archives and compresses the oldest excess files. Small previews remain available; you can prepare one archived file at a time for viewing or request a ZIP download from Subscription.
          </p>
          <p className="text-sm text-amber-50/90">Continue to Stripe to review and confirm your cancellation?</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={isPending} onClick={openPortal} type="button">
              {isPending ? <ThetaLoading inline label="Opening billing" size="sm" /> : "Continue to billing"}
            </button>
            <button className="btn-secondary" disabled={isPending} onClick={() => setConfirmCancellation(false)} type="button">
              Keep subscription
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-100" role="alert">{error}</p> : null}
    </div>
  );
}
