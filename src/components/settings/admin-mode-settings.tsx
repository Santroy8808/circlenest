"use client";

import { useEffect, useState } from "react";

export function AdminModeSettings() {
  const [enabled, setEnabled] = useState(false);
  const [hasAdminPassword, setHasAdminPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/admin-mode", { cache: "no-store" });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const body = (await res.json()) as { enabled?: boolean; hasAdminPassword?: boolean };
        setEnabled(Boolean(body.enabled));
        setHasAdminPassword(Boolean(body.hasAdminPassword));
      } catch {
        // no-op
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function disable() {
    setStatus("Saving...");
    try {
      const res = await fetch("/api/settings/admin-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "disable" }),
      });
      if (!res.ok) {
        setStatus("Could not save.");
        return;
      }
      setEnabled(false);
      setAdminPassword("");
      setStatus("Administrator mode disabled.");
    } catch {
      setStatus("Could not save.");
    }
  }

  async function setup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving...");
    try {
      const res = await fetch("/api/settings/admin-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "setup",
          currentPassword,
          adminPassword,
          confirmAdminPassword,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; hasAdminPassword?: boolean };
      if (!res.ok) {
        setStatus(body.error ?? "Could not save.");
        return;
      }
      setHasAdminPassword(Boolean(body.hasAdminPassword));
      setCurrentPassword("");
      setAdminPassword("");
      setConfirmAdminPassword("");
      setStatus("Admin password saved.");
    } catch {
      setStatus("Could not save.");
    }
  }

  async function enable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Enabling...");
    try {
      const res = await fetch("/api/settings/admin-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "enable",
          adminPassword,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; enabled?: boolean };
      if (!res.ok) {
        setStatus(body.error ?? "Could not enable administrator mode.");
        return;
      }
      setEnabled(Boolean(body.enabled));
      setAdminPassword("");
      setStatus("Administrator mode enabled for 15 minutes.");
    } catch {
      setStatus("Could not enable administrator mode.");
    }
  }

  return (
    <section id="administrator-mode" className="mt-4 rounded-md border border-[var(--border)] p-3">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">Administrator Mode</h2>
      <p className="mt-1 text-xs text-slate-300">Admin privileges stay off until you unlock them with your separate admin password. Idle for 15 minutes turns them back off.</p>
      <div className="mt-3 rounded border border-amber-400/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
        Warning: administrator mode exposes elevated moderation and account-management tools. Use it only when you intentionally need admin access.
      </div>
      {!hasAdminPassword ? (
        <form className="mt-3 grid gap-2" onSubmit={(event) => void setup(event)}>
          <input
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            type="password"
            minLength={8}
            placeholder="Enter your user password"
            className="rounded border border-slate-300 px-3 py-2"
            required
          />
          <input
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            type="password"
            minLength={8}
            placeholder="Create your separate admin password"
            className="rounded border border-slate-300 px-3 py-2"
            required
          />
          <input
            value={confirmAdminPassword}
            onChange={(event) => setConfirmAdminPassword(event.target.value)}
            type="password"
            minLength={8}
            placeholder="Confirm admin password"
            className="rounded border border-slate-300 px-3 py-2"
            required
          />
          <button type="submit" disabled={loading} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60">
            Set Admin Password
          </button>
        </form>
      ) : enabled ? (
        <div className="mt-3 space-y-3">
          <div className="rounded border border-[var(--border)] bg-[color:var(--card-alt)] px-3 py-2 text-sm">
            Administrator mode is on.
          </div>
          <button type="button" disabled={loading} onClick={() => void disable()} className="rounded border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60">
            Disable Administrator Mode
          </button>
        </div>
      ) : (
        <form className="mt-3 grid gap-2" onSubmit={(event) => void enable(event)}>
          <input
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            type="password"
            minLength={8}
            placeholder="Enter your admin password"
            className="rounded border border-slate-300 px-3 py-2"
            required
          />
          <button type="submit" disabled={loading} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60">
            Enable Administrator Mode
          </button>
        </form>
      )}
      {status ? <p className="mt-2 text-xs text-slate-400">{status}</p> : null}
    </section>
  );
}
