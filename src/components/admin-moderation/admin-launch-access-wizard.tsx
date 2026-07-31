"use client";

import { MembershipTier, PromotionAccessScope } from "@prisma/client";
import Link from "next/link";
import { useState, useTransition } from "react";

type LaunchTargetTier = "CONTRIBUTOR";
type LaunchAccessMode = "promo" | "invite" | "founder-pricing" | "ad-guardrails" | "review";

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
  const [inviteRecipientEmail, setInviteRecipientEmail] = useState("");
  const [generatedInviteCode, setGeneratedInviteCode] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const activeMode = normalizeMode(mode);

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
    setGeneratedInviteCode("");
    const recipientEmail = inviteRecipientEmail.trim();
    startTransition(async () => {
      const response = await fetch("/api/admin/free-account-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          recipientEmail,
          expiresInDays: 7,
          sendEmail: Boolean(recipientEmail)
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
        <ToolHeader description="Enter an email address to send a one-time free account invite. Leave the email blank to create a code only." title="Generate Free Account Invite Code" />
        <section className="surface rounded-md p-5">
          <div className="grid gap-5">
            <label className="grid gap-2">
              <span className="form-label">Email address</span>
              <input className="form-field" onChange={(event) => setInviteRecipientEmail(event.target.value)} placeholder="person@example.com" type="email" value={inviteRecipientEmail} />
            </label>
            <button className="btn-primary w-fit" disabled={isPending} onClick={generateInviteCode} type="button">
              {isPending ? "Working..." : inviteRecipientEmail.trim() ? "Send invite" : "Create invite code"}
            </button>
            <div className="rounded-md border border-dashed border-[var(--line)] bg-black/20 p-4">
              <p className="form-label">Output</p>
              {inviteMessage ? <p className="mt-3 text-sm text-[var(--muted)]">{inviteMessage}</p> : <p className="mt-3 text-sm text-[var(--muted)]">No invite created in this session.</p>}
              <label className="grid gap-2">
                <span className="form-label mt-4">Invite code</span>
                <input
                  className="form-field font-mono"
                  onFocus={(event) => event.currentTarget.select()}
                  readOnly
                  value={generatedInviteCode || ""}
                />
              </label>
            </div>
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
