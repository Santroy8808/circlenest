"use client";

import { MembershipTier } from "@prisma/client";
import { useEffect, useState, useTransition } from "react";

type AccountSupportMode = "choose" | "create-user" | "reset-password";

const tierOptions = [
  { value: MembershipTier.FREE, label: "Free" },
  { value: MembershipTier.CONTRIBUTOR, label: "Contributor" },
  { value: MembershipTier.PROFESSIONAL, label: "Professional" },
  { value: MembershipTier.AUDITOR, label: "Auditor" }
];

function normalizeMode(value?: string): AccountSupportMode {
  if (value === "create-user" || value === "reset-password") return value;
  return "choose";
}

export function AdminAccountSupportWizard({ mode, inviteCode }: { mode?: string; inviteCode?: string }) {
  const [activeMode, setActiveMode] = useState<AccountSupportMode>(normalizeMode(mode));
  const [createEmail, setCreateEmail] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createTier, setCreateTier] = useState<MembershipTier>(MembershipTier.FREE);
  const [createInviteCode, setCreateInviteCode] = useState(inviteCode ?? "");
  const [createReason, setCreateReason] = useState("Admin-created preverified account.");
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetReason, setResetReason] = useState("Admin password reset requested by account owner.");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setActiveMode(normalizeMode(mode));
  }, [mode]);

  useEffect(() => {
    setCreateInviteCode(inviteCode ?? "");
  }, [inviteCode]);

  function createUser() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/account-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-user",
          email: createEmail,
          username: createUsername,
          displayName: createDisplayName,
          password: createPassword,
          tier: createTier,
          inviteCode: createInviteCode,
          reason: createReason
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; user?: { displayName?: string; username?: string } } | null;

      if (!response.ok) {
        setMessage(payload?.error ?? "Could not create user.");
        return;
      }

      setMessage(`User created: ${payload?.user?.displayName ?? payload?.user?.username ?? createUsername}.`);
      setCreatePassword("");
    });
  }

  function resetUserPassword() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/account-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset-password",
          userIdentifier: resetIdentifier,
          password: resetPassword,
          reason: resetReason
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; userLabel?: string } | null;

      if (!response.ok) {
        setMessage(payload?.error ?? "Could not reset password.");
        return;
      }

      setMessage(`Password reset for ${payload?.userLabel ?? resetIdentifier}. Existing sessions were revoked.`);
      setResetPassword("");
    });
  }

  if (activeMode === "choose") {
    return (
      <div className="grid gap-5">
        <section className="surface rounded-md p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Hub</p>
          <h1 className="mt-3 text-3xl font-semibold">Account Support</h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Choose one account-support action. These are direct account operations and are intentionally separate from invite-code generation.
          </p>
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          <button className="surface lift-card rounded-md p-5 text-left" onClick={() => setActiveMode("create-user")} type="button">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">New User</p>
            <h2 className="mt-3 text-2xl font-semibold">Create User</h2>
            <p className="mt-3 leading-7 text-[var(--muted)]">
              Create a preverified account without SMTP. Optionally consume a generated invite code during account creation.
            </p>
            <span className="btn-secondary mt-5 inline-flex">Open wizard</span>
          </button>
          <button className="surface lift-card rounded-md p-5 text-left" onClick={() => setActiveMode("reset-password")} type="button">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Security</p>
            <h2 className="mt-3 text-2xl font-semibold">Reset Password</h2>
            <p className="mt-3 leading-7 text-[var(--muted)]">
              Set a new password for an account and revoke existing sessions so the new password is required.
            </p>
            <span className="btn-secondary mt-5 inline-flex">Open wizard</span>
          </button>
        </section>
      </div>
    );
  }

  if (activeMode === "create-user") {
    return (
      <div className="grid gap-5">
        <section className="surface rounded-md p-6">
          <button className="btn-secondary mb-5" onClick={() => setActiveMode("choose")} type="button">
            Back to Account Support
          </button>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Wizard</p>
          <h1 className="mt-3 text-3xl font-semibold">Create User</h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Create a preverified account without sending SMTP mail. If you paste a valid invite code, it will be consumed for this user.
          </p>
        </section>
        <section className="surface rounded-md p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="form-label">Email</span>
              <input className="form-field" onChange={(event) => setCreateEmail(event.target.value)} type="email" value={createEmail} />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Username</span>
              <input className="form-field" onChange={(event) => setCreateUsername(event.target.value)} value={createUsername} />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Display name</span>
              <input className="form-field" onChange={(event) => setCreateDisplayName(event.target.value)} value={createDisplayName} />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Temporary password</span>
              <input className="form-field" onChange={(event) => setCreatePassword(event.target.value)} type="password" value={createPassword} />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Membership status</span>
              <select className="form-field" onChange={(event) => setCreateTier(event.target.value as MembershipTier)} value={createTier}>
                {tierOptions.map((tier) => (
                  <option key={tier.value} value={tier.value}>
                    {tier.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="form-label">Invite code, optional</span>
              <input className="form-field" onChange={(event) => setCreateInviteCode(event.target.value)} value={createInviteCode} />
            </label>
          </div>
          <label className="mt-4 grid gap-2">
            <span className="form-label">Audit reason</span>
            <textarea className="form-field min-h-24" onChange={(event) => setCreateReason(event.target.value)} value={createReason} />
          </label>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="btn-primary"
              disabled={isPending || !createEmail.trim() || !createUsername.trim() || !createDisplayName.trim() || !createPassword.trim() || createReason.trim().length < 3}
              onClick={createUser}
              type="button"
            >
              {isPending ? "Creating..." : "Create User"}
            </button>
            {message ? <span className="text-sm text-[var(--muted)]">{message}</span> : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <button className="btn-secondary mb-5" onClick={() => setActiveMode("choose")} type="button">
          Back to Account Support
        </button>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Wizard</p>
        <h1 className="mt-3 text-3xl font-semibold">Reset Password</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Set a new password for an account. This immediately revokes existing sessions and writes an audit entry.
        </p>
      </section>
      <section className="surface rounded-md p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Account email or username</span>
            <input className="form-field" onChange={(event) => setResetIdentifier(event.target.value)} value={resetIdentifier} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">New password</span>
            <input className="form-field" onChange={(event) => setResetPassword(event.target.value)} type="password" value={resetPassword} />
          </label>
        </div>
        <label className="mt-4 grid gap-2">
          <span className="form-label">Audit reason</span>
          <textarea className="form-field min-h-24" onChange={(event) => setResetReason(event.target.value)} value={resetReason} />
        </label>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="btn-primary"
            disabled={isPending || resetIdentifier.trim().length < 2 || !resetPassword.trim() || resetReason.trim().length < 3}
            onClick={resetUserPassword}
            type="button"
          >
            {isPending ? "Resetting..." : "Reset Password"}
          </button>
          {message ? <span className="text-sm text-[var(--muted)]">{message}</span> : null}
        </div>
      </section>
    </div>
  );
}
