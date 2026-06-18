"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";

export function LoginForm({ callbackUrl = "/home" }: { callbackUrl?: string }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const result = await signIn("credentials", {
        identifier,
        password,
        redirect: false,
        callbackUrl
      });

      if (result?.error) {
        setError("Invalid email/username or password.");
        return;
      }

      router.push(result?.url ?? callbackUrl);
      router.refresh();
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-2">
        <span className="form-label">Email or username</span>
        <input
          className="form-field"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="username"
          required
        />
      </label>
      <label className="grid gap-2">
        <span className="form-label">Password</span>
        <input
          className="form-field"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      <button className="btn-primary" disabled={isPending} type="submit">
        {isPending ? "Checking..." : "Log in"}
      </button>
      <div className="flex flex-wrap gap-4 text-sm text-[var(--muted)]">
        <Link className="text-[var(--gold)]" href="/reset-password">
          Forgot password?
        </Link>
        <Link className="text-[var(--gold)]" href="/signup">
          Have an invite?
        </Link>
      </div>
    </form>
  );
}
