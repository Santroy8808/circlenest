"use client";

import { useState } from "react";

function safeNextPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/settings";
}

export function SecureAreaUnlock({ nextPath }: { nextPath: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.trim().length < 1) {
      setError("Enter your password to unlock this settings area.");
      return;
    }

    sessionStorage.setItem("theta-space-secure-unlocked-at", String(Date.now()));
    window.location.href = safeNextPath(nextPath);
  }

  return (
    <form className="surface mx-auto grid max-w-xl gap-5 rounded-md p-6" onSubmit={submit}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Secure Area</p>
        <h1 className="mt-3 text-3xl font-semibold">Confirm password</h1>
        <p className="mt-3 leading-7 text-[var(--muted)]">Sensitive settings require a fresh unlock. Idle timeout hardening comes in the next security polish pass.</p>
      </div>
      <input className="form-field" onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" value={password} />
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      <button className="btn-primary justify-self-end" type="submit">
        Unlock
      </button>
    </form>
  );
}
