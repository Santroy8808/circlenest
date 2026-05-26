"use client";

import { useState } from "react";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

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
            setStatus(res.ok ? "If your email exists, a reset link was sent." : "Failed to send reset email.");
          }}
        >
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@example.com" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          <button type="submit" className="w-full rounded-lg bg-blue-600 px-3 py-2 text-white">Send reset link</button>
        </form>
      </div>
    </main>
  );
}
