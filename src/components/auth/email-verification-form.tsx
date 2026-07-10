"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

export function EmailVerificationForm({ initialToken = "" }: { initialToken?: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [token, setToken] = useState(initialToken);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/verify-email/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        if (!response.ok) {
          setError(payload.error ?? "This verification link could not be used.");
          return;
        }

        setMessage("Your email is verified. You can now log in.");
        form.reset();
        setToken("");
      } catch {
        setError("Could not verify your email. Check your connection and try again.");
      }
    });
  }

  if (message) {
    return (
      <div className="grid gap-4" aria-live="polite">
        <p className="rounded-md border border-green-400/40 bg-green-950/30 p-4 text-sm leading-6 text-green-100">
          {message}
        </p>
        <Link className="btn-primary text-center" href="/login">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      {initialToken ? (
        <p className="text-sm leading-6 text-[var(--muted)]">Your verification link is ready. Select the button below to continue.</p>
      ) : (
        <label className="grid gap-2">
          <span className="form-label">Verification token</span>
          <input
            autoComplete="one-time-code"
            className="form-field"
            name="token"
            onChange={(event) => setToken(event.target.value)}
            required
            value={token}
          />
        </label>
      )}
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
      <button className="btn-primary" disabled={isPending} type="submit">
        {isPending ? "Verifying..." : "Verify my email"}
      </button>
    </form>
  );
}
