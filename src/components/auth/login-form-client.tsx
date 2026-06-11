"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginFormClient({
  defaultIdentifier,
  initialError,
  initialNotice,
}: {
  defaultIdentifier?: string;
  initialError?: string;
  initialNotice?: string;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState(defaultIdentifier ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [notice, setNotice] = useState(initialNotice ?? "");
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-2.5"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setNotice("");

        const trimmedIdentifier = identifier.trim();
        if (!trimmedIdentifier || !password) {
          setError("Enter both identifier and password.");
          return;
        }

        setLoading(true);
        try {
          const result = await signIn("credentials", {
            identifier: trimmedIdentifier,
            password,
            redirect: false,
            callbackUrl: "/home",
          });

          if (!result || result.error) {
            setError("Invalid email/username or password.");
            return;
          }

          router.push(result.url ?? "/home");
          router.refresh();
        } finally {
          setLoading(false);
        }
      }}
    >
      <label className="block text-xs uppercase tracking-[0.16em] text-[#e6d39f]">
        Email or Username
        <input
          name="identifier"
          type="text"
          required
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          className="mt-1 w-full rounded-lg border border-[#9d7a2e] bg-[#0e1118]/92 px-3 py-1.5 text-sm text-[#fff2d1] placeholder:text-[#baa77a]"
          placeholder="you@example.com or username"
        />
      </label>
      <label className="block text-xs uppercase tracking-[0.16em] text-[#e6d39f]">
        Password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-lg border border-[#9d7a2e] bg-[#0e1118]/92 px-3 py-1.5 text-sm text-[#fff2d1] placeholder:text-[#baa77a]"
          placeholder="Your secure password"
        />
      </label>

      <div className="flex items-center justify-between pt-1">
        <Link
          href="/signup"
          className="rounded-md border border-[#9d7a2e] bg-[#101828] px-3 py-1 text-sm text-[#f4d786]"
        >
          Create!
        </Link>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md border border-[#b89033] bg-gradient-to-r from-[#8e6f2c] via-[#e4bd53] to-[#8e6f2c] px-4 py-1 text-sm font-semibold text-[#1f1306] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] disabled:opacity-70"
        >
          {loading ? "Signing in..." : "Submit"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-[#ff9f9f]">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-[#b9e7bb]">{notice}</p> : null}
    </form>
  );
}
