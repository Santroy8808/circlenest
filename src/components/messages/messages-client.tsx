"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

type FriendRef = {
  id: string;
  username: string;
  fullName?: string | null;
  profile?: { displayName?: string | null; avatarUrl?: string | null } | null;
};

type ThreadParticipantRef = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
};

type ThreadSummary = {
  id: string;
  kind: "DIRECT" | "GROUP" | string;
  title: string | null;
  displayLabel: string;
  subtitle: string;
  participantCount: number;
  participants: ThreadParticipantRef[];
  unread: number;
  lastMessageBody: string;
  lastMessageAt: string;
};

function threadTitle(thread: ThreadSummary) {
  return thread.kind === "GROUP" ? thread.title ?? thread.displayLabel : thread.displayLabel;
}

function formatThreadTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 86_400_000) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diff < 604_800_000) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString();
}

function kindChip(kind: ThreadSummary["kind"]) {
  return kind === "GROUP"
    ? { label: "Group", icon: "◉", className: "border-[#56703d] bg-[#1a2412] text-[#c9e09d]" }
    : { label: "Direct", icon: "●", className: "border-[#385b8f] bg-[#141f31] text-[#aac8ff]" };
}

export function MessagesClient({ friends }: { myUserId: string; friends: FriendRef[] }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadSearch, setThreadSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<"ALL" | "DIRECT" | "GROUP">("ALL");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/messages/threads", { cache: "no-store" });
    if (!res.ok) return;
    const nextThreads = (await res.json()) as ThreadSummary[];
    setThreads(nextThreads);
  }, []);

  const openChatWindow = useCallback((thread: ThreadSummary) => {
    setActiveThreadId(thread.id);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("theta.activeChatThreadId", thread.id);
      } catch {}
      window.dispatchEvent(
        new CustomEvent("theta-chat-open", {
          detail: {
            threadId: thread.id,
            title: threadTitle(thread),
            subtitle: thread.subtitle,
          },
        }),
      );
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load();
    }, 20000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  useEffect(() => {
    function handleClose() {
      setActiveThreadId(null);
    }
    window.addEventListener("theta-chat-close", handleClose);
    return () => window.removeEventListener("theta-chat-close", handleClose);
  }, []);

  const filteredThreads = useMemo(() => {
    const query = threadSearch.trim().toLowerCase();
    return threads.filter((thread) => {
      if (chatFilter !== "ALL" && thread.kind !== chatFilter) return false;
      if (!query) return true;
      const participantText = thread.participants.map((participant) => `${participant.username} ${participant.displayName}`).join(" ");
      return (
        thread.displayLabel.toLowerCase().includes(query) ||
        thread.subtitle.toLowerCase().includes(query) ||
        thread.lastMessageBody.toLowerCase().includes(query) ||
        participantText.toLowerCase().includes(query) ||
        (thread.title ?? "").toLowerCase().includes(query)
      );
    });
  }, [chatFilter, threadSearch, threads]);

  const friendCount = friends.length;
  const unreadCount = threads.reduce((sum, thread) => sum + thread.unread, 0);

  return (
    <div className="space-y-4">
      <section className="rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-strong)]">Mailbox</h2>
            <p className="text-sm text-slate-400">Open any direct or group chat in the pop-out window.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-[#304058] bg-[#111a2a] px-3 py-1.5">{threads.length} chats</span>
            <span className="rounded-full border border-[#304058] bg-[#111a2a] px-3 py-1.5">{friendCount} friends</span>
            <span className="rounded-full border border-[#304058] bg-[#111a2a] px-3 py-1.5">{unreadCount} unread</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={threadSearch}
            onChange={(event) => setThreadSearch(event.target.value)}
            placeholder="Search by person, group, or message text"
            className="rounded-[12px] border border-[#304058] bg-[#182232] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)]/50"
          />
          <div className="flex flex-wrap items-center gap-2">
            {(["ALL", "DIRECT", "GROUP"] as const).map((value) => {
              const active = chatFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setChatFilter(value)}
                  className={
                    active
                      ? "rounded-[10px] border border-[#cdb66d]/40 bg-[#1a2030] px-3 py-2 text-sm text-white shadow-[inset_0_-2px_0_#d8c36f]"
                      : "rounded-[10px] border border-[#2c3951] px-3 py-2 text-sm text-slate-300 transition hover:border-[#4a5a78] hover:text-white"
                  }
                >
                  {value === "ALL" ? "All chats" : value === "DIRECT" ? "Direct" : "Groups"}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-2 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
        <div className="divide-y divide-[#243146]">
          {filteredThreads.map((thread) => {
            const label = threadTitle(thread);
            const selected = activeThreadId === thread.id;
            const chip = kindChip(thread.kind);
            return (
              <button
                key={thread.id}
                type="button"
                className={`group flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left transition ${
                  selected ? "bg-[#162033]" : "hover:bg-[#131d2f]"
                }`}
                onClick={() => openChatWindow(thread)}
              >
                {thread.participants[0]?.avatarUrl ? (
                  <Image
                    src={thread.participants[0].avatarUrl}
                    alt={label}
                    width={54}
                    height={54}
                    unoptimized
                    className="h-12 w-12 shrink-0 rounded-full border border-[#304058] object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#304058] bg-[#23324a] text-sm font-semibold text-white">
                    {label.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{label}</p>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${chip.className}`}>
                      <span>{chip.icon}</span>
                      <span>{chip.label}</span>
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-400">{thread.subtitle}</p>
                  <p className="mt-1 truncate text-sm text-slate-300">{thread.lastMessageBody?.trim() || "No messages yet"}</p>
                </div>

                <div className="ml-2 flex shrink-0 flex-col items-end gap-2">
                  <span className="text-[11px] text-slate-400">{formatThreadTime(thread.lastMessageAt)}</span>
                  {thread.unread > 0 ? (
                    <span className="rounded-full bg-[#376ef8] px-2 py-0.5 text-xs font-semibold text-white">{thread.unread}</span>
                  ) : (
                    <span className="text-xs text-slate-500 transition group-hover:text-slate-300">Open</span>
                  )}
                </div>
              </button>
            );
          })}
          {threads.length === 0 ? <p className="px-3 py-8 text-sm text-slate-400">No messages yet.</p> : null}
          {threads.length > 0 && filteredThreads.length === 0 ? <p className="px-3 py-8 text-sm text-slate-400">No matching chats.</p> : null}
        </div>
      </section>

      {status ? <p className="text-xs text-slate-300">{status}</p> : null}
    </div>
  );
}
