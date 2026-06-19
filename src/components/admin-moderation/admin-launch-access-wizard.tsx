"use client";

import { MembershipTier, PromotionAccessScope } from "@prisma/client";
import { useState, useTransition } from "react";

type LaunchTargetTier = "CONTRIBUTOR" | "PROFESSIONAL";

type FreeInviteView = {
  id: string;
  codePreview: string;
  recipientEmail: string | null;
  assignedUserLabel: string | null;
  generatedByUserLabel: string | null;
  usedByUserLabel: string | null;
  emailedAt: string | null;
  usedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

type LaunchAccessView = {
  plans: Array<{
    tier: MembershipTier;
    displayName: string;
    standardPriceCents: number;
    founderPriceCents: number | null;
    founderMemberCap: number | null;
    founderWindowDays: number | null;
    monthlyCreditBudget: number;
    populationCreditTiers: unknown;
  }>;
  adRules: Array<{
    key: string;
    label: string;
    description: string | null;
    value: number;
    unit: string;
    active: boolean;
  }>;
  activeGrants: Array<{
    id: string;
    scope: PromotionAccessScope;
    userLabel: string;
    sourceTier: MembershipTier;
    targetTier: MembershipTier;
    label: string;
    reason: string | null;
    expiresAt: string;
  }>;
  freeInvites?: FreeInviteView[];
};

function money(cents: number | null) {
  if (cents === null) return "n/a";
  return `$${(cents / 100).toFixed(2)}`;
}

async function fetchLaunchAccessView() {
  const nextResponse = await fetch("/api/admin/launch-access", { cache: "no-store" });
  return (await nextResponse.json()) as LaunchAccessView;
}

export function AdminLaunchAccessWizard({ initialView }: { initialView: LaunchAccessView }) {
  const [view, setView] = useState(initialView);
  const [scope, setScope] = useState<PromotionAccessScope>(PromotionAccessScope.GLOBAL);
  const [userIdentifier, setUserIdentifier] = useState("");
  const [targetTier, setTargetTier] = useState<LaunchTargetTier>("CONTRIBUTOR");
  const [durationValue, setDurationValue] = useState(6);
  const [durationUnit, setDurationUnit] = useState<"days" | "months">("months");
  const [label, setLabel] = useState("Launch Access");
  const [reason, setReason] = useState("Promotional launch access for early platform adoption.");
  const [message, setMessage] = useState("");
  const [inviteRecipientEmail, setInviteRecipientEmail] = useState("");
  const [inviteAssignedIdentifier, setInviteAssignedIdentifier] = useState("");
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState(7);
  const [inviteSendEmail, setInviteSendEmail] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState("");
  const [inviteEmailTarget, setInviteEmailTarget] = useState("");
  const [inviteApplyIdentifier, setInviteApplyIdentifier] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function applyPreset(tier: LaunchTargetTier) {
    setTargetTier(tier);
    setDurationValue(tier === "CONTRIBUTOR" ? 6 : 2);
    setDurationUnit("months");
    setLabel(tier === "CONTRIBUTOR" ? "Free to Contributor launch access" : "Free to Professional launch access");
  }

  function refreshView() {
    return fetchLaunchAccessView().then(setView);
  }

  function createGrant() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/launch-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          userIdentifier,
          sourceTier: "FREE",
          targetTier,
          durationValue,
          durationUnit,
          label,
          reason
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "Could not create launch access.");
        return;
      }

      await refreshView();
      setMessage("Launch access grant created.");
    });
  }

  function generateInviteCode() {
    setInviteMessage("");
    setGeneratedInviteCode("");
    startTransition(async () => {
      const response = await fetch("/api/admin/free-account-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          recipientEmail: inviteRecipientEmail,
          assignedUserIdentifier: inviteAssignedIdentifier,
          expiresInDays: inviteExpiresInDays,
          sendEmail: inviteSendEmail
        })
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        inviteCode?: string;
        emailed?: boolean;
        emailError?: string;
      } | null;

      if (!response.ok || !payload?.inviteCode) {
        setInviteMessage(payload?.error ?? "Could not generate invite code.");
        return;
      }

      setGeneratedInviteCode(payload.inviteCode);
      setInviteEmailTarget(inviteRecipientEmail);
      await refreshView();
      setInviteMessage(
        payload.emailError
          ? `Invite generated, but SMTP send failed: ${payload.emailError}`
          : payload.emailed
            ? "Invite generated and emailed."
            : "Invite generated."
      );
    });
  }

  function emailGeneratedInviteCode() {
    setInviteMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/free-account-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "email",
          inviteCode: generatedInviteCode,
          recipientEmail: inviteEmailTarget
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setInviteMessage(payload?.error ?? "Could not email invite code.");
        return;
      }

      await refreshView();
      setInviteMessage("Invite code emailed.");
    });
  }

  function applyGeneratedInviteCode() {
    setInviteMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/free-account-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          inviteCode: generatedInviteCode,
          userIdentifier: inviteApplyIdentifier
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; userLabel?: string } | null;

      if (!response.ok) {
        setInviteMessage(payload?.error ?? "Could not apply invite code.");
        return;
      }

      await refreshView();
      setInviteMessage(`Invite code applied${payload?.userLabel ? ` to ${payload.userLabel}` : ""}.`);
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Wizard</p>
        <h1 className="mt-3 text-3xl font-semibold">Launch access and founder pricing</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Promotional access changes temporary feature access. Free account invite codes are separate and control who can create a new account.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Create Promotional Access</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Use this for temporary tier access, not account invitations.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="btn-secondary" onClick={() => applyPreset("CONTRIBUTOR")} type="button">
              Preset: 6-month Contributor
            </button>
            <button className="btn-secondary" onClick={() => applyPreset("PROFESSIONAL")} type="button">
              Preset: 2-month Professional
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="form-label">Scope</span>
              <select className="form-field" onChange={(event) => setScope(event.target.value as PromotionAccessScope)} value={scope}>
                <option value={PromotionAccessScope.GLOBAL}>Global Free-tier launch access</option>
                <option value={PromotionAccessScope.USER}>Individual user launch access</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="form-label">User email or username</span>
              <input className="form-field" disabled={scope === PromotionAccessScope.GLOBAL} onChange={(event) => setUserIdentifier(event.target.value)} value={userIdentifier} />
            </label>
          </div>
          <div className="mt-4 rounded-md border border-[var(--line)] bg-black/10 p-4">
            <p className="form-label">Category and Quantity</p>
            <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_150px_150px]">
              <label className="grid gap-2">
                <span className="text-sm text-[var(--muted)]">Category</span>
                <select className="form-field" onChange={(event) => setTargetTier(event.target.value as LaunchTargetTier)} value={targetTier}>
                  <option value="CONTRIBUTOR">Contributor access</option>
                  <option value="PROFESSIONAL">Professional access</option>
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-[var(--muted)]">Quantity</span>
                <input className="form-field" min={1} max={durationUnit === "months" ? 24 : 730} onChange={(event) => setDurationValue(Number(event.target.value))} type="number" value={durationValue} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-[var(--muted)]">Unit</span>
                <select className="form-field" onChange={(event) => setDurationUnit(event.target.value as "days" | "months")} value={durationUnit}>
                  <option value="days">Days</option>
                  <option value="months">Months</option>
                </select>
              </label>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="form-label">Label</span>
              <input className="form-field" onChange={(event) => setLabel(event.target.value)} value={label} />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Reason</span>
              <input className="form-field" onChange={(event) => setReason(event.target.value)} value={reason} />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={isPending} onClick={createGrant} type="button">
              {isPending ? "Creating..." : "Create access grant"}
            </button>
            {message ? <span className="text-sm text-[var(--muted)]">{message}</span> : null}
          </div>
        </div>

        <div className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Founder Pricing</h2>
          <div className="mt-4 grid gap-3">
            {view.plans.map((plan) => (
              <article className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={plan.tier}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{plan.displayName}</strong>
                  <span className="pill rounded-full px-3 py-1 text-xs">
                    {money(plan.founderPriceCents)} founder / {money(plan.standardPriceCents)} standard
                  </span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  First {plan.founderMemberCap ?? "n/a"} members or {plan.founderWindowDays ?? "n/a"} days. Base monthly credits: {plan.monthlyCreditBudget}.
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Generate Free Account Invite Code</h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          This is the account-invitation workflow. It creates a one-time free-account signup code, can optionally email it by SMTP, and can be linked to an existing account for admin tracking.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
              <label className="grid gap-2">
                <span className="form-label">Recipient email</span>
                <input className="form-field" onChange={(event) => setInviteRecipientEmail(event.target.value)} placeholder="person@example.com" type="email" value={inviteRecipientEmail} />
              </label>
              <label className="grid gap-2">
                <span className="form-label">Expires in days</span>
                <input className="form-field" min={1} max={90} onChange={(event) => setInviteExpiresInDays(Number(event.target.value))} type="number" value={inviteExpiresInDays} />
              </label>
            </div>
            <label className="grid gap-2">
              <span className="form-label">Apply/grant to account, optional</span>
              <input className="form-field" onChange={(event) => setInviteAssignedIdentifier(event.target.value)} placeholder="Existing email or username" value={inviteAssignedIdentifier} />
            </label>
            <label className="flex items-center gap-3 text-sm text-[var(--muted)]">
              <input checked={inviteSendEmail} onChange={(event) => setInviteSendEmail(event.target.checked)} type="checkbox" />
              Email the invite code immediately after generation.
            </label>
            <button className="btn-primary w-fit" disabled={isPending} onClick={generateInviteCode} type="button">
              {isPending ? "Generating..." : "Generate Free Account Invite Code"}
            </button>
          </div>

          <aside className="rounded-md border border-[var(--line)] bg-black/10 p-4">
            <p className="form-label">Generated code</p>
            <div className="mt-3 rounded-md border border-dashed border-[var(--line)] bg-black/20 p-4 font-mono text-lg">
              {generatedInviteCode || "No code generated in this session."}
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-2">
                <span className="form-label">Email generated code to</span>
                <input className="form-field" disabled={!generatedInviteCode} onChange={(event) => setInviteEmailTarget(event.target.value)} type="email" value={inviteEmailTarget} />
              </label>
              <button className="btn-secondary" disabled={!generatedInviteCode || isPending} onClick={emailGeneratedInviteCode} type="button">
                Send code by SMTP
              </button>
              <label className="grid gap-2">
                <span className="form-label">Apply generated code to account</span>
                <input className="form-field" disabled={!generatedInviteCode} onChange={(event) => setInviteApplyIdentifier(event.target.value)} placeholder="Existing email or username" value={inviteApplyIdentifier} />
              </label>
              <button className="btn-secondary" disabled={!generatedInviteCode || isPending} onClick={applyGeneratedInviteCode} type="button">
                Apply code to account
              </button>
            </div>
          </aside>
        </div>
        {inviteMessage ? <p className="mt-4 text-sm text-[var(--muted)]">{inviteMessage}</p> : null}
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Ad experience guardrails</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {view.adRules.map((rule) => (
            <article className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={rule.key}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong>{rule.label}</strong>
                <span className="pill rounded-full px-3 py-1 text-xs">
                  {rule.value} {rule.unit}
                </span>
              </div>
              {rule.description ? <p className="mt-2 text-sm text-[var(--muted)]">{rule.description}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Active grants</h2>
          <div className="mt-4 grid gap-3">
            {view.activeGrants.length > 0 ? (
              view.activeGrants.map((grant) => (
                <article className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={grant.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <strong>{grant.label}</strong>
                    <span className="pill rounded-full px-3 py-1 text-xs">
                      {grant.sourceTier} to {grant.targetTier}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {grant.scope} - {grant.userLabel} - expires {new Date(grant.expiresAt).toLocaleDateString()}
                  </p>
                </article>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No active promotional access grants.</p>
            )}
          </div>
        </div>

        <div className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Recent free account invite codes</h2>
          <div className="mt-4 grid gap-3">
            {(view.freeInvites ?? []).length > 0 ? (
              (view.freeInvites ?? []).map((invite) => (
                <article className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={invite.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <strong>{invite.codePreview}</strong>
                    <span className="pill rounded-full px-3 py-1 text-xs">{invite.usedAt ? "Used" : invite.revokedAt ? "Revoked" : "Available"}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Recipient: {invite.recipientEmail ?? "Any email"} - Assigned: {invite.assignedUserLabel ?? "No account"} - Expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Emailed: {invite.emailedAt ? new Date(invite.emailedAt).toLocaleString() : "No"} - Used by: {invite.usedByUserLabel ?? "No one"}
                  </p>
                </article>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No free account invite codes generated yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
