"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ContributorUpgradeOfferView } from "@/modules/membership-policy/contributor-upgrade";

type AcceptanceState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; replayed: boolean; message: string }
  | { kind: "error"; message: string; recovery: string };

type AcceptanceResponse = {
  activated?: boolean;
  alreadyActive?: boolean;
  error?: string;
  recovery?: string;
};

function expirationLabel(value: string | null) {
  if (!value) return "No expiration date";
  return `Accept by ${new Date(value).toLocaleDateString()}`;
}

export function ContributorBetaUpgradeCard({ offer }: { offer: ContributorUpgradeOfferView }) {
  const router = useRouter();
  const [state, setState] = useState<AcceptanceState>({ kind: "idle" });

  async function acceptOffer() {
    if (state.kind === "submitting") return;
    setState({ kind: "submitting" });

    try {
      const response = await fetch("/api/membership-policy/contributor-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: offer.id })
      });
      const payload = (await response.json().catch(() => null)) as AcceptanceResponse | null;

      if (!response.ok) {
        setState({
          kind: "error",
          message: payload?.error ?? "Contributor membership could not be activated.",
          recovery: payload?.recovery ?? "Wait a moment, refresh Membership, and try again."
        });
        return;
      }

      const replayed = payload?.alreadyActive === true || payload?.activated === false;
      setState({
        kind: "success",
        replayed,
        message: replayed
          ? "Contributor membership was already active. Your previous request completed safely."
          : "Contributor membership is now active."
      });
      router.refresh();
    } catch {
      setState({
        kind: "error",
        message: "Theta-Space could not reach the membership service.",
        recovery: "Check your connection and try again."
      });
    }
  }

  return (
    <section className="rounded-md border border-[var(--gold)]/60 bg-[var(--gold)]/5 p-5" aria-labelledby="contributor-beta-heading">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">Your beta invitation</p>
      <h2 className="mt-2 text-2xl font-semibold" id="contributor-beta-heading">Upgrade to Contributor</h2>
      <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
        Contributor is free for beta testers now and is planned to cost $4.99/month in the future.
        Accepting this beta offer does not start paid billing.
      </p>
      <p className="mt-2 text-sm text-[var(--muted)]">{expirationLabel(offer.expiresAt)}</p>

      {state.kind === "error" ? (
        <div className="mt-4 rounded-md border border-[var(--red)] bg-[var(--panel-soft)] p-3 text-sm text-[var(--text)]" role="alert">
          <p className="font-semibold">{state.message}</p>
          <p className="mt-1">{state.recovery}</p>
        </div>
      ) : null}
      {state.kind === "success" ? (
        <div className="mt-4 rounded-md border border-[var(--green)] bg-[var(--panel-soft)] p-3 text-sm text-[var(--text)]" role="status">
          <p className="font-semibold">{state.message}</p>
          <p className="mt-1">Membership is refreshing to show your current Contributor access.</p>
        </div>
      ) : null}

      <button
        className="btn-primary mt-5"
        disabled={state.kind === "submitting" || state.kind === "success"}
        onClick={acceptOffer}
        type="button"
      >
        {state.kind === "submitting" ? "Activating Contributor..." : state.kind === "success" ? "Contributor activated" : "Accept free beta upgrade"}
      </button>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]" aria-live="polite">
        {state.kind === "submitting" ? "Please keep this page open while your membership is activated." : "You will be told before any future paid subscription begins."}
      </p>
    </section>
  );
}
