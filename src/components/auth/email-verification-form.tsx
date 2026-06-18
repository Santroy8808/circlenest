"use client";

import { useState, useTransition } from "react";

export function EmailVerificationForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const response = await fetch("/api/auth/verify-email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: formData.get("token") })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not verify email.");
        return;
      }

      setMessage("Email verified.");
      event.currentTarget.reset();
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-2">
        <span className="form-label">Verification token</span>
        <input className="form-field" name="token" required />
      </label>
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      {message ? <p className="rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">{message}</p> : null}
      <button className="btn-primary" disabled={isPending} type="submit">
        Verify email
      </button>
    </form>
  );
}
