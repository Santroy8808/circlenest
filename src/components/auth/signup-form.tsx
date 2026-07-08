"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

type SignupResult = {
  error?: string;
  user?: {
    email: string;
  };
  verificationEmailSent?: boolean;
  verificationEmailError?: string;
};

export function SignupForm() {
  const [createdAccount, setCreatedAccount] = useState<SignupResult | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setCreatedAccount(null);
    setError("");
    const formData = new FormData(form);
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
        const payload = (await response.json()) as SignupResult;

        if (!response.ok) {
          setError(payload.error ?? "Could not create account.");
          return;
        }

        setCreatedAccount(payload);
        form.reset();
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : "Could not create account.");
      }
    });
  }

  if (createdAccount) {
    return (
      <div className="grid gap-4">
        <div className="rounded-md border border-green-400/40 bg-green-950/30 p-4 text-sm text-green-100">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Account created</h2>
          {createdAccount.verificationEmailSent ? (
            <p className="mt-3 leading-6">
              Check your email for the Theta-Space verification message. After your email is verified, return to login.
            </p>
          ) : createdAccount.verificationEmailError ? (
            <p className="mt-3 leading-6">
              Your account was created, but the verification email could not be sent. Return to login or contact support if
              email verification is required.
            </p>
          ) : (
            <p className="mt-3 leading-6">Your account is ready. Return to login to enter Theta-Space.</p>
          )}
        </div>
        <Link className="btn-primary text-center" href="/login">
          Back to login
        </Link>
      </div>
    );
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
      <button className="btn-primary" disabled={isPending} type="submit">
        {isPending ? "Creating..." : "Create invited account"}
      </button>
      <Link className="btn-secondary text-center" href="/login">
        Back to login
      </Link>
    </form>
  );
}
