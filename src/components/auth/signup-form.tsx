"use client";

import { useState, useTransition } from "react";

export function SignupForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    const inviteCode = formData.get("inviteCode");
    const email = formData.get("email");
    const username = formData.get("username");
    const displayName = formData.get("displayName");
    const password = formData.get("password");

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            username,
            displayName,
            password,
            inviteCode
          })
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          setError(payload.error ?? "Could not create account.");
          return;
        }

        setMessage("Account created. Verify your email before first production use.");
        event.currentTarget.reset();
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : "Could not create account.");
      }
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-2">
        <span className="form-label">Invite code</span>
        <input className="form-field" name="inviteCode" placeholder="Enter your one-time invite code" required />
      </label>
      <label className="grid gap-2">
        <span className="form-label">Display name</span>
        <input className="form-field" name="displayName" required />
      </label>
      <label className="grid gap-2">
        <span className="form-label">Username</span>
        <input className="form-field" name="username" required />
      </label>
      <label className="grid gap-2">
        <span className="form-label">Email</span>
        <input className="form-field" name="email" type="email" required />
      </label>
      <label className="grid gap-2">
        <span className="form-label">Password</span>
        <input className="form-field" name="password" type="password" autoComplete="new-password" required />
      </label>
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      {message ? (
        <p className="rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">{message}</p>
      ) : null}
      <button className="btn-primary" disabled={isPending} type="submit">
        {isPending ? "Creating..." : "Create invited account"}
      </button>
    </form>
  );
}
