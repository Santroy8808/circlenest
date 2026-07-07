"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

type CreatedCredentials = {
  username: string;
  password: string;
};

export function AuditorHelpClient() {
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      fullName: String(form.get("fullName") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      resolutionGoal: String(form.get("resolutionGoal") ?? ""),
      location: String(form.get("location") ?? ""),
      relationship: String(form.get("relationship") ?? ""),
      bio: String(form.get("bio") ?? "")
    };

    startTransition(async () => {
      const response = await fetch("/api/gethelp/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = (await response.json()) as { credentials?: CreatedCredentials; error?: string };

      if (!response.ok || !result.credentials) {
        setError(result.error ?? "Could not create your auditor search account.");
        return;
      }

      setCredentials(result.credentials);
      formElement.reset();
    });
  }

  return (
    <div className="gethelp-layout">
      <section className="gethelp-hero">
        <p className="form-label">Theta-Space Auditor Search</p>
        <h1>Find an auditor with a private, focused account.</h1>
        <p>
          Create a lightweight account for auditor search, auditor mail, a simple profile, and success stories. This is designed for
          someone who wants help without needing a full Theta-Space member account.
        </p>
        <div className="gethelp-steps">
          <span>1. Tell us how to reach you</span>
          <span>2. Save your one-time credentials</span>
          <span>3. Search and contact auditor profiles</span>
        </div>
        <Link className="btn-secondary" href="/auditors">
          Browse auditors first
        </Link>
      </section>

      <section className="surface gethelp-card">
        {credentials ? (
          <div className="grid gap-4">
            <p className="form-label">Account created</p>
            <h2 className="text-2xl font-semibold text-[var(--gold)]">Save this username and password now.</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">This password is shown once. After login, verify your email and update your profile picture or bio.</p>
            <div className="gethelp-credentials">
              <p>
                <span>Username</span>
                <strong>{credentials.username}</strong>
              </p>
              <p>
                <span>Password</span>
                <strong>{credentials.password}</strong>
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="btn-primary" href="/login?callbackUrl=/auditors">
                Log in
              </Link>
              <Link className="btn-secondary" href="/verify-email">
                Verify email
              </Link>
            </div>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={submit}>
            <div>
              <p className="form-label">Get help</p>
              <h2 className="mt-2 text-2xl font-semibold">Create your auditor search account</h2>
            </div>
            <label className="grid gap-2">
              <span className="form-label">Name</span>
              <input className="form-field" name="fullName" required />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Email</span>
              <input className="form-field" name="email" required type="email" />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Phone optional</span>
              <input className="form-field" name="phone" />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Location optional</span>
              <input className="form-field" name="location" placeholder="City, state, or remote" />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Relationship status optional</span>
              <input className="form-field" name="relationship" />
            </label>
            <label className="grid gap-2">
              <span className="form-label">What are you trying to resolve? optional</span>
              <textarea className="form-field min-h-28" name="resolutionGoal" />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Brief bio optional</span>
              <textarea className="form-field min-h-24" name="bio" />
            </label>
            {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
            <button className="btn-primary" disabled={isPending} type="submit">
              {isPending ? "Creating..." : "Create account"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
