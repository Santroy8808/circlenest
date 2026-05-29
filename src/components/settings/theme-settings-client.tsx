"use client";

import { useState } from "react";
import Image from "next/image";
import { FEED_MODES } from "@/lib/feed/modes";

const themes = ["drakudai", "classic-blue", "dark-mode", "neon", "minimal", "forest", "ocean", "sunset", "cyber", "pastel", "professional", "retro-web", "high-contrast"];

export function ThemeSettingsClient() {
  const [status, setStatus] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [token, setToken] = useState("");

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h1 className="mb-4 text-xl font-semibold">Theme & Feed Settings</h1>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setStatus("Saving...");
            const form = new FormData(e.currentTarget);
            const res = await fetch("/api/settings/theme", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ themeKey: form.get("themeKey"), feedMode: form.get("feedMode") }),
            });
            setStatus(res.ok ? "Saved." : "Failed to save.");
          }}
        >
          <label className="text-sm font-medium">Theme</label>
          <select name="themeKey" className="rounded-lg border border-slate-300 px-3 py-2">{themes.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <label className="text-sm font-medium">Feed mode</label>
          <select name="feedMode" className="rounded-lg border border-slate-300 px-3 py-2">{FEED_MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-white">Save settings</button>
          {status ? <p className="text-sm text-slate-600">{status}</p> : null}
        </form>
      </div>

      <div className="card p-6">
        <h2 className="mb-2 text-lg font-semibold">Two-Factor Authentication (2FA)</h2>
        <p className="mb-3 text-sm text-slate-600">Set up TOTP with Google Authenticator, 1Password, Authy, or similar.</p>
        <div className="flex flex-wrap gap-2">
          <button className="rounded bg-slate-900 px-3 py-2 text-white" onClick={async () => {
            const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
            const body = await res.json();
            if (res.ok) { setQr(body.qrDataUrl || null); setSecret(body.secret || null); }
          }}>Generate 2FA Setup</button>
        </div>
        {qr ? <Image src={qr} alt="2FA QR code" width={176} height={176} className="mt-3 rounded border border-slate-200" /> : null}
        {secret ? <p className="mt-2 text-xs text-slate-600">Secret: <code>{secret}</code></p> : null}
        <form className="mt-3 flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const res = await fetch("/api/auth/2fa/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
          setStatus(res.ok ? "2FA enabled." : "Invalid 2FA code.");
        }}>
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Enter 6-digit code" className="rounded border border-slate-300 px-3 py-2" />
          <button className="rounded bg-blue-600 px-3 py-2 text-white" type="submit">Enable 2FA</button>
        </form>
      </div>
    </div>
  );
}
