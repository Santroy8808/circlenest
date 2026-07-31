"use client";

import { MembershipTier, PromotionAccessScope } from "@prisma/client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  buildExistingUserGrantPayload,
  buildInviteNewUserPayload,
  canGrantExistingUserAccess,
  inviteNewUserButtonLabel,
  type AdminInviteWorkflowMode
} from "@/components/admin-moderation/admin-launch-access-invite-workflows";

type LaunchTargetTier = "CONTRIBUTOR";
type LaunchAccessMode = "promo" | "invite" | "founder-pricing" | "ad-guardrails" | "review";

type StatusChangeAccountView = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  tierName: string;
  suspended: boolean;
};

type InviteResultView = {
  inviteId: string;
  recipientEmail: string | null;
  inviteCode: string;
  expiresAt: string;
  emailed: boolean;
  emailError?: string;
  status: "active" | "revoked";
  userLabel?: string | null;
};

type FreeInviteView = {
  id: string;
  codePreview: string;
  recipientEmail: string | null;
  assignedUserLabel: string | null;
  generatedByUserLabel: string | null;
  usedByUserLabel: string | null;
  bulkBatchId?: string | null;
  bulkBatchStatus?: string | null;
  bulkBatchSentCount?: number | null;
  bulkBatchFailedCount?: number | null;
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
    expiresAt: string | null;
  }>;
  freeInvites?: FreeInviteView[];
};

const hubCards: Array<{
  href: string;
  title: string;
  kicker: string;
  description: string;
}> = [
  {
    href: "/admin/actions/launch-access?tool=promo",
    title: "Create Promotional Access",
    kicker: "Temporary tier access",
    description: "Grant Free accounts temporary Contributor access without changing their permanent membership tier."
  },
  {
    href: "/admin/actions/launch-access?tool=invite",
    title: "Generate Free Account Invite Code",
    kicker: "Private membership invite",
    description: "Create a one-time free account invite code and optionally send it by email."
  },
  {
    href: "/admin/actions/launch-access?tool=founder-pricing",
    title: "Founder Pricing",
    kicker: "Launch subscription reference",
    description: "Review founder pricing, member caps, launch windows, standard pricing, and starting monthly credit budgets."
  },
  {
    href: "/admin/actions/launch-access?tool=ad-guardrails",
    title: "Ad Experience Guardrails",
    kicker: "Anti-spam controls",
    description: "Review current advertising density, sponsored mail caps, sender cooldowns, and boost limits."
  },
  {
    href: "/admin/actions/launch-access?tool=review",
    title: "Review Active Access",
    kicker: "Audit active codes and grants",
    description: "See active promotional access grants and recently generated free account invite codes."
  }
];

function money(cents: number | null) {
  if (cents === null) return "n/a";
  return `$${(cents / 100).toFixed(2)}`;
}

function normalizeMode(mode?: string): LaunchAccessMode | null {
  if (mode === "promo" || mode === "invite" || mode === "founder-pricing" || mode === "ad-guardrails" || mode === "review") {
    return mode;
  }

  return null;
}

async function fetchLaunchAccessView() {
  const nextResponse = await fetch("/api/admin/launch-access", { cache: "no-store" });
  return (await nextResponse.json()) as LaunchAccessView;
}

function ToolHeader({ title, description }: { title: string; description: string }) {
  return (
    <section className="surface rounded-md p-6">
      <Link className="btn-secondary mb-5 inline-flex" href="/admin/actions/launch-access">
        Back to Launch Access
      </Link>
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Wizard</p>
      <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
      <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">{description}</p>
    </section>
  );
}

export function AdminLaunchAccessWizard({ initialView, mode }: { initialView: LaunchAccessView; mode?: string }) {
  const [view, setView] = useState(initialView);
  const [scope, setScope] = useState<PromotionAccessScope>(PromotionAccessScope.GLOBAL);
  const [userIdentifier, setUserIdentifier] = useState("");
  const [targetTier, setTargetTier] = useState<LaunchTargetTier>("CONTRIBUTOR");
  const [durationValue, setDurationValue] = useState(6);
  const [durationUnit, setDurationUnit] = useState<"days" | "months">("months");
  const [label, setLabel] = useState("Launch Access");
  const [reason, setReason] = useState("Promotional launch access for early platform adoption.");
  const [message, setMessage] = useState("");
  const [inviteWorkflowMode, setInviteWorkflowMode] = useState<AdminInviteWorkflowMode>("new-user");
  const [inviteRecipientEmail, setInviteRecipientEmail] = useState("");
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState(7);
  const [sendInviteEmailImmediately, setSendInviteEmailImmediately] = useState(true);
  const [inviteResult, setInviteResult] = useState<InviteResultView | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [existingAccountQuery, setExistingAccountQuery] = useState("");
  const [existingAccountResults, setExistingAccountResults] = useState<StatusChangeAccountView[]>([]);
  const [selectedExistingAccount, setSelectedExistingAccount] = useState<StatusChangeAccountView | null>(null);
  const [existingAccountSearchMessage, setExistingAccountSearchMessage] = useState("");
  const [existingAccessExpiresInDays, setExistingAccessExpiresInDays] = useState(7);
  const [isPending, startTransition] = useTransition();
  const activeMode = normalizeMode(mode);

  useEffect(() => {
    if (inviteWorkflowMode !== "existing-user") return;
    const query = existingAccountQuery.trim();
    if (query.length < 2) {
      setExistingAccountResults([]);
      setExistingAccountSearchMessage(query ? "Enter at least 2 characters to search accounts." : "");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setExistingAccountSearchMessage("Searching accounts...");
      try {
        const response = await fetch(`/api/admin/status-change?query=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        const payload = (await response.json().catch(() => null)) as { accounts?: StatusChangeAccountView[]; error?: string } | null;
        if (!response.ok) {
          setExistingAccountResults([]);
          setExistingAccountSearchMessage(payload?.error ?? "Could not search accounts.");
          return;
        }
        const accounts = payload?.accounts ?? [];
        setExistingAccountResults(accounts);
        setExistingAccountSearchMessage(accounts.length ? "" : "No matching account was found.");
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setExistingAccountResults([]);
          setExistingAccountSearchMessage("Could not search accounts.");
        }
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [existingAccountQuery, inviteWorkflowMode]);

  function applyPreset(tier: LaunchTargetTier) {
    setTargetTier(tier);
    setDurationValue(6);
    setDurationUnit("months");
    setLabel("Free to Contributor launch access");
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
    setInviteError("");
    setInviteResult(null);
    const recipientEmail = inviteRecipientEmail.trim();
    if (sendInviteEmailImmediately && !recipientEmail) {
      setInviteError("Enter an email address before sending the invitation email.");
      return;
    }
    if (inviteExpiresInDays < 1 || inviteExpiresInDays > 90) {
      setInviteError("Invite expiration must be between 1 and 90 days.");
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/admin/free-account-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildInviteNewUserPayload({
          recipientEmail,
          expiresInDays: inviteExpiresInDays,
          sendEmailImmediately: sendInviteEmailImmediately
        }))
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        inviteCode?: string;
        emailed?: boolean;
        emailError?: string;
        invite?: { id: string; recipientEmail: string | null; expiresAt: string };
      } | null;

      if (!response.ok || !payload?.inviteCode) {
        setInviteError(payload?.error ?? "Could not generate invite code.");
        return;
      }

      setInviteResult({
        inviteId: payload.invite?.id ?? "",
        recipientEmail: payload.invite?.recipientEmail ?? (recipientEmail || null),
        inviteCode: payload.inviteCode,
        expiresAt: payload.invite?.expiresAt ?? "",
        emailed: Boolean(payload.emailed),
        emailError: payload.emailError,
        status: "active"
      });
      await refreshView();
      setInviteMessage(
        payload.emailError
          ? `Invite generated, but SMTP send failed: ${payload.emailError}`
          : payload.emailed
            ? `Invite sent to ${recipientEmail}.`
            : "Invite code created. No email was sent."
      );
    });
  }

  function grantExistingUserFreeAccess() {
    setInviteMessage("");
    setInviteError("");
    setInviteResult(null);
    if (!selectedExistingAccount) {
      setInviteError("Select an account before granting free access.");
      return;
    }
    if (existingAccessExpiresInDays < 1 || existingAccessExpiresInDays > 90) {
      setInviteError("Access expiration must be between 1 and 90 days.");
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/admin/free-account-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildExistingUserGrantPayload({
          account: selectedExistingAccount,
          expiresInDays: existingAccessExpiresInDays
        }))
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        inviteCode?: string;
        userLabel?: string;
        invite?: { id: string; recipientEmail: string | null; expiresAt: string };
      } | null;
      if (!response.ok || !payload?.inviteCode) {
        setInviteError(payload?.error ?? "Failed access grant.");
        return;
      }
      setInviteResult({
        inviteId: payload.invite?.id ?? "",
        recipientEmail: payload.invite?.recipientEmail ?? null,
        inviteCode: payload.inviteCode,
        expiresAt: payload.invite?.expiresAt ?? "",
        emailed: false,
        status: "active",
        userLabel: payload.userLabel ?? selectedExistingAccount.displayName
      });
      await refreshView();
      setInviteMessage(`Free access assigned to ${payload.userLabel ?? selectedExistingAccount.displayName}.`);
    });
  }

  function copyInviteCode() {
    if (!inviteResult?.inviteCode) return;
    void navigator.clipboard?.writeText(inviteResult.inviteCode);
    setInviteMessage("Invite code copied.");
  }

  function resendInviteEmail() {
    if (!inviteResult?.inviteCode || !inviteResult.recipientEmail) {
      setInviteError("This invite does not have a recipient email to resend to.");
      return;
    }
    setInviteMessage("");
    setInviteError("");
    startTransition(async () => {
      const response = await fetch("/api/admin/free-account-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "email",
          inviteCode: inviteResult.inviteCode,
          recipientEmail: inviteResult.recipientEmail
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setInviteError(payload?.error ?? "Email delivery failure.");
        return;
      }
      setInviteResult({ ...inviteResult, emailed: true, emailError: undefined });
      setInviteMessage(`Invitation email resent to ${inviteResult.recipientEmail}.`);
      await refreshView();
    });
  }

  function revokeInvite() {
    if (!inviteResult?.inviteId) return;
    setInviteMessage("");
    setInviteError("");
    startTransition(async () => {
      const response = await fetch("/api/admin/free-account-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", inviteId: inviteResult.inviteId })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setInviteError(payload?.error ?? "Could not revoke invite.");
        return;
      }
      setInviteResult({ ...inviteResult, status: "revoked" });
      setInviteMessage("Invite revoked.");
      await refreshView();
    });
  }

  if (!activeMode) {
    return (
      <div className="grid gap-5">
        <section className="surface rounded-md p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Hub</p>
          <h1 className="mt-3 text-3xl font-semibold">Launch Access</h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Choose one admin function. Each card opens a focused wizard or read-only review page.
          </p>
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          {hubCards.map((card) => (
            <Link className="surface lift-card block rounded-md p-5 no-underline" href={card.href} key={card.href}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{card.kicker}</p>
              <h2 className="mt-3 text-2xl font-semibold">{card.title}</h2>
              <p className="mt-3 leading-7 text-[var(--muted)]">{card.description}</p>
              <span className="btn-secondary mt-5 inline-flex">Open wizard</span>
            </Link>
          ))}
        </section>
      </div>
    );
  }

  if (activeMode === "promo") {
    return (
      <div className="grid gap-5">
        <ToolHeader description="Grant temporary Contributor access. This does not create an account invite code." title="Create Promotional Access" />
        <section className="surface rounded-md p-5">
          <div className="grid gap-5">
            <div>
              <p className="form-label">Step 1: Choose preset</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button className="btn-secondary" onClick={() => applyPreset("CONTRIBUTOR")} type="button">
                  Preset: 6-month Contributor
                </button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="form-label">Step 2: Scope</span>
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
            <div className="rounded-md border border-[var(--line)] bg-black/10 p-4">
              <p className="form-label">Step 3: Category and Quantity</p>
              <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_150px_150px]">
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Category</span>
                  <select className="form-field" onChange={(event) => setTargetTier(event.target.value as LaunchTargetTier)} value={targetTier}>
                    <option value="CONTRIBUTOR">Contributor access</option>
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
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="form-label">Step 4: Label</span>
                <input className="form-field" onChange={(event) => setLabel(event.target.value)} value={label} />
              </label>
              <label className="grid gap-2">
                <span className="form-label">Reason</span>
                <input className="form-field" onChange={(event) => setReason(event.target.value)} value={reason} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-primary" disabled={isPending} onClick={createGrant} type="button">
                {isPending ? "Creating..." : "Create access grant"}
              </button>
              {message ? <span className="text-sm text-[var(--muted)]">{message}</span> : null}
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (activeMode === "invite") {
    return (
      <div className="grid gap-5">
        <ToolHeader description="Invite a new user or grant promotional access to an existing account." title="Free Account Access" />
        <section className="surface rounded-md p-5">
          <div className="grid gap-5">
            <div aria-label="Free account access workflow" className="grid gap-3 rounded-md border border-[var(--line)] bg-black/10 p-2 sm:grid-cols-2" role="tablist">
              <button
                aria-selected={inviteWorkflowMode === "new-user"}
                className={inviteWorkflowMode === "new-user" ? "btn-primary justify-center" : "btn-secondary justify-center"}
                onClick={() => {
                  setInviteWorkflowMode("new-user");
                  setInviteError("");
                  setInviteMessage("");
                  setInviteResult(null);
                }}
                role="tab"
                type="button"
              >
                Invite New User
              </button>
              <button
                aria-selected={inviteWorkflowMode === "existing-user"}
                className={inviteWorkflowMode === "existing-user" ? "btn-primary justify-center" : "btn-secondary justify-center"}
                onClick={() => {
                  setInviteWorkflowMode("existing-user");
                  setInviteError("");
                  setInviteMessage("");
                  setInviteResult(null);
                }}
                role="tab"
                type="button"
              >
                Existing User
              </button>
            </div>

            {inviteWorkflowMode === "new-user" ? (
              <div className="grid gap-5" role="tabpanel">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                  <label className="grid gap-2">
                    <span className="form-label">Recipient Email</span>
                    <input
                      aria-invalid={Boolean(inviteError && inviteError.toLowerCase().includes("email"))}
                      className="form-field"
                      onChange={(event) => setInviteRecipientEmail(event.target.value)}
                      placeholder="person@example.com"
                      type="email"
                      value={inviteRecipientEmail}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="form-label">Invite expiration in days</span>
                    <input
                      className="form-field"
                      max={90}
                      min={1}
                      onChange={(event) => setInviteExpiresInDays(Number(event.target.value))}
                      type="number"
                      value={inviteExpiresInDays}
                    />
                  </label>
                </div>
                <label className="flex items-center gap-3 text-sm text-[var(--muted)]">
                  <input
                    checked={sendInviteEmailImmediately}
                    className="h-5 w-5 accent-[var(--gold)]"
                    onChange={(event) => setSendInviteEmailImmediately(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Send invitation email immediately</span>
                </label>
                <button className="btn-primary w-fit disabled:cursor-not-allowed disabled:opacity-60" disabled={isPending} onClick={generateInviteCode} type="button">
                  {isPending ? "Working..." : inviteNewUserButtonLabel(sendInviteEmailImmediately)}
                </button>
              </div>
            ) : (
              <div className="grid gap-5" role="tabpanel">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                  <label className="grid gap-2">
                    <span className="form-label">Find Account</span>
                    <input
                      className="form-field"
                      onChange={(event) => {
                        setExistingAccountQuery(event.target.value);
                        setSelectedExistingAccount(null);
                      }}
                      placeholder="Search by email, username, or name"
                      type="search"
                      value={existingAccountQuery}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="form-label">Access expiration in days</span>
                    <input
                      className="form-field"
                      max={90}
                      min={1}
                      onChange={(event) => setExistingAccessExpiresInDays(Number(event.target.value))}
                      type="number"
                      value={existingAccessExpiresInDays}
                    />
                  </label>
                </div>
                {existingAccountResults.length ? (
                  <div className="grid gap-2" role="listbox">
                    {existingAccountResults.map((account) => (
                      <button
                        className={`rounded-md border p-4 text-left transition ${selectedExistingAccount?.id === account.id ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-[var(--line)] bg-black/20 hover:border-[var(--gold)]/60"}`}
                        key={account.id}
                        onClick={() => {
                          setSelectedExistingAccount(account);
                          setExistingAccountQuery(account.email);
                        }}
                        type="button"
                      >
                        <span className="block font-semibold">{account.displayName}</span>
                        <span className="block text-sm text-[var(--muted)]">{account.email} · @{account.username}</span>
                      </button>
                    ))}
                  </div>
                ) : existingAccountSearchMessage ? (
                  <p className="text-sm text-[var(--muted)]">{existingAccountSearchMessage}</p>
                ) : null}
                {selectedExistingAccount ? (
                  <div className="rounded-md border border-[var(--line)] bg-black/20 p-4">
                    <p className="form-label">Selected-user summary</p>
                    <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                      <div>
                        <dt className="text-[var(--muted)]">Display name</dt>
                        <dd className="font-semibold">{selectedExistingAccount.displayName}</dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Email</dt>
                        <dd className="font-semibold">{selectedExistingAccount.email}</dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Username</dt>
                        <dd className="font-semibold">@{selectedExistingAccount.username}</dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Current access</dt>
                        <dd className="font-semibold">{selectedExistingAccount.suspended ? "Suspended" : selectedExistingAccount.tierName}</dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
                <button
                  className="btn-primary w-fit disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canGrantExistingUserAccess(selectedExistingAccount, isPending)}
                  onClick={grantExistingUserFreeAccess}
                  type="button"
                >
                  {isPending ? "Working..." : "Grant Free Access"}
                </button>
              </div>
            )}

            {inviteError ? (
              <p className="rounded-md border border-red-400/50 bg-red-950/40 p-3 text-sm text-red-100" role="alert">
                {inviteError}
              </p>
            ) : null}
            {inviteResult ? (
              <div className="rounded-md border border-[var(--gold)]/50 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="form-label">Success</p>
                    <h2 className="mt-2 text-xl font-semibold">{inviteResult.status === "revoked" ? "Invite revoked" : "Free invite ready"}</h2>
                    {inviteMessage ? <p className="mt-2 text-sm text-[var(--muted)]">{inviteMessage}</p> : null}
                  </div>
                  <span className="pill rounded-full px-3 py-1 text-xs">{inviteResult.status === "revoked" ? "Revoked" : "Active"}</span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <dt className="text-[var(--muted)]">Recipient email</dt>
                    <dd className="font-semibold">{inviteResult.recipientEmail ?? "No email sent"}</dd>
                  </div>
                  {inviteResult.userLabel ? (
                    <div>
                      <dt className="text-[var(--muted)]">Existing account</dt>
                      <dd className="font-semibold">{inviteResult.userLabel}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-[var(--muted)]">Expiration date</dt>
                    <dd className="font-semibold">{inviteResult.expiresAt ? new Date(inviteResult.expiresAt).toLocaleString() : "Not available"}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Email status</dt>
                    <dd className="font-semibold">{inviteResult.emailError ? `Failed: ${inviteResult.emailError}` : inviteResult.emailed ? "Sent" : "Not sent"}</dd>
                  </div>
                </dl>
                <label className="mt-4 grid gap-2">
                  <span className="form-label">Generated invite code</span>
                  <input className="form-field font-mono" onFocus={(event) => event.currentTarget.select()} readOnly value={inviteResult.inviteCode} />
                </label>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button className="btn-secondary" onClick={copyInviteCode} type="button">Copy Code</button>
                  <button className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60" disabled={!inviteResult.recipientEmail || inviteResult.status === "revoked" || isPending} onClick={resendInviteEmail} type="button">
                    Resend Email
                  </button>
                  <button className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60" disabled={inviteResult.status === "revoked" || isPending} onClick={revokeInvite} type="button">
                    Revoke Invite
                  </button>
                  <Link className="btn-secondary" href={`/admin/actions/account-support?tool=create-user&inviteCode=${encodeURIComponent(inviteResult.inviteCode)}`}>
                    Create Account Manually
                  </Link>
                </div>
              </div>
            ) : inviteMessage ? (
              <p className="text-sm text-[var(--muted)]">{inviteMessage}</p>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  if (activeMode === "founder-pricing") {
    return (
      <div className="grid gap-5">
        <ToolHeader description="Review founder pricing, launch caps, standard pricing, and monthly starting credits." title="Founder Pricing" />
        <section className="grid gap-3 md:grid-cols-2">
          {view.plans.map((plan) => (
            <article className="surface rounded-md p-5" key={plan.tier}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong>{plan.displayName}</strong>
                <span className="pill rounded-full px-3 py-1 text-xs">
                  {money(plan.founderPriceCents)} founder / {money(plan.standardPriceCents)} standard
                </span>
              </div>
              <p className="mt-3 text-sm text-[var(--muted)]">
                First {plan.founderMemberCap ?? "n/a"} members or {plan.founderWindowDays ?? "n/a"} days. Base monthly credits: {plan.monthlyCreditBudget}.
              </p>
            </article>
          ))}
        </section>
      </div>
    );
  }

  if (activeMode === "ad-guardrails") {
    return (
      <div className="grid gap-5">
        <ToolHeader description="Review the launch advertising rules that protect users from spammy platform behavior." title="Ad Experience Guardrails" />
        <section className="grid gap-3 md:grid-cols-2">
          {view.adRules.map((rule) => (
            <article className="surface rounded-md p-5" key={rule.key}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong>{rule.label}</strong>
                <span className="pill rounded-full px-3 py-1 text-xs">
                  {rule.value} {rule.unit}
                </span>
              </div>
              {rule.description ? <p className="mt-3 text-sm text-[var(--muted)]">{rule.description}</p> : null}
            </article>
          ))}
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <ToolHeader description="Review active promotional access grants and recently generated invite codes." title="Review Active Access" />
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
                    {grant.scope} - {grant.userLabel} - {grant.expiresAt
                      ? `expires ${new Date(grant.expiresAt).toLocaleDateString()}`
                      : "no expiration"}
                  </p>
                </article>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No active promotional access grants.</p>
            )}
          </div>
        </div>
        <div className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Active free account invite codes</h2>
          <div className="mt-4 grid gap-3">
            {(view.freeInvites ?? []).length > 0 ? (
              (view.freeInvites ?? []).map((invite) => (
                <article className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={invite.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <strong>{invite.codePreview}</strong>
                    <span className="pill rounded-full px-3 py-1 text-xs">Available</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Recipient: {invite.recipientEmail ?? "Any email"} - Assigned: {invite.assignedUserLabel ?? "No account"} - Expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                  {invite.bulkBatchId ? <p className="mt-2 text-sm text-[var(--muted)]">Bulk queue: {invite.bulkBatchStatus ?? "queued"} - {invite.bulkBatchSentCount ?? 0} sent, {invite.bulkBatchFailedCount ?? 0} failed</p> : null}
                </article>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No active free account invite codes.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
