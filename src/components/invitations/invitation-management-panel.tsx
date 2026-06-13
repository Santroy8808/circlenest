"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type InvitationRow = {
  id: string;
  inviter?: { username: string; email: string } | null;
  inviteeUser?: { username: string; email: string } | null;
  reviewedBy?: { username: string; email: string } | null;
  inviteeEmail: string;
  inviteeName: string;
  inviteePhone: string | null;
  status: string;
  reviewStatus: string;
  currentOrg: string | null;
  lastServiceDate: string | null;
  lastServiceName: string | null;
  isActiveScientologist: boolean | null;
  isInGoodStanding: boolean | null;
  agreedToPrivateMembershipTerms: boolean;
  qualificationNotes: string | null;
  applicationFeeAmountCents: number | null;
  applicationFeeCurrency: string | null;
  applicationFeePaidAt: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  rejectedAt: string | null;
  resubmittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditRow = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  note: string | null;
  createdAt: string;
  actor: { username: string };
};

export type InvitationManagementPanelProps = {
  mode: "member" | "admin";
  canInvite: boolean;
  reason: string | null;
  inviteLimit: number | null;
  activeCount: number;
  hasInviteLimitException: boolean;
  initialInvites: InvitationRow[];
  initialAudit?: AuditRow[];
};

type FormState = {
  inviteeName: string;
  inviteeEmail: string;
  inviteePhone: string;
  currentOrg: string;
  lastServiceDate: string;
  lastServiceName: string;
  isActiveScientologist: boolean;
  isInGoodStanding: boolean;
  agreedToPrivateMembershipTerms: boolean;
  qualificationNotes: string;
  applicationFeeAmountCents: string;
  applicationFeeCurrency: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function statusBadgeClass(status: string) {
  const normalized = status.trim().toUpperCase();
  if (normalized === "ACCEPTED") return "border border-emerald-400/40 bg-emerald-300/10 text-emerald-200";
  if (normalized === "PENDING" || normalized === "RESUBMITTED" || normalized === "PENDING_REVIEW") {
    return "border border-amber-400/40 bg-amber-300/10 text-amber-200";
  }
  if (normalized === "REJECTED" || normalized === "REVOKED" || normalized === "EXPIRED") {
    return "border border-rose-400/40 bg-rose-300/10 text-rose-200";
  }
  return "border border-slate-400/40 bg-slate-300/10 text-slate-200";
}

function limitLabel(limit: number | null, hasInviteLimitException: boolean) {
  if (hasInviteLimitException) return "Unlimited with Prophet exception";
  if (limit === null) return "Unlimited";
  return `${limit} active invites`;
}

export function InvitationManagementPanel({
  mode,
  canInvite,
  reason,
  inviteLimit,
  activeCount,
  hasInviteLimitException,
  initialInvites,
  initialAudit = [],
}: InvitationManagementPanelProps) {
  const [form, setForm] = useState<FormState>({
    inviteeName: "",
    inviteeEmail: "",
    inviteePhone: "",
    currentOrg: "",
    lastServiceDate: "",
    lastServiceName: "",
    isActiveScientologist: true,
    isInGoodStanding: true,
    agreedToPrivateMembershipTerms: false,
    qualificationNotes: "",
    applicationFeeAmountCents: "",
    applicationFeeCurrency: "USD",
  });
  const [status, setStatus] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [invites, setInvites] = useState(initialInvites);
  const [auditRows, setAuditRows] = useState(initialAudit);
  const [savingAction, setSavingAction] = useState<string>("");

  const derivedActiveCount = useMemo(
    () =>
      invites.filter((invite) => {
        const normalized = invite.status.trim().toUpperCase();
        return normalized === "PENDING" || normalized === "RESUBMITTED" || normalized === "PENDING_REVIEW";
      }).length,
    [invites],
  );

  const remainingCount = useMemo(() => {
    if (hasInviteLimitException || inviteLimit === null) return null;
    return Math.max(0, inviteLimit - derivedActiveCount);
  }, [derivedActiveCount, hasInviteLimitException, inviteLimit]);

  async function submitInvite() {
    if (!canInvite) return;
    const payload = {
      inviteeName: form.inviteeName.trim(),
      inviteeEmail: form.inviteeEmail.trim(),
      inviteePhone: form.inviteePhone.trim() || null,
      currentOrg: form.currentOrg.trim(),
      lastServiceDate: form.lastServiceDate.trim(),
      lastServiceName: form.lastServiceName.trim(),
      isActiveScientologist: form.isActiveScientologist,
      isInGoodStanding: form.isInGoodStanding,
      agreedToPrivateMembershipTerms: form.agreedToPrivateMembershipTerms,
      qualificationNotes: form.qualificationNotes.trim() || null,
      applicationFeeAmountCents: form.applicationFeeAmountCents.trim() ? Number(form.applicationFeeAmountCents) : null,
      applicationFeeCurrency: form.applicationFeeAmountCents.trim() ? form.applicationFeeCurrency.trim() : null,
    };
    if (!payload.inviteeName || !payload.inviteeEmail || !payload.currentOrg || !payload.lastServiceDate || !payload.lastServiceName) {
      setStatus("Fill in the required fields.");
      return;
    }
    if (!payload.agreedToPrivateMembershipTerms) {
      setStatus("Terms agreement is required.");
      return;
    }

    setStatus("Creating invite...");
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as
      | { invitation?: InvitationRow; inviteCode?: string; error?: string }
      | Record<string, never>;
    if (!res.ok || !("invitation" in body) || !body.invitation || !("inviteCode" in body) || !body.inviteCode) {
      setStatus((body as { error?: string }).error ?? "Could not create invite.");
      return;
    }

    setInvites((prev) => [body.invitation!, ...prev].slice(0, 12));
    setInviteCode(body.inviteCode);
    setStatus("Invite created.");
    setForm((prev) => ({
      ...prev,
      inviteeName: "",
      inviteeEmail: "",
      inviteePhone: "",
      currentOrg: "",
      lastServiceDate: "",
      lastServiceName: "",
      isActiveScientologist: true,
      isInGoodStanding: true,
      agreedToPrivateMembershipTerms: false,
      qualificationNotes: "",
      applicationFeeAmountCents: "",
      applicationFeeCurrency: "USD",
    }));
  }

  async function runAdminAction(invitationId: string, action: "APPROVE" | "REJECT" | "REVOKE" | "EXPIRE" | "RESUBMIT") {
    setSavingAction(`${invitationId}:${action}`);
    const res = await fetch(`/api/admin/invitations/${invitationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = (await res.json().catch(() => ({}))) as { invitation?: InvitationRow; error?: string };
    if (!res.ok || !body.invitation) {
      setStatus(body.error ?? "Could not update invite.");
      setSavingAction("");
      return;
    }
    setInvites((prev) => prev.map((row) => (row.id === invitationId ? body.invitation! : row)));
    if (action === "RESUBMIT") {
      setStatus("Invite resubmitted.");
    } else {
      setStatus(`Invite ${action.toLowerCase()}.`);
    }
    setSavingAction("");
  }

  const inviteLink = inviteCode ? `/signup?invite=${encodeURIComponent(inviteCode)}` : "";
  const policyText = canInvite
    ? `Invite limit: ${limitLabel(inviteLimit, hasInviteLimitException)}. Active invites: ${derivedActiveCount}${remainingCount !== null ? ` | Remaining: ${remainingCount}` : ""}`
    : hasInviteLimitException
      ? "Prophet exception active."
      : inviteLimit === null
        ? "Invites are currently locked."
        : `Invite access will allow up to ${limitLabel(inviteLimit, hasInviteLimitException)} once unlocked.`;

  return (
    <section className="mt-3 rounded border border-[var(--border)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">
            {mode === "admin" ? "Invite Management" : "Invite a New Member"}
          </h2>
          <p className="mt-1 text-xs text-slate-400">{policyText}</p>
          {hasInviteLimitException ? <p className="mt-1 text-xs text-amber-300">Prophet exception active.</p> : null}
        </div>
        {!canInvite ? <p className="text-xs text-amber-300">{reason ?? "Invite access is locked."}</p> : null}
      </div>

      {canInvite ? (
        <div className="mt-3 grid gap-2 rounded border border-[var(--border)] p-3">
          <p className="text-xs text-slate-400">Fill out the qualification form for your invite.</p>
          <div className="grid gap-2 md:grid-cols-2">
            <input value={form.inviteeName} onChange={(e) => setForm((prev) => ({ ...prev, inviteeName: e.target.value }))} placeholder="Invitee name" className="rounded border px-3 py-2 text-sm" />
            <input value={form.inviteeEmail} onChange={(e) => setForm((prev) => ({ ...prev, inviteeEmail: e.target.value }))} type="email" placeholder="Invitee email" className="rounded border px-3 py-2 text-sm" />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <input value={form.inviteePhone} onChange={(e) => setForm((prev) => ({ ...prev, inviteePhone: e.target.value }))} placeholder="Invitee phone (optional)" className="rounded border px-3 py-2 text-sm" />
            <input value={form.currentOrg} onChange={(e) => setForm((prev) => ({ ...prev, currentOrg: e.target.value }))} placeholder="Current org" className="rounded border px-3 py-2 text-sm" />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <input value={form.lastServiceDate} onChange={(e) => setForm((prev) => ({ ...prev, lastServiceDate: e.target.value }))} placeholder="Last service date" className="rounded border px-3 py-2 text-sm" />
            <input value={form.lastServiceName} onChange={(e) => setForm((prev) => ({ ...prev, lastServiceName: e.target.value }))} placeholder="Last service name" className="rounded border px-3 py-2 text-sm" />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActiveScientologist} onChange={(e) => setForm((prev) => ({ ...prev, isActiveScientologist: e.target.checked }))} />
              Active Scientologist
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isInGoodStanding} onChange={(e) => setForm((prev) => ({ ...prev, isInGoodStanding: e.target.checked }))} />
              In good standing
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.agreedToPrivateMembershipTerms} onChange={(e) => setForm((prev) => ({ ...prev, agreedToPrivateMembershipTerms: e.target.checked }))} />
              Terms agreed
            </label>
          </div>
          <textarea value={form.qualificationNotes} onChange={(e) => setForm((prev) => ({ ...prev, qualificationNotes: e.target.value }))} rows={3} placeholder="Qualification notes (optional)" className="rounded border px-3 py-2 text-sm" />
          <div className="grid gap-2 md:grid-cols-2">
            <input value={form.applicationFeeAmountCents} onChange={(e) => setForm((prev) => ({ ...prev, applicationFeeAmountCents: e.target.value }))} placeholder="Application fee cents (optional)" className="rounded border px-3 py-2 text-sm" />
            <input value={form.applicationFeeCurrency} onChange={(e) => setForm((prev) => ({ ...prev, applicationFeeCurrency: e.target.value }))} placeholder="Fee currency" className="rounded border px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void submitInvite()} className="rounded border px-3 py-2 text-sm">
              Create Invite
            </button>
            {inviteCode ? (
              <>
                <Link href={inviteLink} className="rounded border px-3 py-2 text-sm underline underline-offset-2">
                  Open signup link
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`${window.location.origin}${inviteLink}`);
                      setStatus("Invite link copied.");
                    } catch {
                      setStatus("Could not copy link.");
                    }
                  }}
                  className="rounded border px-3 py-2 text-sm"
                >
                  Copy link
                </button>
              </>
            ) : null}
          </div>
          {inviteCode ? <p className="text-xs text-emerald-300">Invite code: {inviteCode}</p> : null}
          {status ? <p className="text-xs text-slate-300">{status}</p> : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          {mode === "admin" ? "Recent invites" : "Your invites"}
        </h3>
        {invites.length ? (
          <div className="grid gap-2">
            {invites.map((invite) => (
              <article key={invite.id} className="rounded border border-[var(--border)] p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-400">{invite.inviteeEmail}{invite.inviteePhone ? ` | ${invite.inviteePhone}` : ""}</p>
                    <p className="text-xs text-slate-500">Org: {invite.currentOrg ?? "-"} | Last service: {invite.lastServiceName ?? "-"} | {invite.lastServiceDate ?? "-"}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusBadgeClass(invite.status)}`}>
                    {invite.status}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-slate-400 md:grid-cols-2">
                  <p>Created: {formatDate(invite.createdAt)}</p>
                  <p>Expires: {formatDate(invite.expiresAt)}</p>
                  <p>Review: {invite.reviewStatus}</p>
                  <p>Accepted: {formatDate(invite.acceptedAt)}</p>
                  <p>Rejected: {formatDate(invite.rejectedAt)}</p>
                  <p>Revoked: {formatDate(invite.revokedAt)}</p>
                </div>
                {invite.qualificationNotes ? <p className="mt-2 text-xs text-slate-300">Notes: {invite.qualificationNotes}</p> : null}
                {mode === "admin" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={savingAction === `${invite.id}:APPROVE`} onClick={() => void runAdminAction(invite.id, "APPROVE")} className="rounded border px-3 py-1.5 text-xs">
                      Approve
                    </button>
                    <button type="button" disabled={savingAction === `${invite.id}:REJECT`} onClick={() => void runAdminAction(invite.id, "REJECT")} className="rounded border px-3 py-1.5 text-xs">
                      Reject
                    </button>
                    <button type="button" disabled={savingAction === `${invite.id}:REVOKE`} onClick={() => void runAdminAction(invite.id, "REVOKE")} className="rounded border px-3 py-1.5 text-xs">
                      Revoke
                    </button>
                    <button type="button" disabled={savingAction === `${invite.id}:EXPIRE`} onClick={() => void runAdminAction(invite.id, "EXPIRE")} className="rounded border px-3 py-1.5 text-xs">
                      Expire
                    </button>
                    <button type="button" disabled={savingAction === `${invite.id}:RESUBMIT`} onClick={() => void runAdminAction(invite.id, "RESUBMIT")} className="rounded border px-3 py-1.5 text-xs">
                      Resubmit
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No invites yet.</p>
        )}
      </div>

      {mode === "admin" ? (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Invite audit history</h3>
          {auditRows.length ? (
            <div className="grid gap-2">
              {auditRows.map((row) => (
                <article key={row.id} className="rounded border border-[var(--border)] p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{row.action}</p>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{formatDate(row.createdAt)}</p>
                  </div>
                  <p className="text-xs text-slate-400">{row.targetType} | {row.targetId} | @{row.actor.username}</p>
                  {row.note ? <p className="mt-1 text-xs text-slate-300">{row.note}</p> : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No invite audit history yet.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

