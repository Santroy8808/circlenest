"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Thread = {
  id: string;
  otherUsername: string;
  otherDisplayName?: string;
  otherAvatarUrl?: string | null;
  unread: number;
};

export function MessagesClient() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [username, setUsername] = useState("");
  const [threadSearch, setThreadSearch] = useState("");

  async function load() {
    const res = await fetch("/api/messages/threads", { cache: "no-store" });
    if (res.ok) setThreads((await res.json()) as Thread[]);
  }

  useEffect(() => {
    load();
  }, []);

  const filteredThreads = threads.filter((thread) => {
    const query = threadSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      thread.otherUsername.toLowerCase().includes(query) ||
      (thread.otherDisplayName ?? "").toLowerCase().includes(query)
    );
  });

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
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Start thread by username" className="flex-1 rounded border px-3 py-2" />
        <button className="rounded border border-[var(--border)] bg-[#8f7228] px-3 py-2 text-black" type="submit">Start</button>
      </form>
      <div className="mt-3">
        <input
          value={threadSearch}
          onChange={(event) => setThreadSearch(event.target.value)}
          placeholder="Search message threads by username"
          className="w-full rounded border px-3 py-2"
        />
      </div>
      <div className="mt-4 space-y-2">
        {filteredThreads.map((t) => (
          <a key={t.id} href={`/messages/${t.id}`} className="flex items-center justify-between rounded border border-[var(--border)] bg-[#111a2a] p-3">
            <div className="flex min-w-0 items-center gap-3">
              {t.otherAvatarUrl ? (
                <Image
                  src={t.otherAvatarUrl}
                  alt={`${t.otherDisplayName ?? t.otherUsername} avatar`}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2a3550] text-sm font-semibold text-white">
                  {(t.otherDisplayName ?? t.otherUsername).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{t.otherDisplayName ?? t.otherUsername}</p>
                <p className="truncate text-xs text-slate-300">@{t.otherUsername}</p>
              </div>
            </div>
            {t.unread > 0 ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{t.unread}</span> : null}
          </a>
        ))}
        {threads.length === 0 ? <p className="text-sm text-slate-300">No threads yet.</p> : null}
        {threads.length > 0 && filteredThreads.length === 0 ? <p className="text-sm text-slate-300">No matching threads.</p> : null}
      </div>
    </div>
  );
}
