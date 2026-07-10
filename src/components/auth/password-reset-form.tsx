"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

export function PasswordResetForm({ initialToken = "" }: { initialToken?: string }) {
  const [requestMessage, setRequestMessage] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function requestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    setRequestMessage("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/password-reset/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: formData.get("identifier") })
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        if (!response.ok) {
          setError(payload.error ?? "Could not request a reset link. Try again shortly.");
          return;
        }

        form.reset();
        setRequestMessage("If an account matches, a password reset link will be sent by email.");
      } catch {
        setError("Could not request a reset link. Check your connection and try again.");
      }
    });
  }

  function confirmReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    setConfirmMessage("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/password-reset/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: initialToken,
            password: formData.get("password")
          })
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        if (!response.ok) {
          setError(payload.error ?? "This reset link could not be used. Request a new link and try again.");
          return;
        }

        form.reset();
        setConfirmMessage("Your password is updated. For your security, existing sessions were signed out.");
      } catch {
        setError("Could not update your password. Check your connection and try again.");
      }
    });
  }

  if (initialToken) {
    if (confirmMessage) {
      return (
        <div className="grid gap-4" aria-live="polite">
          <p className="rounded-md border border-green-400/40 bg-green-950/30 p-4 text-sm leading-6 text-green-100">
            {confirmMessage}
          </p>
          <Link className="btn-primary text-center" href="/login">
            Log in with new password
          </Link>
        </div>
      );
    }

    return (
      <form className="grid gap-4" onSubmit={confirmReset}>
        <p className="text-sm leading-6 text-[var(--muted)]">Choose a new password for your account.</p>
        <label className="grid gap-2">
          <span className="form-label">New password</span>
          <input
            aria-describedby="reset-password-help"
            autoComplete="new-password"
            className="form-field"
            minLength={12}
            name="password"
            required
            type="password"
          />
          <span className="text-xs text-[var(--muted)]" id="reset-password-help">
            Use 12 or more characters. A long passphrase is easier to remember and harder to guess.
          </span>
        </label>
        {error ? (
          <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn-primary" disabled={isPending} type="submit">
          {isPending ? "Updating..." : "Update password"}
        </button>
        <Link className="btn-secondary text-center" href="/reset-password">
          Request a new link
        </Link>
      </form>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={requestReset}>
      <p className="text-sm leading-6 text-[var(--muted)]">
        Enter your account email or username. We will email a reset link if it matches an account.
      </p>
      <label className="grid gap-2">
        <span className="form-label">Email or username</span>
        <input autoComplete="username" className="form-field" name="identifier" required />
      </label>
      {error ? (
        <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">
          {error}
        </p>
      ) : null}
      {requestMessage ? (
        <p className="rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm leading-6 text-green-100" aria-live="polite">
          {requestMessage}
        </p>
      ) : null}
      <button className="btn-primary" disabled={isPending} type="submit">
        {isPending ? "Sending..." : "Email reset link"}
      </button>
      <Link className="btn-secondary text-center" href="/login">
        Back to login
      </Link>
    </form>
  );
}
