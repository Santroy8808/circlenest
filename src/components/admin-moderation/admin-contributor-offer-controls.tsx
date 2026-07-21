"use client";

import { MembershipTier } from "@prisma/client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ContributorUpgradeOfferView } from "@/modules/membership-policy/contributor-upgrade";

type ManagedAccount = {
  id: string;
  username: string;
  role: string;
  tier: MembershipTier;
};

type OfferLoadState = "loading" | "ready" | "error" | "denied";
type ActionState =
  | { kind: "idle" }
  | { kind: "success"; message: string; commandId: string }
  | { kind: "error"; message: string; recovery: string; commandId: string };

type OfferErrorPayload = {
  error?: string;
  code?: string;
  recovery?: string;
};

type OfferMutationPayload = OfferErrorPayload & {
  contributorOffer?: ContributorUpgradeOfferView;
  revocation?: { offerId: string; alreadyRevoked: boolean };
  command?: { commandId: string; replayed: boolean };
};

const GRANT_AUDIT_REASON = "Contributor beta eligibility granted by an administrator.";
const REVOKE_AUDIT_REASON = "Contributor beta offer revoked by an administrator.";

function createCommandId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `contributor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AdminContributorOfferControls({ account }: { account: ManagedAccount }) {
  const [offer, setOffer] = useState<ContributorUpgradeOfferView | null>(null);
  const [loadState, setLoadState] = useState<OfferLoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [reason, setReason] = useState(GRANT_AUDIT_REASON);
  const [actionState, setActionState] = useState<ActionState>({ kind: "idle" });
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isPending, startTransition] = useTransition();
  const commandRef = useRef<{ fingerprint: string; commandId: string } | null>(null);
  const activeScopeRef = useRef("");

  activeScopeRef.current = `${account.id}|${account.tier}|${offer?.id ?? "none"}`;

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setLoadError("");
    setOffer(null);
    setActionState({ kind: "idle" });
    setReason(GRANT_AUDIT_REASON);
    commandRef.current = null;

    void (async () => {
      try {
        const response = await fetch(`/api/admin/accounts/${encodeURIComponent(account.id)}/contributor-offer`, {
          cache: "no-store",
          signal: controller.signal
        });
        const payload = (await response.json().catch(() => null)) as (OfferErrorPayload & { contributorOffer?: ContributorUpgradeOfferView }) | null;
        if (controller.signal.aborted) return;

        if (response.status === 404 && payload?.code === "OFFER_NOT_FOUND") {
          setOffer(null);
          setReason(GRANT_AUDIT_REASON);
          setLoadState("ready");
          return;
        }
        if (response.status === 403 && (payload?.code === "ADMIN_ACCESS_REQUIRED" || payload?.code === "TARGET_PROTECTED")) {
          setLoadState("denied");
          return;
        }
        if (!response.ok) {
          setLoadError(payload?.error ?? "Contributor eligibility could not be loaded.");
          setLoadState("error");
          return;
        }

        const nextOffer = payload?.contributorOffer ?? null;
        setOffer(nextOffer);
        setReason(nextOffer?.status === "OFFERED" ? REVOKE_AUDIT_REASON : GRANT_AUDIT_REASON);
        setLoadState("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "Contributor eligibility could not be loaded.");
        setLoadState("error");
      }
    })();

    return () => controller.abort();
  }, [account.id, account.tier, reloadVersion]);

  if (account.role !== "MEMBER" || (account.tier !== MembershipTier.FREE && account.tier !== MembershipTier.CONTRIBUTOR)) {
    return null;
  }
  if (loadState === "denied") return null;

  function commandIdFor(action: "grant" | "revoke") {
    const fingerprint = `${account.id}|${action}|${offer?.id ?? "none"}|${reason.trim()}`;
    if (commandRef.current?.fingerprint === fingerprint) return commandRef.current.commandId;
    const commandId = createCommandId();
    commandRef.current = { fingerprint, commandId };
    return commandId;
  }

  function grantOffer() {
    const requestScope = activeScopeRef.current;
    const targetUserId = account.id;
    const auditReason = reason.trim();
    const commandId = commandIdFor("grant");
    setActionState({ kind: "idle" });
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/accounts/${encodeURIComponent(targetUserId)}/contributor-offer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commandId, reason: auditReason, expiresAt: null })
        });
        const payload = (await response.json().catch(() => null)) as OfferMutationPayload | null;
        if (activeScopeRef.current !== requestScope) return;
        if (!response.ok || !payload?.contributorOffer) {
          setActionState({
            kind: "error",
            commandId,
            message: payload?.error ?? "Contributor eligibility could not be granted.",
            recovery: payload?.recovery ?? "Retry this operation after checking the account."
          });
          return;
        }

        setOffer(payload.contributorOffer);
        setReason(REVOKE_AUDIT_REASON);
        commandRef.current = null;
        setActionState({
          kind: "success",
          commandId: payload.command?.commandId ?? commandId,
          message: payload.command?.replayed
            ? "This Contributor offer was already granted. The saved operation was replayed safely."
            : "Contributor beta eligibility granted. The member can now accept the offer from Membership."
        });
      } catch {
        if (activeScopeRef.current !== requestScope) return;
        setActionState({
          kind: "error",
          commandId,
          message: "Theta-Space could not reach the membership service.",
          recovery: "Check the connection and retry. The same operation ID will be reused safely."
        });
      }
    });
  }

  function revokeOffer() {
    if (!offer || offer.status !== "OFFERED") return;
    if (!window.confirm(`Revoke @${account.username}'s Contributor beta offer? They will no longer be able to accept it.`)) return;

    const requestScope = activeScopeRef.current;
    const targetUserId = account.id;
    const offerId = offer.id;
    const auditReason = reason.trim();
    const commandId = commandIdFor("revoke");
    setActionState({ kind: "idle" });
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/accounts/${encodeURIComponent(targetUserId)}/contributor-offer`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commandId, offerId, reason: auditReason })
        });
        const payload = (await response.json().catch(() => null)) as OfferMutationPayload | null;
        if (activeScopeRef.current !== requestScope) return;
        if (!response.ok || !payload?.revocation) {
          setActionState({
            kind: "error",
            commandId,
            message: payload?.error ?? "Contributor eligibility could not be revoked.",
            recovery: payload?.recovery ?? "Refresh the account and retry the operation."
          });
          return;
        }

        setOffer(null);
        setReason(GRANT_AUDIT_REASON);
        commandRef.current = null;
        setActionState({
          kind: "success",
          commandId: payload.command?.commandId ?? commandId,
          message: payload.command?.replayed || payload.revocation.alreadyRevoked
            ? "This Contributor offer was already revoked. The saved operation was replayed safely."
            : "Contributor beta eligibility revoked."
        });
      } catch {
        if (activeScopeRef.current !== requestScope) return;
        setActionState({
          kind: "error",
          commandId,
          message: "Theta-Space could not reach the membership service.",
          recovery: "Check the connection and retry. The same operation ID will be reused safely."
        });
      }
    });
  }

  const accepted = account.tier === MembershipTier.CONTRIBUTOR || offer?.status === "ACCEPTED";

  return (
    <section className="surface rounded-md p-5" aria-labelledby="contributor-eligibility-heading">
      <h2 className="text-2xl font-semibold text-[var(--gold)]" id="contributor-eligibility-heading">2. Contributor beta eligibility</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
        Granting eligibility creates a private offer for this Free member. They choose whether to accept it from Membership.
        Contributor is free during beta and is planned to cost $4.99/month later.
      </p>

      <div className="mt-4 rounded-md border border-[var(--line)] bg-black/10 p-4" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Status</p>
        {loadState === "loading" ? <p className="mt-2 font-semibold">Loading eligibility...</p> : null}
        {loadState === "error" ? (
          <div className="mt-2 rounded-md border border-[var(--red)] bg-[var(--panel-soft)] p-3 text-sm text-[var(--text)]" role="alert">
            <p>{loadError}</p>
            <button className="btn-secondary mt-3" onClick={() => setReloadVersion((value) => value + 1)} type="button">Try again</button>
          </div>
        ) : null}
        {loadState === "ready" && accepted ? (
          <p className="mt-2 font-semibold text-[var(--green)]">Contributor active — the member already accepted the beta offer.</p>
        ) : null}
        {loadState === "ready" && !accepted && offer?.status === "OFFERED" ? (
          <div className="mt-2">
            <p className="font-semibold text-[var(--gold)]">Offer ready — awaiting member acceptance.</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Offer ID: {offer.id}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{offer.expiresAt ? `Expires ${new Date(offer.expiresAt).toLocaleDateString()}` : "No expiration date"}</p>
          </div>
        ) : null}
        {loadState === "ready" && !accepted && !offer ? (
          <p className="mt-2 font-semibold">Not eligible — no active Contributor offer.</p>
        ) : null}
      </div>

      {loadState === "ready" && account.tier === MembershipTier.FREE ? (
        <>
          <label className="mt-4 grid gap-2">
            <span className="form-label">Audit reason</span>
            <textarea
              className="form-field min-h-24"
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            {!offer ? (
              <button className="btn-primary" disabled={isPending || reason.trim().length < 5} onClick={grantOffer} type="button">
                {isPending ? "Granting..." : "Grant Contributor beta offer"}
              </button>
            ) : offer.status === "OFFERED" ? (
              <button className="btn-secondary" disabled={isPending || reason.trim().length < 5} onClick={revokeOffer} type="button">
                {isPending ? "Revoking..." : "Revoke Contributor beta offer"}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {actionState.kind === "success" ? (
        <div className="mt-4 rounded-md border border-[var(--green)] bg-[var(--panel-soft)] p-3 text-sm text-[var(--text)]" role="status">
          <p className="font-semibold">{actionState.message}</p>
          <p className="mt-1 break-all text-xs">Operation ID: {actionState.commandId}</p>
        </div>
      ) : null}
      {actionState.kind === "error" ? (
        <div className="mt-4 rounded-md border border-[var(--red)] bg-[var(--panel-soft)] p-3 text-sm text-[var(--text)]" role="alert">
          <p className="font-semibold">{actionState.message}</p>
          <p className="mt-1">{actionState.recovery}</p>
          <p className="mt-2 break-all text-xs">Retry operation ID: {actionState.commandId}</p>
        </div>
      ) : null}
    </section>
  );
}
