"use client";

import { useEffect, useState } from "react";

type SubscriptionRow = {
  id: string;
  platform: string;
  endpoint: string;
  deviceId?: string | null;
  enabled: boolean;
  updatedAt: string;
  lastSentAt?: string | null;
};

export function PushSubscriptionClient() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [platform, setPlatform] = useState("ANDROID");
  const [endpoint, setEndpoint] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    const res = await fetch("/api/notifications/subscriptions", { cache: "no-store" });
    if (!res.ok) return;
    setRows((await res.json()) as SubscriptionRow[]);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="rounded border border-[var(--border)] bg-[#0e1728] p-3">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">Push Notifications</h2>
      <p className="mt-1 text-xs text-slate-300">
        Register your mobile app push endpoint/token so new DMs can trigger native notifications.
      </p>

      <form
        className="mt-2 grid gap-2 md:grid-cols-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setStatus("Saving...");
          const res = await fetch("/api/notifications/subscriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              platform,
              endpoint,
              deviceId: deviceId || undefined,
              enabled: true,
            }),
          });
          if (!res.ok) {
            setStatus("Could not save subscription.");
            return;
          }
          setEndpoint("");
          setStatus("Saved.");
          await load();
        }}
      >
        <select className="rounded border px-2 py-2 text-sm" value={platform} onChange={(event) => setPlatform(event.target.value)}>
          <option value="ANDROID">Android</option>
          <option value="IOS">iOS</option>
          <option value="WEB">Web</option>
        </select>
        <input
          className="rounded border px-2 py-2 text-sm md:col-span-2"
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
          placeholder="FCM token or push endpoint"
          required
        />
        <input
          className="rounded border px-2 py-2 text-sm"
          value={deviceId}
          onChange={(event) => setDeviceId(event.target.value)}
          placeholder="Device ID (optional)"
        />
        <button type="submit" className="rounded border border-[#6a5420] bg-[#c49a35] px-3 py-2 text-sm font-semibold text-[#1a1305] md:col-span-4">
          Save Push Endpoint
        </button>
      </form>

      {status ? <p className="mt-2 text-xs text-slate-300">{status}</p> : null}

      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between rounded border border-[var(--border)] bg-[#111c30] p-2">
            <div className="min-w-0">
              <p className="truncate text-xs text-slate-100">{row.platform} {row.deviceId ? `(${row.deviceId})` : ""}</p>
              <p className="truncate text-[11px] text-slate-400">{row.endpoint}</p>
              <p className="text-[11px] text-slate-500">
                Last sent: {row.lastSentAt ? new Date(row.lastSentAt).toLocaleString() : "never"}
              </p>
            </div>
            <button
              type="button"
              className="rounded border border-red-400 px-2 py-1 text-xs text-red-200"
              onClick={async () => {
                await fetch("/api/notifications/subscriptions", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ endpoint: row.endpoint }),
                });
                await load();
              }}
            >
              Remove
            </button>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-xs text-slate-400">No push endpoints saved yet.</p> : null}
      </div>
    </section>
  );
}
