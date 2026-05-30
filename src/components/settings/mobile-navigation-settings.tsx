"use client";

import { useEffect, useState } from "react";

type SwipeSide = "LEFT" | "RIGHT";

export function MobileNavigationSettings() {
  const [side, setSide] = useState<SwipeSide>("RIGHT");
  const [status, setStatus] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/mobile-navigation", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { side?: SwipeSide };
        setSide(body.side === "LEFT" ? "LEFT" : "RIGHT");
      } catch {
        // no-op
      }
    })();
  }, []);

  async function update(next: SwipeSide) {
    setSide(next);
    setStatus("Saving...");
    try {
      const res = await fetch("/api/settings/mobile-navigation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: next }),
      });
      if (!res.ok) {
        setStatus("Could not save.");
        return;
      }
      setStatus("Saved.");
    } catch {
      setStatus("Could not save.");
    }
  }

  return (
    <section className="mt-4 rounded-md border border-[var(--border)] p-3">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">Mobile Navigation</h2>
      <p className="mt-1 text-xs text-slate-300">Swipe from your selected edge to open the mobile navigation menu.</p>
      <div className="mt-2 flex items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-1">
          <input type="radio" name="mobile-swipe-side" checked={side === "RIGHT"} onChange={() => void update("RIGHT")} />
          <span>Right (Default)</span>
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="radio" name="mobile-swipe-side" checked={side === "LEFT"} onChange={() => void update("LEFT")} />
          <span>Left</span>
        </label>
      </div>
      {status ? <p className="mt-2 text-xs text-slate-400">{status}</p> : null}
    </section>
  );
}

