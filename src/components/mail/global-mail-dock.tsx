"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
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

type MailMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    fullName: string | null;
    profile?: { displayName: string | null; avatarUrl: string | null } | null;
  };
};

const STORAGE_GEOMETRY_KEY = "theta.activeMailGeometry";
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function displayNameForUser(user: FriendRef) {
  return user.profile?.displayName ?? user.fullName ?? user.username;
}

function displayNameForSender(sender: MailMessage["sender"]) {
  return sender.profile?.displayName ?? sender.fullName ?? sender.username;
}

function threadTitle(thread: ThreadSummary) {
  return thread.kind === "GROUP" ? thread.title ?? thread.displayLabel : thread.displayLabel;
}

function formatTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 86_400_000) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff < 604_800_000) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString();
}

function stripHtml(value: string) {
  const node = document.createElement("div");
  node.innerHTML = value;
  return node.textContent?.trim() ?? "";
}

export function GlobalMailDock({ myUserId }: { myUserId: string }) {
  const pathname = usePathname();
  const windowRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const positionRef = useRef({ x: 24, y: 88 });
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [position, setPosition] = useState({ x: 24, y: 88 });
  const [size, setSize] = useState({ width: 980, height: 700 });
  const [dragging, setDragging] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [folder, setFolder] = useState<"INBOX" | "SENT" | "ARCHIVE">("INBOX");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [friends, setFriends] = useState<FriendRef[]>([]);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [search, setSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("");
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string }>>([]);

  useEffect(() => {
    const updateMobile = () => setIsMobile(window.innerWidth < 700);
    updateMobile();
    window.addEventListener("resize", updateMobile);
    return () => window.removeEventListener("resize", updateMobile);
  }, []);

  useEffect(() => {
    const width = typeof window === "undefined" ? 980 : Math.min(980, Math.max(360, Math.floor(window.innerWidth * 0.86)));
    const height = typeof window === "undefined" ? 700 : Math.min(740, Math.max(420, Math.floor(window.innerHeight * 0.78)));
    const left = typeof window === "undefined" ? 24 : window.innerWidth < 900 ? 8 : Math.max(24, window.innerWidth - width - 32);
    const top = typeof window === "undefined" ? 88 : window.innerHeight < 760 ? 8 : 84;
    try {
      const geometry = window.localStorage.getItem(STORAGE_GEOMETRY_KEY);
      if (geometry) {
        const parsed = JSON.parse(geometry) as { width?: number; height?: number; x?: number; y?: number } | null;
        if (parsed) {
          const nextSize = {
            width: typeof parsed.width === "number" ? parsed.width : width,
            height: typeof parsed.height === "number" ? parsed.height : height,
          };
          const nextPosition = {
            x: typeof parsed.x === "number" ? parsed.x : left,
            y: typeof parsed.y === "number" ? parsed.y : top,
          };
          setSize(nextSize);
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

  const loadDirectory = useCallback(async () => {
    const [threadRes, contactRes] = await Promise.all([
      fetch("/api/messages/threads", { cache: "no-store" }),
      fetch("/api/messages/contacts", { cache: "no-store" }),
    ]);
    if (threadRes.ok) setThreads((await threadRes.json()) as ThreadSummary[]);
    if (contactRes.ok) setFriends((await contactRes.json()) as FriendRef[]);
  }, []);

  const loadMessages = useCallback(async (threadId: string) => {
    if (!threadId) return;
    const res = await fetch(`/api/messages/threads/${threadId}/messages`, { cache: "no-store" });
    if (res.ok) setMessages((await res.json()) as MailMessage[]);
  }, []);

  const openMail = useCallback(() => {
    setOpen(true);
    setStatus("");
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    function handleOpen() {
      openMail();
    }
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
        setSize({
          width: clamp(resizeRef.current.startWidth + (event.clientX - resizeRef.current.startX), 440, Math.max(320, window.innerWidth - currentPosition.x - 8)),
          height: clamp(resizeRef.current.startHeight + (event.clientY - resizeRef.current.startY), 360, Math.max(320, window.innerHeight - currentPosition.y - 8)),
        });
      }
    }
    function handleUp() {
      dragRef.current = null;
      resizeRef.current = null;
      setDragging(false);
    }
    window.addEventListener("theta-mail-open", handleOpen);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("theta-mail-open", handleOpen);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [openMail]);

  useEffect(() => {
    if (pathname === "/mail") openMail();
  }, [openMail, pathname]);

  useEffect(() => {
    if (!open) return;
    try {
      window.localStorage.setItem(STORAGE_GEOMETRY_KEY, JSON.stringify({ x: position.x, y: position.y, width: size.width, height: size.height }));
    } catch {}
  }, [open, position.x, position.y, size.height, size.width]);

  useEffect(() => {
    if (!activeThreadId) return;
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  const filteredThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return threads.filter((thread) => {
      if (folder === "SENT") {
        const last = thread.lastMessageBody.toLowerCase();
        if (!last) return false;
      }
      if (!query) return true;
      return `${threadTitle(thread)} ${thread.subtitle} ${thread.lastMessageBody}`.toLowerCase().includes(query);
    });
  }, [folder, search, threads]);

  const filteredFriends = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    return friends.filter((friend) => !query || `${friend.username} ${displayNameForUser(friend)}`.toLowerCase().includes(query));
  }, [contactSearch, friends]);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const selectedContact = activeThread?.participants.find((participant) => participant.id !== myUserId) ?? null;

  const startMailToContact = useCallback(async (friend: FriendRef) => {
    setStatus("");
    setSubject((current) => current || `Message to ${displayNameForUser(friend)}`);
    const res = await fetch("/api/messages/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "DIRECT", userId: friend.id }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !body.id) {
      setStatus(body.error ?? "Could not open mail thread.");
      return;
    }
    await loadDirectory();
    setActiveThreadId(body.id);
    setStatus(`Ready to mail ${displayNameForUser(friend)}.`);
    if (window.innerWidth < 900) setDrawerOpen(false);
  }, [loadDirectory]);

  const sendMail = useCallback(async () => {
    if (!activeThreadId) {
      setStatus("Choose a thread or contact first.");
      return;
    }
    const html = editorRef.current?.innerHTML ?? "";
    const text = stripHtml(html);
    const attachmentNote = attachments.length ? `\n\nAttachments: ${attachments.map((file) => file.name).join(", ")}` : "";
    const finalBody = [subject.trim() ? `Subject: ${subject.trim()}` : "", text, attachmentNote].filter(Boolean).join("\n\n").trim();
    if (!finalBody) {
      setStatus("Write a message first.");
      return;
    }
    setStatus("Sending...");
    const res = await fetch(`/api/messages/threads/${activeThreadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: finalBody, clientMessageId: crypto.randomUUID() }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus(body.error ?? "Could not send mail.");
      return;
    }
    if (editorRef.current) editorRef.current.innerHTML = "";
    setSubject("");
    setAttachments((current) => {
      current.forEach((file) => URL.revokeObjectURL(file.url));
      return [];
    });
    setStatus("Sent.");
    await Promise.all([loadDirectory(), loadMessages(activeThreadId)]);
  }, [activeThreadId, attachments, loadDirectory, loadMessages, subject]);

  const applyFormat = useCallback((command: "bold" | "italic" | "underline" | "insertUnorderedList" | "createLink") => {
    if (command === "createLink") {
      const url = window.prompt("Link URL");
      if (!url) return;
      document.execCommand(command, false, url);
      return;
    }
    document.execCommand(command);
    editorRef.current?.focus();
  }, []);

  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[125]">
      <div
        ref={windowRef}
        className="pointer-events-auto fixed flex flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[#0b1422] shadow-[0_24px_80px_rgba(0,0,0,0.5)] max-[699px]:inset-0 max-[699px]:h-[100dvh] max-[699px]:w-full max-[699px]:rounded-none"
        style={isMobile ? { left: 0, top: 0, width: "100%", height: "100dvh" } : { left: position.x, top: position.y, width: size.width, height: size.height, minWidth: 440, minHeight: 360 }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[#111b2d] px-4 py-3 max-[699px]:cursor-default"
          style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}
          onPointerDown={(event) => {
            if (event.button !== 0 || window.innerWidth < 700) return;
            dragRef.current = { offsetX: event.clientX - position.x, offsetY: event.clientY - position.y };
            setDragging(true);
          }}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text-strong)]">Mail</p>
            <p className="truncate text-xs text-slate-400">Inbox, contacts, and formal messages</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-[10px] border border-[#2c3951] px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setDrawerOpen((value) => !value)}
            >
              Contacts
            </button>
            <button
              type="button"
              className="rounded-[10px] border border-[#2c3951] px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(220px,0.9fr)_minmax(260px,1.2fr)] overflow-hidden max-[900px]:grid-cols-[240px_minmax(220px,1fr)] max-[699px]:grid-cols-1">
          {drawerOpen ? (
            <aside className="min-h-0 border-r border-[var(--border)] bg-[#0f1728] p-3 max-[699px]:max-h-[42dvh] max-[699px]:border-b max-[699px]:border-r-0">
              <div className="space-y-3">
                <button type="button" className="w-full rounded-[10px] border border-[#6a5420] bg-[#c49a35] px-3 py-2 text-sm font-semibold text-[#1a1204]" onClick={() => editorRef.current?.focus()}>
                  Compose
                </button>
                <div className="grid gap-1">
                  {(["INBOX", "SENT", "ARCHIVE"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={folder === value ? "rounded-[10px] border border-[#cdb66d]/40 bg-[#1a2030] px-3 py-2 text-left text-sm text-white shadow-[inset_0_-2px_0_#d8c36f]" : "rounded-[10px] border border-transparent px-3 py-2 text-left text-sm text-slate-300 hover:border-[#304058] hover:bg-[#111a2a]"}
                      onClick={() => setFolder(value)}
                    >
                      {value === "INBOX" ? "Inbox" : value === "SENT" ? "Sent" : "Archive"}
                    </button>
                  ))}
                </div>
                <div className="rounded-[12px] border border-[#243146] bg-[#101a2c] p-2">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">Contacts</p>
                  <input
                    value={contactSearch}
                    onChange={(event) => setContactSearch(event.target.value)}
                    placeholder="Search contacts"
                    className="mt-2 w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400"
                  />
                  <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
                    {filteredFriends.map((friend) => (
                      <button key={friend.id} type="button" className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left hover:bg-[#162033]" onClick={() => void startMailToContact(friend)}>
                        {friend.profile?.avatarUrl ? (
                          <Image src={friend.profile.avatarUrl} alt={displayNameForUser(friend)} width={32} height={32} unoptimized className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#24334d] text-xs font-semibold text-white">{displayNameForUser(friend).charAt(0).toUpperCase()}</span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-slate-100">{displayNameForUser(friend)}</span>
                          <span className="block truncate text-[11px] text-slate-400">@{friend.username}</span>
                        </span>
                      </button>
                    ))}
                    {filteredFriends.length === 0 ? <p className="px-2 py-4 text-sm text-slate-400">No contacts found.</p> : null}
                  </div>
                </div>
              </div>
            </aside>
          ) : null}

          <section className="min-h-0 border-r border-[var(--border)] bg-[#0d1626] p-3 max-[900px]:border-r-0 max-[699px]:hidden">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search mail"
              className="w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400"
            />
            <div className="mt-3 max-h-full space-y-2 overflow-y-auto pb-4">
              {filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`w-full rounded-[12px] border px-3 py-3 text-left transition ${activeThreadId === thread.id ? "border-[#d6b24a66] bg-[#1b2435]" : "border-[#273449] bg-[#111a2a] hover:border-[#3b4f6c]"}`}
                  onClick={() => setActiveThreadId(thread.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{threadTitle(thread)}</p>
                    <span className="shrink-0 text-[10px] text-slate-400">{formatTime(thread.lastMessageAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">{thread.subtitle}</p>
                  <p className="mt-1 truncate text-sm text-slate-300">{thread.lastMessageBody || "No mail yet"}</p>
                  {thread.unread > 0 ? <span className="mt-2 inline-flex rounded-full bg-[#376ef8] px-2 py-0.5 text-xs font-semibold text-white">{thread.unread} unread</span> : null}
                </button>
              ))}
              {filteredThreads.length === 0 ? <p className="px-2 py-8 text-sm text-slate-400">No mail in this view.</p> : null}
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-[#0b1422]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{activeThread ? threadTitle(activeThread) : "Select a thread or contact"}</p>
              <p className="truncate text-xs text-slate-400">{activeThread?.subtitle ?? "Pick a recipient from Contacts, then write your mail."}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-3">
                {!activeThread ? (
                  <div className="rounded-[14px] border border-[#273449] bg-[#101a2c] p-3">
                    <p className="text-sm font-semibold text-[#f0d878]">Who is this mail to?</p>
                    <p className="mt-1 text-xs text-slate-400">Search or pick a contact. This opens a formal mail thread before you send.</p>
                    <input
                      value={contactSearch}
                      onChange={(event) => setContactSearch(event.target.value)}
                      placeholder="Search contacts by name or username"
                      className="mt-3 w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400"
                    />
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {filteredFriends.slice(0, 8).map((friend) => (
                        <button
                          key={friend.id}
                          type="button"
                          className="flex items-center gap-2 rounded-[12px] border border-[#273449] bg-[#111a2a] px-3 py-2 text-left transition hover:border-[#d6b24a66] hover:bg-[#162033]"
                          onClick={() => void startMailToContact(friend)}
                        >
                          {friend.profile?.avatarUrl ? (
                            <Image src={friend.profile.avatarUrl} alt={displayNameForUser(friend)} width={34} height={34} unoptimized className="h-9 w-9 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#24334d] text-xs font-semibold text-white">{displayNameForUser(friend).charAt(0).toUpperCase()}</span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-slate-100">{displayNameForUser(friend)}</span>
                            <span className="block truncate text-[11px] text-slate-400">@{friend.username}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    {filteredFriends.length === 0 ? <p className="mt-3 text-sm text-slate-400">No contacts found.</p> : null}
                  </div>
                ) : null}
                {messages.map((message) => {
                  const mine = message.sender.id === myUserId;
                  return (
                    <article key={message.id} className={`rounded-[12px] border border-[#273449] bg-[#101a2c] p-3 ${mine ? "ml-auto max-w-[86%]" : "mr-auto max-w-[86%]"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-xs font-semibold text-[#f0d878]">{displayNameForSender(message.sender)}</p>
                        <span className="shrink-0 text-[10px] text-slate-500">{formatTime(message.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100">{message.body}</p>
                    </article>
                  );
                })}
                {activeThread && messages.length === 0 ? <p className="rounded-[12px] border border-dashed border-[#304058] px-3 py-6 text-sm text-slate-400">No mail in this thread yet.</p> : null}
              </div>
            </div>
            <div className="border-t border-[var(--border)] bg-[#0f1728] p-3">
              <div className="mb-2 flex items-center justify-between gap-3 rounded-[10px] border border-[#273449] bg-[#101a2c] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">To</p>
                  <p className="truncate text-sm text-slate-100">{selectedContact ? `${selectedContact.displayName} (@${selectedContact.username})` : "Choose a contact first"}</p>
                </div>
                <button type="button" className="shrink-0 rounded-[10px] border border-[#2c3951] px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5" onClick={() => setDrawerOpen(true)}>
                  Pick contact
                </button>
              </div>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject"
                className="mb-2 w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400"
              />
              <div className="mb-2 flex flex-wrap gap-2">
                <button type="button" title="Bold" className="rounded border border-[#304058] px-2 py-1 text-sm font-bold text-slate-200" onClick={() => applyFormat("bold")}>B</button>
                <button type="button" title="Italic" className="rounded border border-[#304058] px-2 py-1 text-sm italic text-slate-200" onClick={() => applyFormat("italic")}>I</button>
                <button type="button" title="Underline" className="rounded border border-[#304058] px-2 py-1 text-sm underline text-slate-200" onClick={() => applyFormat("underline")}>U</button>
                <button type="button" title="List" className="rounded border border-[#304058] px-2 py-1 text-sm text-slate-200" onClick={() => applyFormat("insertUnorderedList")}>List</button>
                <button type="button" title="Link" className="rounded border border-[#304058] px-2 py-1 text-sm text-slate-200" onClick={() => applyFormat("createLink")}>Link</button>
                <button type="button" title="Add pictures" className="rounded border border-[#304058] px-2 py-1 text-sm text-slate-200" onClick={() => fileRef.current?.click()}>Picture</button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    setAttachments((current) => [
                      ...current,
                      ...files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
                    ]);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              <div
                ref={editorRef}
                contentEditable
                role="textbox"
                aria-label="Mail body"
                className="min-h-24 rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm leading-6 text-slate-100 outline-none empty:before:text-slate-500 empty:before:content-['Write_mail...']"
              />
              {attachments.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {attachments.map((file) => (
                    <button
                      key={file.url}
                      type="button"
                      className="rounded-full border border-[#304058] px-3 py-1 text-xs text-slate-300"
                      onClick={() => {
                        URL.revokeObjectURL(file.url);
                        setAttachments((current) => current.filter((item) => item.url !== file.url));
                      }}
                    >
                      {file.name} x
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-xs text-slate-400">{status}</p>
                <button type="button" className="rounded-[10px] border border-[#6a5420] bg-[#c49a35] px-4 py-2 text-sm font-semibold text-[#1a1204]" onClick={() => void sendMail()}>
                  Send
                </button>
              </div>
            </div>
          </section>
        </div>

        <button
          type="button"
          aria-label="Resize mail window"
          className="absolute bottom-1 right-1 h-5 w-5 cursor-se-resize rounded-sm border border-[var(--border)] bg-[#152238] text-[0px] opacity-70 transition hover:opacity-100 max-[699px]:hidden"
          style={{ touchAction: "none" }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            resizeRef.current = { startX: event.clientX, startY: event.clientY, startWidth: size.width, startHeight: size.height };
          }}
        />
      </div>
    </div>
  );
}
