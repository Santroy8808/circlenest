"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThreadClient } from "@/components/messages/thread-client";

type OpenChatDetail = {
  threadId: string;
  title?: string;
  subtitle?: string;
};

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

const STORAGE_KEY = "theta.activeChatThreadId";
const STORAGE_GEOMETRY_KEY = "theta.activeChatThreadGeometry";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function displayNameForUser(user: FriendRef) {
  return user.fullName ?? user.profile?.displayName ?? user.username;
}

function threadTitle(thread: ThreadSummary) {
  return thread.kind === "GROUP" ? thread.title ?? thread.displayLabel : thread.displayLabel;
}

function formatThreadTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 86_400_000) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff < 604_800_000) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString();
}

function threadChip(kind: ThreadSummary["kind"]) {
  return kind === "GROUP"
    ? { label: "Group", className: "border-[#56703d] bg-[#1a2412] text-[#c9e09d]" }
    : { label: "Direct", className: "border-[#385b8f] bg-[#141f31] text-[#aac8ff]" };
}

export function GlobalChatDock({ myUserId }: { myUserId: string }) {
  const pathname = usePathname();
  const windowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const positionRef = useRef({ x: 24, y: 88 });
  const [position, setPosition] = useState({ x: 24, y: 88 });
  const [size, setSize] = useState({ width: 860, height: 760 });
  const [dragging, setDragging] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [title, setTitle] = useState("Chat");
  const [subtitle, setSubtitle] = useState("Opening thread...");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryMode, setDirectoryMode] = useState<"threads" | "friends" | "group">("threads");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [friends, setFriends] = useState<FriendRef[]>([]);
  const [search, setSearch] = useState("");
  const [threadFilter, setThreadFilter] = useState<"ALL" | "DIRECT" | "GROUP">("ALL");
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const width = typeof window === "undefined" ? 960 : Math.min(960, Math.max(360, Math.floor(window.innerWidth * 0.82)));
    const height = typeof window === "undefined" ? 760 : Math.min(760, Math.max(420, Math.floor(window.innerHeight * 0.76)));
    const left = typeof window === "undefined" ? 24 : window.innerWidth < 900 ? 8 : Math.max(24, window.innerWidth - width - 24);
    const top = typeof window === "undefined" ? 88 : window.innerHeight < 760 ? 8 : 96;
    try {
      const geometry = window.localStorage.getItem(STORAGE_GEOMETRY_KEY);
      if (geometry) {
        const parsed = JSON.parse(geometry) as { width?: number; height?: number; x?: number; y?: number } | null;
        if (parsed) {
          setSize({
            width: typeof parsed.width === "number" ? parsed.width : width,
            height: typeof parsed.height === "number" ? parsed.height : height,
          });
          const nextPosition = {
            x: typeof parsed.x === "number" ? parsed.x : left,
            y: typeof parsed.y === "number" ? parsed.y : top,
          };
          setPosition(nextPosition);
          positionRef.current = nextPosition;
          return;
        }
      }
    } catch {}
    setSize({ width, height });
    setPosition({ x: left, y: top });
    positionRef.current = { x: left, y: top };
  }, []);

  const openChat = useCallback((detail: OpenChatDetail) => {
    setActiveThreadId(detail.threadId);
    setTitle(detail.title?.trim() || "Chat");
    setSubtitle(detail.subtitle?.trim() || "Opening thread...");
    try {
      window.localStorage.setItem(STORAGE_KEY, detail.threadId);
    } catch {}
  }, []);

  const closeChat = useCallback(() => {
    setActiveThreadId("");
    setTitle("Chat");
    setSubtitle("Opening thread...");
    setDirectoryOpen(false);
    setStatus("");
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const loadDirectory = useCallback(async () => {
    setDirectoryLoading(true);
    try {
      const [threadRes, friendRes] = await Promise.all([
        fetch("/api/messages/threads", { cache: "no-store" }),
        fetch("/api/messages/contacts", { cache: "no-store" }),
      ]);
      if (threadRes.ok) {
        setThreads((await threadRes.json()) as ThreadSummary[]);
      }
      if (friendRes.ok) {
        setFriends((await friendRes.json()) as FriendRef[]);
      }
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeThreadId) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, activeThreadId);
      window.localStorage.setItem(
        STORAGE_GEOMETRY_KEY,
        JSON.stringify({ x: position.x, y: position.y, width: size.width, height: size.height }),
      );
    } catch {}
  }, [activeThreadId, position.x, position.y, size.height, size.width]);

  useEffect(() => {
    if (pathname === "/mail") {
      closeChat();
      return;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setActiveThreadId(stored);
    } catch {}
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<OpenChatDetail>).detail;
      if (detail?.threadId) openChat(detail);
    }
    function handleClose() {
      closeChat();
    }
    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY && event.newValue) setActiveThreadId(event.newValue);
      if (event.key === STORAGE_GEOMETRY_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as { width?: number; height?: number; x?: number; y?: number } | null;
          if (parsed) {
            if (typeof parsed.width === "number" && typeof parsed.height === "number") {
              setSize({ width: parsed.width, height: parsed.height });
            }
            if (typeof parsed.x === "number" && typeof parsed.y === "number") {
              const next = { x: parsed.x, y: parsed.y };
              setPosition(next);
              positionRef.current = next;
            }
          }
        } catch {}
      }
    }
    window.addEventListener("theta-chat-open", handleOpen as EventListener);
    window.addEventListener("theta-chat-close", handleClose);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("theta-chat-open", handleOpen as EventListener);
      window.removeEventListener("theta-chat-close", handleClose);
      window.removeEventListener("storage", handleStorage);
    };
  }, [closeChat, openChat, pathname]);

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
          Math.max(280, window.innerWidth - currentPosition.x - 8),
        );
        const nextHeight = clamp(
          resizeRef.current.startHeight + (event.clientY - resizeRef.current.startY),
          280,
          Math.max(280, window.innerHeight - currentPosition.y - 8),
        );
        setSize({ width: nextWidth, height: nextHeight });
      }
    }

    function handleUp() {
      dragRef.current = null;
      resizeRef.current = null;
      setDragging(false);
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

  useEffect(() => {
    if (!activeThreadId) return;
    if (!threads.length && !friends.length) {
      void loadDirectory();
    }
  }, [activeThreadId, friends.length, loadDirectory, threads.length]);

  useEffect(() => {
    if (!activeThreadId || !threads.length) return;
    const match = threads.find((thread) => thread.id === activeThreadId);
    if (!match) return;
    setTitle(threadTitle(match));
    setSubtitle(match.subtitle);
  }, [activeThreadId, threads]);

  const filteredThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return threads.filter((thread) => {
      if (threadFilter !== "ALL" && thread.kind !== threadFilter) return false;
      if (!query) return true;
      const label = threadTitle(thread).toLowerCase();
      const participantText = thread.participants.map((participant) => `${participant.username} ${participant.displayName}`).join(" ").toLowerCase();
      return label.includes(query) || thread.subtitle.toLowerCase().includes(query) || thread.lastMessageBody.toLowerCase().includes(query) || participantText.includes(query);
    });
  }, [search, threadFilter, threads]);

  const filteredFriends = useMemo(() => {
    const query = search.trim().toLowerCase();
    return friends.filter((friend) => {
      if (!query) return true;
      return `${friend.username} ${displayNameForUser(friend)}`.toLowerCase().includes(query);
    });
  }, [friends, search]);

  const openThreadFromList = useCallback((thread: ThreadSummary) => {
    openChat({
      threadId: thread.id,
      title: threadTitle(thread),
      subtitle: thread.subtitle,
    });
    setDirectoryMode("threads");
    setDirectoryOpen(false);
  }, [openChat]);

  const startDirectChat = useCallback(async (friend: FriendRef) => {
    setStatus("");
    const res = await fetch("/api/messages/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "DIRECT", userId: friend.id }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !body.id) {
      setStatus(body.error ?? "Could not open chat.");
      return;
    }
    await loadDirectory();
    openChat({
      threadId: body.id,
      title: displayNameForUser(friend),
      subtitle: `@${friend.username}`,
    });
    setDirectoryOpen(false);
  }, [loadDirectory, openChat]);

  const startGroupChat = useCallback(async () => {
    if (!selectedFriendIds.length) {
      setStatus("Pick at least one friend.");
      return;
    }
    setStatus("");
    const res = await fetch("/api/messages/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "GROUP",
        participantIds: selectedFriendIds,
        title: groupTitle.trim() || undefined,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !body.id) {
      setStatus(body.error ?? "Could not create group chat.");
      return;
    }
    await loadDirectory();
    openChat({
      threadId: body.id,
      title: groupTitle.trim() || "Group chat",
      subtitle: `${selectedFriendIds.length + 1} participants`,
    });
    setGroupTitle("");
    setSelectedFriendIds([]);
    setDirectoryMode("threads");
    setDirectoryOpen(false);
  }, [groupTitle, loadDirectory, openChat, selectedFriendIds]);

  if (!activeThreadId) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[120]">
      <div
        ref={windowRef}
        className="pointer-events-auto fixed flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0b1422] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        style={{ left: position.x, top: position.y, width: size.width, height: size.height, minWidth: 420, minHeight: 280 }}
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`rounded border px-3 py-1.5 text-xs transition ${directoryOpen ? "border-[#d6b24a66] bg-[#241c0f] text-[#f5d777]" : "border-[var(--border)] text-slate-200 hover:bg-white/5"}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                setDirectoryOpen((value) => !value);
                void loadDirectory();
              }}
            >
              Browse
            </button>
            <button
              type="button"
              className="rounded border border-[var(--border)] px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/5"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={closeChat}
            >
              Close
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex flex-1 overflow-hidden p-3">
          <div
            className={`absolute inset-y-3 left-3 z-20 w-[320px] rounded-xl border border-[var(--border)] bg-[#0f1728] shadow-[0_18px_40px_rgba(0,0,0,0.3)] transition-transform duration-200 ${directoryOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"}`}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-[var(--border)] px-3 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDirectoryMode("threads")}
                    className={directoryMode === "threads" ? "rounded-[10px] border border-[#cdb66d]/40 bg-[#1a2030] px-3 py-2 text-sm text-white shadow-[inset_0_-2px_0_#d8c36f]" : "rounded-[10px] border border-[#2c3951] px-3 py-2 text-sm text-slate-300 transition hover:border-[#4a5a78] hover:text-white"}
                  >
                    Chats
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectoryMode("friends")}
                    className={directoryMode === "friends" ? "rounded-[10px] border border-[#cdb66d]/40 bg-[#1a2030] px-3 py-2 text-sm text-white shadow-[inset_0_-2px_0_#d8c36f]" : "rounded-[10px] border border-[#2c3951] px-3 py-2 text-sm text-slate-300 transition hover:border-[#4a5a78] hover:text-white"}
                  >
                    Friends
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectoryMode("group")}
                    className={directoryMode === "group" ? "rounded-[10px] border border-[#cdb66d]/40 bg-[#1a2030] px-3 py-2 text-sm text-white shadow-[inset_0_-2px_0_#d8c36f]" : "rounded-[10px] border border-[#2c3951] px-3 py-2 text-sm text-slate-300 transition hover:border-[#4a5a78] hover:text-white"}
                  >
                    New Group
                  </button>
                </div>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={directoryMode === "threads" ? "Search chats..." : "Search friends..."}
                  className="mt-3 w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-[var(--accent)]/50"
                />
              </div>

              {directoryMode === "threads" ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex flex-wrap gap-2 px-3 py-3">
                    {(["ALL", "DIRECT", "GROUP"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setThreadFilter(value)}
                        className={threadFilter === value ? "rounded-full border border-[#d6b24a66] bg-[#241c0f] px-3 py-1 text-xs text-[#f5d777]" : "rounded-full border border-[#304058] px-3 py-1 text-xs text-slate-300 transition hover:border-[#4a5a78] hover:text-white"}
                      >
                        {value === "ALL" ? "All" : value === "DIRECT" ? "Direct" : "Groups"}
                      </button>
                    ))}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                    <div className="space-y-2">
                      {filteredThreads.map((thread) => {
                        const label = threadTitle(thread);
                        const chip = threadChip(thread.kind);
                        return (
                          <button
                            key={thread.id}
                            type="button"
                            className={`w-full rounded-[14px] border px-3 py-3 text-left transition ${activeThreadId === thread.id ? "border-[#d6b24a66] bg-[#1b2435]" : "border-[#273449] bg-[#111a2a] hover:border-[#3b4f6c] hover:bg-[#162033]"}`}
                            onClick={() => openThreadFromList(thread)}
                          >
                            <div className="flex items-center gap-2">
                              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-strong)]">{label}</p>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${chip.className}`}>{chip.label}</span>
                            </div>
                            <p className="mt-1 truncate text-xs text-slate-400">{thread.subtitle}</p>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <p className="min-w-0 flex-1 truncate text-xs text-slate-300">{thread.lastMessageBody?.trim() || "No messages yet"}</p>
                              <span className="text-[10px] text-slate-400">{formatThreadTime(thread.lastMessageAt)}</span>
                            </div>
                          </button>
                        );
                      })}
                      {!directoryLoading && filteredThreads.length === 0 ? <p className="px-2 py-6 text-sm text-slate-400">No chats match that search.</p> : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {directoryMode === "friends" ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                  <div className="space-y-2">
                    {filteredFriends.map((friend) => (
                      <button
                        key={friend.id}
                        type="button"
                        className="flex w-full items-center gap-3 rounded-[14px] border border-[#273449] bg-[#111a2a] px-3 py-3 text-left transition hover:border-[#3b4f6c] hover:bg-[#162033]"
                        onClick={() => void startDirectChat(friend)}
                      >
                        {friend.profile?.avatarUrl ? (
                          <Image
                            src={friend.profile.avatarUrl}
                            alt={displayNameForUser(friend)}
                            width={44}
                            height={44}
                            sizes="44px"
                            className="h-11 w-11 rounded-full border border-[#304058] object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#304058] bg-[#23324a] text-sm font-semibold text-white">
                            {displayNameForUser(friend).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{displayNameForUser(friend)}</p>
                          <p className="truncate text-xs text-slate-400">@{friend.username}</p>
                        </div>
                        <span className="text-xs text-slate-300">Open</span>
                      </button>
                    ))}
                    {!directoryLoading && filteredFriends.length === 0 ? <p className="px-2 py-6 text-sm text-slate-400">No friends match that search.</p> : null}
                  </div>
                </div>
              ) : null}

              {directoryMode === "group" ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                  <div className="space-y-3">
                    <input
                      value={groupTitle}
                      onChange={(event) => setGroupTitle(event.target.value)}
                      placeholder="Group title"
                      className="w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-[var(--accent)]/50"
                    />
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{selectedFriendIds.length} selected</p>
                    <div className="space-y-2">
                      {filteredFriends.map((friend) => {
                        const selected = selectedFriendIds.includes(friend.id);
                        return (
                          <button
                            key={friend.id}
                            type="button"
                            className={`flex w-full items-center gap-3 rounded-[14px] border px-3 py-3 text-left transition ${selected ? "border-[#d6b24a66] bg-[#241c0f]" : "border-[#273449] bg-[#111a2a] hover:border-[#3b4f6c] hover:bg-[#162033]"}`}
                            onClick={() => {
                              setSelectedFriendIds((current) =>
                                current.includes(friend.id) ? current.filter((value) => value !== friend.id) : [...current, friend.id],
                              );
                            }}
                          >
                            {friend.profile?.avatarUrl ? (
                              <Image
                                src={friend.profile.avatarUrl}
                                alt={displayNameForUser(friend)}
                                width={40}
                                height={40}
                                sizes="40px"
                                className="h-10 w-10 rounded-full border border-[#304058] object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#304058] bg-[#23324a] text-sm font-semibold text-white">
                                {displayNameForUser(friend).charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{displayNameForUser(friend)}</p>
                              <p className="truncate text-xs text-slate-400">@{friend.username}</p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${selected ? "bg-amber-400/15 text-amber-200" : "bg-white/5 text-slate-400"}`}>
                              {selected ? "Added" : "Add"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="w-full rounded-[12px] border border-[#6a5420] bg-[#c49a35] px-3 py-2 text-sm font-semibold text-[#1a1204] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)]"
                      onClick={() => void startGroupChat()}
                    >
                      Create group chat
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="border-t border-[var(--border)] px-3 py-2">
                {directoryLoading ? <p className="text-xs text-slate-400">Loading…</p> : null}
                {status ? <p className="text-xs text-slate-300">{status}</p> : null}
              </div>
            </div>
          </div>

          {directoryOpen ? <button type="button" className="absolute inset-0 z-10 bg-transparent" onClick={() => setDirectoryOpen(false)} /> : null}

          <div className="relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[#0e1728]">
            <ThreadClient threadId={activeThreadId} myUserId={myUserId} embedded onClose={closeChat} />
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
          }}
        />
      </div>
    </div>
  );
}
