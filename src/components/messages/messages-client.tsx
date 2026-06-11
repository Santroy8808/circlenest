"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type DraggableWindowProps = {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function DraggableWindow({ title, subtitle, onClose, children }: DraggableWindowProps) {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const positionRef = useRef({ x: 24, y: 88 });
  const [position, setPosition] = useState({ x: 24, y: 88 });
  const [size, setSize] = useState({ width: 860, height: 720 });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const width = typeof window === "undefined" ? 860 : Math.min(860, Math.max(360, Math.floor(window.innerWidth * 0.78)));
    const height = typeof window === "undefined" ? 720 : Math.min(760, Math.max(420, Math.floor(window.innerHeight * 0.76)));
    const left = typeof window === "undefined" ? 24 : window.innerWidth < 900 ? 8 : Math.max(24, window.innerWidth - width - 24);
    const top = typeof window === "undefined" ? 88 : window.innerHeight < 760 ? 8 : 96;
    setSize({ width, height });
    setPosition({ x: left, y: top });
    positionRef.current = { x: left, y: top };
  }, [title]);

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      if (dragRef.current && windowRef.current) {
        const bounds = windowRef.current.getBoundingClientRect();
        const nextX = clamp(event.clientX - dragRef.current.offsetX, 8, Math.max(8, window.innerWidth - bounds.width - 8));
        const nextY = clamp(event.clientY - dragRef.current.offsetY, 8, Math.max(8, window.innerHeight - bounds.height - 8));
        positionRef.current = { x: nextX, y: nextY };
        setPosition({ x: nextX, y: nextY });
      }
      if (resizeRef.current) {
        const currentPosition = positionRef.current;
        const nextWidth = clamp(
          resizeRef.current.startWidth + (event.clientX - resizeRef.current.startX),
          420,
          Math.max(420, window.innerWidth - currentPosition.x - 8),
        );
        const nextHeight = clamp(
          resizeRef.current.startHeight + (event.clientY - resizeRef.current.startY),
          420,
          Math.max(420, window.innerHeight - currentPosition.y - 8),
        );
        setSize({ width: nextWidth, height: nextHeight });
      }
    }

    function handleUp() {
      dragRef.current = null;
      resizeRef.current = null;
      setDragging(false);
      setResizing(false);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div
        ref={windowRef}
        className="pointer-events-auto fixed flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0b1422] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        style={{ left: position.x, top: position.y, width: size.width, height: size.height, minWidth: 420, minHeight: 420 }}
      >
        <div
          className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[#111b2d] px-4 py-3"
          style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            dragRef.current = {
              offsetX: event.clientX - position.x,
              offsetY: event.clientY - position.y,
            };
            setDragging(true);
          }}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{title}</p>
            <p className="truncate text-xs text-slate-400">{subtitle}</p>
          </div>
          <button
            type="button"
            className="rounded border border-[var(--border)] px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/5"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex flex-1 flex-col overflow-hidden p-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[#0e1728]">
            {children}
          </div>
        </div>
        <button
          type="button"
          aria-label="Resize chat window"
          className="absolute bottom-1 right-1 h-5 w-5 cursor-se-resize rounded-sm border border-[var(--border)] bg-[#152238] text-[0px] opacity-70 transition hover:opacity-100"
          style={{ touchAction: "none" }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            resizeRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              startWidth: size.width,
              startHeight: size.height,
            };
            setResizing(true);
          }}
        />
      </div>
    </div>
  );
}

function displayNameForUser(user: FriendRef) {
  return user.profile?.displayName ?? user.fullName ?? user.username;
}

function threadTitle(thread: ThreadSummary) {
  return thread.kind === "GROUP" ? thread.title ?? thread.displayLabel : thread.displayLabel;
}

export function MessagesClient({ myUserId, friends }: { myUserId: string; friends: FriendRef[] }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadSearch, setThreadSearch] = useState("");
  const [directUsername, setDirectUsername] = useState("");
  const [directMessage, setDirectMessage] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMessage, setGroupMessage] = useState("");
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [loadingDirect, setLoadingDirect] = useState(false);
  const [loadingGroup, setLoadingGroup] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/messages/threads", { cache: "no-store" });
    if (res.ok) setThreads((await res.json()) as ThreadSummary[]);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 7000);
    return () => window.clearInterval(timer);
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
    if (!query) return threads;
    return threads.filter((thread) => {
      const participantText = thread.participants.map((participant) => `${participant.username} ${participant.displayName}`).join(" ");
      return (
        thread.displayLabel.toLowerCase().includes(query) ||
        thread.subtitle.toLowerCase().includes(query) ||
        thread.lastMessageBody.toLowerCase().includes(query) ||
        participantText.toLowerCase().includes(query) ||
        (thread.title ?? "").toLowerCase().includes(query)
      );
    });
  }, [threadSearch, threads]);

  const toggleFriend = useCallback((friendId: string) => {
    setSelectedFriendIds((previous) =>
      previous.includes(friendId) ? previous.filter((value) => value !== friendId) : [...previous, friendId],
    );
  }, []);

  const openChatWindow = useCallback((threadId: string, title?: string, subtitle?: string) => {
    setActiveThreadId(threadId);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("theta.activeChatThreadId", threadId);
      } catch {}
      window.dispatchEvent(
        new CustomEvent("theta-chat-open", {
          detail: { threadId, title, subtitle },
        }),
      );
    }
  }, []);

  async function startThread(payload: Record<string, unknown>) {
    const res = await fetch("/api/messages/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok) {
      setStatus(body.error ?? "Could not start chat.");
      return null;
    }
    setStatus("");
    await load();
    return body.id ?? null;
  }

  return (
    <div className="space-y-4">
      <section className="rounded border border-[var(--border)] bg-[#0e1728] p-3">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">Start a single chat</h2>
        <p className="mt-1 text-xs text-slate-400">Single chats are for people who are not in your friends/family list.</p>
        <form
          className="mt-3 space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const username = directUsername.trim().replace(/^@+/, "");
            if (!username) return;
            setLoadingDirect(true);
            const id = await startThread({
              mode: "DIRECT",
              username,
              initialMessage: directMessage.trim() || undefined,
            });
            if (id) {
              openChatWindow(id, `@${username}`, "Opening thread...");
              setDirectUsername("");
              setDirectMessage("");
            }
            setLoadingDirect(false);
          }}
        >
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              value={directUsername}
              onChange={(event) => setDirectUsername(event.target.value)}
              className="rounded border border-[var(--border)] bg-[#111a2a] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
              placeholder="Username for single chat"
            />
            <button
              className="rounded border border-[#6a5420] bg-[#c49a35] px-3 py-2 text-[#1a1204] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)] disabled:opacity-60"
              type="submit"
              disabled={loadingDirect}
            >
              {loadingDirect ? "Opening..." : "Open chat"}
            </button>
          </div>
          <textarea
            value={directMessage}
            onChange={(event) => setDirectMessage(event.target.value)}
            placeholder="Optional first message"
            className="w-full rounded border border-[var(--border)] bg-[#111a2a] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
            rows={2}
          />
        </form>
      </section>

      <section className="rounded border border-[var(--border)] bg-[#0e1728] p-3">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">Start a group chat</h2>
        <p className="mt-1 text-xs text-slate-400">Group chats are friends/family only.</p>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selectedFriendIds.length) {
              setStatus("Pick at least one friend.");
              return;
            }
            setLoadingGroup(true);
            const id = await startThread({
              mode: "GROUP",
              participantIds: selectedFriendIds,
              title: groupTitle.trim() || undefined,
              initialMessage: groupMessage.trim() || undefined,
            });
            if (id) {
              openChatWindow(id, groupTitle.trim() || "Group chat", `${selectedFriendIds.length} participants`);
              setGroupTitle("");
              setGroupMessage("");
              setSelectedFriendIds([]);
            }
            setLoadingGroup(false);
          }}
        >
          <input
            value={groupTitle}
            onChange={(event) => setGroupTitle(event.target.value)}
            className="w-full rounded border border-[var(--border)] bg-[#111a2a] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
            placeholder="Group title (optional)"
          />
          <div className="rounded border border-[var(--border)] bg-[#111a2a] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Pick friends</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {friends.map((friend) => {
                const selected = selectedFriendIds.includes(friend.id);
                return (
                  <button
                    key={friend.id}
                    type="button"
                    className={`flex items-center gap-3 rounded border px-3 py-2 text-left transition ${
                      selected ? "border-[#d6b24a66] bg-[#2a2110]" : "border-[var(--border)] bg-[#0f1728] hover:bg-white/5"
                    }`}
                    onClick={() => toggleFriend(friend.id)}
                  >
                    {friend.profile?.avatarUrl ? (
                      <Image
                        src={friend.profile.avatarUrl}
                        alt={displayNameForUser(friend)}
                        width={34}
                        height={34}
                        unoptimized
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a3550] text-xs font-semibold text-white">
                        {displayNameForUser(friend).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">{displayNameForUser(friend)}</p>
                      <p className="truncate text-xs text-slate-400">@{friend.username}</p>
                    </div>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${selected ? "bg-amber-400/15 text-amber-200" : "bg-white/5 text-slate-400"}`}>
                      {selected ? "Added" : "Add"}
                    </span>
                  </button>
                );
              })}
              {friends.length === 0 ? <p className="text-sm text-slate-400">No friends yet.</p> : null}
            </div>
          </div>
          <textarea
            value={groupMessage}
            onChange={(event) => setGroupMessage(event.target.value)}
            placeholder="Optional first group message"
            className="w-full rounded border border-[var(--border)] bg-[#111a2a] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
            rows={2}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">{selectedFriendIds.length} selected</p>
            <button
              className="rounded border border-[#6a5420] bg-[#c49a35] px-3 py-2 text-[#1a1204] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)] disabled:opacity-60"
              type="submit"
              disabled={loadingGroup}
            >
              {loadingGroup ? "Opening..." : "Open group chat"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded border border-[var(--border)] bg-[#0e1728] p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">Messages</h2>
          <span className="text-xs text-slate-400">Tap a row to open a chat window</span>
        </div>
        <div className="mt-2">
          <input
            value={threadSearch}
            onChange={(event) => setThreadSearch(event.target.value)}
            placeholder="Search by name, group title, or message text"
            className="w-full rounded border border-[var(--border)] bg-[#111a2a] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <div className="mt-4 space-y-2">
          {filteredThreads.map((thread) => {
            const label = threadTitle(thread);
            const selected = activeThreadId === thread.id;
            return (
              <button
                key={thread.id}
                type="button"
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition hover:-translate-y-0.5 hover:bg-white/5 ${
                  selected ? "border-[#d6b24a88] bg-[#151f31]" : "border-[var(--border)] bg-[#111a2a]"
                }`}
                onClick={() => openChatWindow(thread.id, label, thread.subtitle)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2a3550] text-sm font-semibold text-white ring-1 ring-[var(--border)]">
                  {label.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-100">{label}</p>
                    {thread.kind === "GROUP" ? (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                        Group
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-slate-400">{thread.subtitle}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-300">
                    {thread.lastMessageBody?.trim() ? thread.lastMessageBody : "No messages yet"}
                  </p>
                </div>
                <div className="ml-3 flex shrink-0 flex-col items-end gap-1">
                  {thread.lastMessageAt ? <span className="text-[10px] text-slate-400">{new Date(thread.lastMessageAt).toLocaleString()}</span> : null}
                  {thread.unread > 0 ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{thread.unread}</span> : null}
                </div>
              </button>
            );
          })}
          {threads.length === 0 ? <p className="text-sm text-slate-300">No threads yet.</p> : null}
          {threads.length > 0 && filteredThreads.length === 0 ? <p className="text-sm text-slate-300">No matching threads.</p> : null}
        </div>
      </section>

      {status ? <p className="text-xs text-slate-300">{status}</p> : null}
    </div>
  );
}
