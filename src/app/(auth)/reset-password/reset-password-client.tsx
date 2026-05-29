"use client";

import { useState } from "react";
import Link from "next/link";

export default function ResetPasswordClient({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState("");
  const [resetUrl, setResetUrl] = useState("");

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="card p-6">
        <h1 className="mb-2 text-xl font-semibold">Reset Password</h1>
        <p className="mb-4 text-sm text-slate-600">Enter your primary or backup email and we&apos;ll send a reset link.</p>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setStatus("Sending...");
            const res = await fetch("/api/auth/password-reset/request", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email }),
            });
            if (!res.ok) {
              setStatus("Failed to send reset email.");
              return;
            }
            const body = (await res.json()) as { ok?: boolean; resetUrl?: string };
            setResetUrl(body.resetUrl ?? "");
            setStatus("If your email exists, a reset link was sent.");
          }}
        >
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@example.com" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          <button type="submit" className="w-full rounded-lg bg-blue-600 px-3 py-2 text-white">Send reset link</button>
        </form>
        {resetUrl ? (
          <p className="mt-3 text-sm text-slate-200">
            Dev reset link: <Link href={resetUrl} className="underline text-[var(--text-strong)]">Open reset link</Link>
          </p>
        ) : null}
        {status ? <p className="mt-2 text-sm text-slate-300">{status}</p> : null}
      </div>
    </main>
  );
}
