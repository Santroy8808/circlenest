"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ThetaLoading } from "@/components/platform/theta-loading";

type SignupResult = {
  error?: string;
  errorField?: "inviteCode" | "displayName" | "username" | "email" | "password";
  user?: {
    email: string;
  };
  verificationEmailSent?: boolean;
  verificationEmailError?: string;
};

export function SignupForm() {
  const [createdAccount, setCreatedAccount] = useState<SignupResult | null>(null);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<SignupResult["errorField"]>();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setCreatedAccount(null);
    setError("");
    setErrorField(undefined);
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
          setErrorField(payload.errorField);
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
      <p className="text-sm leading-6 text-[var(--muted)]">
        Have your invitation ready. All fields are required, and your password must be at least 12 characters.
      </p>
      <label className="grid gap-2">
        <span className="form-label">Invite code</span>
        <input
          autoComplete="one-time-code"
          className="form-field"
          name="inviteCode"
          placeholder="Enter your one-time invite code"
          required
        />
        {errorField === "inviteCode" ? <FieldError message={error} /> : null}
      </label>
      <label className="grid gap-2">
        <span className="form-label">Display name</span>
        <input autoComplete="name" className="form-field" maxLength={100} name="displayName" required />
        {errorField === "displayName" ? <FieldError message={error} /> : null}
      </label>
      <label className="grid gap-2">
        <span className="form-label">Username</span>
        <input
          aria-describedby="signup-username-help"
          autoCapitalize="none"
          autoComplete="username"
          className="form-field"
          maxLength={32}
          minLength={3}
          name="username"
          pattern="[A-Za-z0-9_]+"
          required
          title="Use 3 to 32 letters, numbers, or underscores."
        />
        <span className="text-xs text-[var(--muted)]" id="signup-username-help">
          Use 3 to 32 letters, numbers, or underscores. Do not use spaces.
        </span>
        {errorField === "username" ? <FieldError message={error} /> : null}
      </label>
      <label className="grid gap-2">
        <span className="form-label">Email</span>
        <input autoCapitalize="none" autoComplete="email" className="form-field" name="email" type="email" required />
        {errorField === "email" ? <FieldError message={error} /> : null}
      </label>
      <label className="grid gap-2">
        <span className="form-label">Password</span>
        <input
          aria-describedby="signup-password-help"
          autoComplete="new-password"
          className="form-field"
          minLength={12}
          name="password"
          required
          type="password"
        />
        <span className="text-xs text-[var(--muted)]" id="signup-password-help">
          Use 12 or more characters. A long, memorable passphrase works well.
        </span>
        {errorField === "password" ? <FieldError message={error} /> : null}
      </label>
      {error && !errorField ? <FieldError message={error} /> : null}
      <button className="btn-primary" disabled={isPending} type="submit">
        {isPending ? <ThetaLoading inline label="Creating" size="sm" /> : "Create invited account"}
      </button>
      <Link className="btn-secondary text-center" href="/login">
        Back to login
      </Link>
    </form>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">
      {message}
    </p>
  );
}
