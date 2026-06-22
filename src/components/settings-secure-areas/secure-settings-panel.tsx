"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export function SecureSettingsPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [currentPath, setCurrentPath] = useState("/settings");

  useEffect(() => {
    const unlockedAt = Number(sessionStorage.getItem("theta-space-secure-unlocked-at") ?? 0);
    setCurrentPath(window.location.pathname);
    setUnlocked(Boolean(unlockedAt) && Date.now() - unlockedAt < FIFTEEN_MINUTES);
  }, []);

  if (!unlocked) {
    return (
      <section className="surface rounded-md p-8 text-center">
        <h1 className="text-3xl font-semibold text-[var(--gold)]">{title}</h1>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--muted)]">This settings area needs a fresh secure unlock.</p>
        <Link className="btn-primary mt-5 inline-block" href={`/secure-area?next=${encodeURIComponent(currentPath)}`}>
          Unlock secure area
        </Link>
      </section>
    );
  }

  return (
    <section className="surface rounded-md p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Secure Settings</p>
      <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
      <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}
