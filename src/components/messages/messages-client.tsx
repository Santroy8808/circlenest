"use client";

import { useEffect, useState } from "react";

type Thread = { id: string; otherUsername: string; unread: number };

export function MessagesClient() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [username, setUsername] = useState("");

  async function load() {
    const res = await fetch("/api/messages/threads", { cache: "no-store" });
    if (res.ok) setThreads((await res.json()) as Thread[]);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!username.trim()) return;
          const res = await fetch("/api/messages/threads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) });
          if (res.ok) {
            const body = (await res.json()) as { id: string };
            window.location.href = `/messages/${body.id}`;
          }
        }}
      >
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Start thread by username" className="flex-1 rounded border border-slate-300 px-3 py-2" />
        <button className="rounded bg-blue-600 px-3 py-2 text-white" type="submit">Start</button>
      </form>
      <div className="mt-4 space-y-2">
        {threads.map((t) => (
          <a key={t.id} href={`/messages/${t.id}`} className="flex items-center justify-between rounded border border-slate-200 p-3">
            <span>@{t.otherUsername}</span>
            {t.unread > 0 ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{t.unread}</span> : null}
          </a>
        ))}
        {threads.length === 0 ? <p className="text-sm text-slate-600">No threads yet.</p> : null}
      </div>
    </div>
  );
}
