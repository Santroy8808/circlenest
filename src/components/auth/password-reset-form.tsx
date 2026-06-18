"use client";

import { useState, useTransition } from "react";

export function PasswordResetForm() {
  const [requestMessage, setRequestMessage] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function requestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setRequestMessage("");
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: formData.get("identifier") })
      });
      const payload = (await response.json()) as { error?: string; devToken?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not request reset.");
        return;
      }

      setRequestMessage(
        payload.devToken
          ? `Reset requested. Dev token: ${payload.devToken}`
          : "If that account exists, a reset link will be sent."
      );
    });
  }

  function confirmReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setConfirmMessage("");
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: formData.get("token"),
          password: formData.get("password")
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not reset password.");
        return;
      }

      setConfirmMessage("Password updated. Existing sessions have been revoked.");
      event.currentTarget.reset();
    });
  }

  return (
    <div className="grid gap-6">
      <form className="grid gap-4 rounded-md border border-[var(--line)] p-4" onSubmit={requestReset}>
        <div>
          <h2 className="text-xl font-semibold text-[var(--gold)]">Request reset</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Enter an email or username. Production email delivery comes later.</p>
        </div>
        <label className="grid gap-2">
          <span className="form-label">Email or username</span>
          <input className="form-field" name="identifier" required />
        </label>
        <button className="btn-secondary" disabled={isPending} type="submit">
          Request reset
        </button>
        {requestMessage ? <p className="text-sm text-green-100">{requestMessage}</p> : null}
      </form>

      <form className="grid gap-4 rounded-md border border-[var(--line)] p-4" onSubmit={confirmReset}>
        <div>
          <h2 className="text-xl font-semibold text-[var(--gold)]">Use reset token</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">This is mostly for local/dev until email templates are wired.</p>
        </div>
        <label className="grid gap-2">
          <span className="form-label">Reset token</span>
          <input className="form-field" name="token" required />
        </label>
        <label className="grid gap-2">
          <span className="form-label">New password</span>
          <input className="form-field" name="password" type="password" autoComplete="new-password" required />
        </label>
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
        {confirmMessage ? <p className="text-sm text-green-100">{confirmMessage}</p> : null}
        <button className="btn-primary" disabled={isPending} type="submit">
          Update password
        </button>
      </form>
    </div>
  );
}
