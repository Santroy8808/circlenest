"use client";

import { useState } from "react";

export default function ResetPasswordConfirmClient({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="card p-6">
        <h1 className="mb-2 text-xl font-semibold">Set New Password</h1>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setStatus("Saving...");
            const res = await fetch("/api/auth/password-reset/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, password }),
            });
            setStatus(res.ok ? "Password updated. You can log in now." : "Invalid or expired reset link.");
          }}
        >
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} required placeholder="New password (8+ chars incl capital/number/symbol)" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          <button type="submit" className="w-full rounded-lg bg-blue-600 px-3 py-2 text-white">Update password</button>
        </form>
        {!token ? <p className="mt-3 text-sm text-red-600">Missing reset token in URL.</p> : null}
        <p className="mt-3 text-sm text-slate-600">Link should look like: <code>/reset-password/confirm?token=...</code></p>
      </div>
    </main>
  );
}
