"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="card p-6">
        <h1 className="mb-4 text-xl font-semibold">Sign Up</h1>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const form = new FormData(e.currentTarget);
            const res = await fetch("/api/auth/signup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: form.get("email"),
                backupEmail: form.get("backupEmail"),
                username: form.get("username"),
                password: form.get("password"),
              }),
            });
            if (!res.ok) {
              const body = (await res.json()) as { error?: string };
              setError(body.error ?? "Signup failed");
              return;
            }
            router.push("/login");
          }}
        >
          <input name="email" type="email" required placeholder="Email" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          <input name="backupEmail" type="email" placeholder="Backup email (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          <input name="username" required placeholder="Username" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          <input name="password" type="password" required minLength={8} placeholder="Password" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" className="w-full rounded-lg bg-blue-600 px-3 py-2 text-white">Create account</button>
        </form>
      </div>
    </main>
  );
}
