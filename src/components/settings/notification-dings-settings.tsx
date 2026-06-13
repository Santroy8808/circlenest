"use client";

import { useEffect, useState } from "react";

export function NotificationDingsSettings() {
  const [notificationDingsEnabled, setNotificationDingsEnabled] = useState(true);
  const [alertDingsEnabled, setAlertDingsEnabled] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings/notification-dings", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as {
        notificationDingsEnabled: boolean;
        alertDingsEnabled: boolean;
      };
      setNotificationDingsEnabled(Boolean(body.notificationDingsEnabled));
      setAlertDingsEnabled(Boolean(body.alertDingsEnabled));
    })();
  }, []);

  async function save() {
    setStatus("Saving...");
    const res = await fetch("/api/settings/notification-dings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationDingsEnabled,
        alertDingsEnabled,
      }),
    });
    setStatus(res.ok ? "Saved." : "Could not save.");
  }

  return (
    <section id="notifications" className="mt-3 rounded border border-[var(--border)] p-3">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">Phone notifications</h2>
      <p className="mt-1 text-xs text-slate-300">Turn phone sounds on or off for Notifications and Alerts.</p>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notificationDingsEnabled} onChange={(e) => setNotificationDingsEnabled(e.target.checked)} />
        Sound for Notifications
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={alertDingsEnabled} onChange={(e) => setAlertDingsEnabled(e.target.checked)} />
        Sound for Alerts
      </label>
      <button type="button" onClick={() => void save()} className="mt-2 rounded border px-3 py-1.5 text-sm">
        Save phone notifications
      </button>
      {status ? <p className="mt-1 text-xs text-slate-400">{status}</p> : null}
    </section>
  );
}

