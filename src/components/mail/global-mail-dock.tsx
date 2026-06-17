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
  surface: "CHAT" | "MAIL" | string;
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
  return user.fullName ?? user.profile?.displayName ?? user.username;
}

function displayNameForSender(sender: MailMessage["sender"]) {
  return sender.fullName ?? sender.profile?.displayName ?? sender.username;
}

function formatTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 86_400_000) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff < 604_800_000) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString();
}

function extractPlainText(value: string) {
  const node = document.createElement("div");
  node.innerHTML = value;
  return node.textContent?.trim() ?? "";
}

function buildPreview(body: string) {
  const cleaned = body.replace(/^Subject:\s.*$/im, "").replace(/\n+/g, " ").trim();
  return cleaned || "No preview available";
}

function buildSubjectLabel(body: string) {
  const subjectLine = body.split("\n").find((line) => line.trim().toLowerCase().startsWith("subject:"));
  return subjectLine?.replace(/^subject:\s*/i, "").trim() || "No subject";
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
  const [size, setSize] = useState({ width: 1120, height: 760 });
  const [dragging, setDragging] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [friends, setFriends] = useState<FriendRef[]>([]);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [mailSearch, setMailSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [recipient, setRecipient] = useState<FriendRef | null>(null);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientMatches, setRecipientMatches] = useState<FriendRef[]>([]);
  const [recipientLookupStatus, setRecipientLookupStatus] = useState("");
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("");
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string }>>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);

  useEffect(() => {
    const updateMobile = () => setIsMobile(window.innerWidth < 760);
    updateMobile();
    window.addEventListener("resize", updateMobile);
    return () => window.removeEventListener("resize", updateMobile);
  }, []);

  useEffect(() => {
    const width = typeof window === "undefined" ? 1120 : Math.min(1120, Math.max(760, Math.floor(window.innerWidth * 0.88)));
    const height = typeof window === "undefined" ? 760 : Math.min(820, Math.max(520, Math.floor(window.innerHeight * 0.82)));
    const left = typeof window === "undefined" ? 24 : window.innerWidth < 1260 ? 16 : Math.max(24, window.innerWidth - width - 32);
    const top = typeof window === "undefined" ? 88 : window.innerHeight < 900 ? 16 : 84;
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

  const resetComposer = useCallback(() => {
    setSubject("");
    setStatus("");
    setRecipientLookupStatus("");
    setRecipientMatches([]);
    setAttachments((current) => {
      current.forEach((file) => URL.revokeObjectURL(file.url));
      return [];
    });
    if (editorRef.current) editorRef.current.innerHTML = "";
  }, []);

  const loadDirectory = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const [threadRes, contactRes] = await Promise.all([
        fetch("/api/messages/threads?surface=MAIL", { cache: "no-store" }),
        fetch("/api/messages/contacts", { cache: "no-store" }),
      ]);
      if (threadRes.ok) setThreads(((await threadRes.json()) as ThreadSummary[]).filter((thread) => thread.surface === "MAIL"));
      if (contactRes.ok) setFriends((await contactRes.json()) as FriendRef[]);
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const loadMessages = useCallback(async (threadId: string) => {
    if (!threadId) return;
    const res = await fetch(`/api/messages/threads/${threadId}/messages`, { cache: "no-store" });
    if (res.ok) setMessages((await res.json()) as MailMessage[]);
  }, []);

  const openMail = useCallback(() => {
    setOpen(true);
    setNavOpen(false);
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
          width: clamp(resizeRef.current.startWidth + (event.clientX - resizeRef.current.startX), 760, Math.max(520, window.innerWidth - currentPosition.x - 8)),
          height: clamp(resizeRef.current.startHeight + (event.clientY - resizeRef.current.startY), 520, Math.max(420, window.innerHeight - currentPosition.y - 8)),
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
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  const filteredThreads = useMemo(() => {
    const query = mailSearch.trim().toLowerCase();
    return threads.filter((thread) => {
      if (!query) return true;
      return `${thread.displayLabel} ${thread.subtitle} ${thread.lastMessageBody}`.toLowerCase().includes(query);
    });
  }, [mailSearch, threads]);

  const filteredFriends = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    return friends.filter((friend) => !query || `${friend.username} ${displayNameForUser(friend)}`.toLowerCase().includes(query));
  }, [contactSearch, friends]);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;

  const openCompose = useCallback(
    (friend?: FriendRef | null) => {
      setComposeOpen(true);
      setRecipient(friend ?? null);
      setRecipientQuery(friend ? `${displayNameForUser(friend)} (@${friend.username})` : "");
      setActiveThreadId("");
      setMessages([]);
      setStatus("");
      resetComposer();
      if (isMobile) setNavOpen(false);
    },
    [isMobile, resetComposer],
  );

  const selectThread = useCallback(
    async (thread: ThreadSummary) => {
      setComposeOpen(false);
      const otherParticipant = thread.kind === "DIRECT" ? thread.participants.find((participant) => participant.id !== myUserId) ?? null : null;
      const replyTarget = otherParticipant
        ? friends.find((friend) => friend.id === otherParticipant.id) ?? {
            id: otherParticipant.id,
            username: otherParticipant.username,
            fullName: otherParticipant.displayName,
            profile: { displayName: otherParticipant.displayName, avatarUrl: otherParticipant.avatarUrl },
          }
        : null;
      setRecipient(replyTarget);
      setRecipientQuery(replyTarget ? `${displayNameForUser(replyTarget)} (@${replyTarget.username})` : "");
      setStatus("");
      setActiveThreadId(thread.id);
      if (isMobile) setNavOpen(false);
    },
    [friends, isMobile, myUserId],
  );

  const startMailToContact = useCallback(
    async (friend: FriendRef) => {
      const existingThread = threads.find(
        (thread) => thread.kind === "DIRECT" && thread.participants.some((participant) => participant.id === friend.id),
      );
      if (existingThread) {
        await selectThread(existingThread);
        return;
      }
      openCompose(friend);
    },
    [openCompose, selectThread, threads],
  );

  const ensureMailThread = useCallback(
    async (target: FriendRef | string) => {
      const directTarget = typeof target === "string" ? { recipient: target.trim() } : { userId: target.id };
      const res = await fetch("/api/messages/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface: "MAIL", mode: "DIRECT", ...directTarget }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        throw new Error(body.error ?? "Could not open mail thread.");
      }
      return body.id;
    },
    [],
  );

  const sendMail = useCallback(async () => {
    const html = editorRef.current?.innerHTML ?? "";
    const text = extractPlainText(html);
    const attachmentNote = attachments.length ? `\n\nAttachments: ${attachments.map((file) => file.name).join(", ")}` : "";
    const finalBody = [subject.trim() ? `Subject: ${subject.trim()}` : "", text, attachmentNote].filter(Boolean).join("\n\n").trim();

    if (!finalBody) {
      setStatus("Write your message first.");
      return;
    }

    let threadId = activeThreadId;
    try {
      if (!threadId) {
        const typedRecipient = recipientQuery.trim();
        if (!recipient && !typedRecipient) {
          setStatus("Add a recipient.");
          return;
        }
        threadId = await ensureMailThread(recipient ?? typedRecipient);
      }

      setStatus("Sending...");
      const res = await fetch(`/api/messages/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: finalBody, clientMessageId: crypto.randomUUID() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus(body.error ?? "Could not send mail.");
        return;
      }

      resetComposer();
      setComposeOpen(false);
      setRecipient(null);
      setRecipientQuery("");
      setActiveThreadId(threadId);
      await Promise.all([loadDirectory(), loadMessages(threadId)]);
      setStatus("Mail sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send mail.");
    }
  }, [activeThreadId, attachments, ensureMailThread, loadDirectory, loadMessages, recipient, recipientQuery, resetComposer, subject]);

  useEffect(() => {
    if (!composeOpen) return;
    const query = recipientQuery.trim();
    if (recipient && (query === `${displayNameForUser(recipient)} (@${recipient.username})` || query === recipient.username || query === `@${recipient.username}`)) {
      setRecipientMatches([]);
      setRecipientLookupStatus("");
      return;
    }
    if (query.length < 2) {
      setRecipientMatches([]);
      setRecipientLookupStatus("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRecipientLookupStatus("Looking...");
      try {
        const res = await fetch(`/api/search/people?q=${encodeURIComponent(query.replace(/^@+/, ""))}`, { cache: "no-store", signal: controller.signal });
        if (!res.ok) {
          setRecipientLookupStatus("Lookup unavailable.");
          return;
        }
        const body = (await res.json()) as { people?: FriendRef[] };
        const rows = Array.isArray(body.people) ? body.people : [];
        setRecipientMatches(rows);
        setRecipientLookupStatus(rows.length ? "" : "No visible match. You can still send if this belongs to a member.");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRecipientLookupStatus("Lookup unavailable.");
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [composeOpen, recipient, recipientQuery]);

  useEffect(() => {
    function handleCompose(event: Event) {
      const detail = (event as CustomEvent<{ recipient?: string }>).detail;
      setOpen(true);
      setNavOpen(false);
      void loadDirectory();
      openCompose(null);
      if (detail?.recipient) setRecipientQuery(detail.recipient);
    }

    window.addEventListener("theta-mail-compose", handleCompose);
    return () => window.removeEventListener("theta-mail-compose", handleCompose);
  }, [loadDirectory, openCompose]);

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
        className="pointer-events-auto fixed flex flex-col overflow-hidden rounded-[16px] border border-[var(--border)] bg-[#0b1422] shadow-[0_24px_80px_rgba(0,0,0,0.55)] max-[759px]:inset-0 max-[759px]:h-[100dvh] max-[759px]:w-full max-[759px]:rounded-none"
        style={isMobile ? { left: 0, top: 0, width: "100%", height: "100dvh" } : { left: position.x, top: position.y, width: size.width, height: size.height }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[#111b2d] px-4 py-3 max-[759px]:cursor-default"
          style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}
          onPointerDown={(event) => {
            if (event.button !== 0 || window.innerWidth < 760) return;
            dragRef.current = { offsetX: event.clientX - position.x, offsetY: event.clientY - position.y };
            setDragging(true);
          }}
        >
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-[var(--text-strong)]">Mail</p>
            <p className="truncate text-xs text-slate-400">Inbox, drafts, contacts, and formal correspondence.</p>
          </div>
          <div className="flex items-center gap-2">
            {isMobile ? (
              <button
                type="button"
                className="rounded-[10px] border border-[#2c3951] px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5"
                onClick={() => setNavOpen((value) => !value)}
              >
                Menu
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-[10px] border border-[#6a5420] bg-[#c49a35] px-3 py-1.5 text-xs font-semibold text-[#1a1204]"
              onClick={() => openCompose()}
            >
              Compose
            </button>
            <button type="button" className="rounded-[10px] border border-[#2c3951] px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[260px_320px_minmax(0,1fr)] overflow-hidden max-[1080px]:grid-cols-[240px_minmax(0,1fr)] max-[759px]:grid-cols-1">
          <aside
            className={`min-h-0 border-r border-[var(--border)] bg-[#0f1728] p-3 ${isMobile ? (navOpen ? "block" : "hidden") : "block"} max-[759px]:absolute max-[759px]:inset-y-0 max-[759px]:left-0 max-[759px]:z-10 max-[759px]:w-[82vw] max-[759px]:max-w-[320px] max-[759px]:shadow-[18px_0_50px_rgba(0,0,0,0.45)]`}
          >
            <div className="space-y-3">
              <button
                type="button"
                className="w-full rounded-[12px] border border-[#6a5420] bg-[#c49a35] px-3 py-2 text-sm font-semibold text-[#1a1204]"
                onClick={() => openCompose()}
              >
                New mail
              </button>

              <section className="rounded-[14px] border border-[#243146] bg-[#101a2c] p-2">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">Folders</p>
                <div className="mt-2 grid gap-1">
                  <button
                    type="button"
                    className={`rounded-[10px] px-3 py-2 text-left text-sm ${!composeOpen ? "border border-[#cdb66d]/40 bg-[#1a2030] text-white shadow-[inset_0_-2px_0_#d8c36f]" : "border border-transparent text-slate-300 hover:border-[#304058] hover:bg-[#111a2a]"}`}
                    onClick={() => {
                      setComposeOpen(false);
                      setRecipient(null);
                      setStatus("");
                      if (isMobile) setNavOpen(false);
                    }}
                  >
                    Inbox
                  </button>
                  <button
                    type="button"
                    className={`rounded-[10px] px-3 py-2 text-left text-sm ${composeOpen ? "border border-[#cdb66d]/40 bg-[#1a2030] text-white shadow-[inset_0_-2px_0_#d8c36f]" : "border border-transparent text-slate-300 hover:border-[#304058] hover:bg-[#111a2a]"}`}
                    onClick={() => openCompose(recipient)}
                  >
                    Draft
                  </button>
                </div>
              </section>

              <section className="rounded-[14px] border border-[#243146] bg-[#101a2c] p-2">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">Contacts</p>
                <input
                  value={contactSearch}
                  onChange={(event) => setContactSearch(event.target.value)}
                  placeholder="Search contacts"
                  className="mt-2 w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400"
                />
                <div className="mt-2 max-h-[42dvh] space-y-1 overflow-y-auto pr-1">
                  {filteredFriends.map((friend) => (
                    <button key={friend.id} type="button" className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left hover:bg-[#162033]" onClick={() => void startMailToContact(friend)}>
                      {friend.profile?.avatarUrl ? (
                        <Image src={friend.profile.avatarUrl} alt={displayNameForUser(friend)} width={34} height={34} sizes="34px" className="h-[34px] w-[34px] rounded-full object-cover" />
                      ) : (
                        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#24334d] text-xs font-semibold text-white">{displayNameForUser(friend).charAt(0).toUpperCase()}</span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-slate-100">{displayNameForUser(friend)}</span>
                        <span className="block truncate text-[11px] text-slate-400">@{friend.username}</span>
                      </span>
                    </button>
                  ))}
                  {filteredFriends.length === 0 ? <p className="px-2 py-4 text-sm text-slate-400">No contacts found.</p> : null}
                </div>
              </section>
            </div>
          </aside>

          {isMobile && navOpen ? <div className="absolute inset-0 z-[5] bg-black/40" onClick={() => setNavOpen(false)} /> : null}

          <section className="min-h-0 border-r border-[var(--border)] bg-[#0d1626] p-3 max-[1080px]:border-r-0">
            <div className="flex items-center justify-between gap-3">
              <input
                value={mailSearch}
                onChange={(event) => setMailSearch(event.target.value)}
                placeholder="Search mail"
                className="w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400"
              />
              <button type="button" className="rounded-[10px] border border-[#304058] px-3 py-2 text-xs text-slate-200 hover:bg-white/5" onClick={() => void loadDirectory()}>
                Refresh
              </button>
            </div>
            <div className="mt-3 max-h-full space-y-2 overflow-y-auto pb-4">
              {filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`w-full rounded-[14px] border px-3 py-3 text-left transition ${activeThreadId === thread.id && !composeOpen ? "border-[#d6b24a66] bg-[#1b2435]" : "border-[#273449] bg-[#111a2a] hover:border-[#3b4f6c]"}`}
                  onClick={() => void selectThread(thread)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{thread.displayLabel}</p>
                    <span className="shrink-0 text-[10px] text-slate-400">{formatTime(thread.lastMessageAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">{buildSubjectLabel(thread.lastMessageBody)}</p>
                  <p className="mt-1 truncate text-sm text-slate-300">{buildPreview(thread.lastMessageBody)}</p>
                  {thread.unread > 0 ? <span className="mt-2 inline-flex rounded-full bg-[#376ef8] px-2 py-0.5 text-xs font-semibold text-white">{thread.unread}</span> : null}
                </button>
              ))}
              {loadingThreads ? <p className="px-2 py-8 text-sm text-slate-400">Loading mail...</p> : null}
              {!loadingThreads && filteredThreads.length === 0 ? <p className="px-2 py-8 text-sm text-slate-400">No mail yet.</p> : null}
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-[#0b1422]">
            {composeOpen ? (
              <>
                <div className="border-b border-[var(--border)] px-4 py-3">
                  <p className="truncate text-sm font-semibold text-[var(--text-strong)]">Compose mail</p>
                  <p className="truncate text-xs text-slate-400">{recipient ? `To ${displayNameForUser(recipient)}` : recipientQuery.trim() ? `To ${recipientQuery.trim()}` : "Type a handle, full name, or member email."}</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <div className="mx-auto max-w-[820px] space-y-3">
                    <div className="rounded-[14px] border border-[#273449] bg-[#101a2c] p-3">
                      <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">To</label>
                      <input
                        value={recipientQuery}
                        onChange={(event) => {
                          setRecipient(null);
                          setRecipientQuery(event.target.value);
                        }}
                        placeholder="@handle, full name, or member email"
                        className="mt-2 w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400"
                      />
                      {recipient ? (
                        <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-[#d6b24a66] bg-[#1a2030] px-3 py-2">
                          {recipient.profile?.avatarUrl ? (
                            <Image src={recipient.profile.avatarUrl} alt={displayNameForUser(recipient)} width={32} height={32} sizes="32px" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#24334d] text-xs font-semibold text-white">{displayNameForUser(recipient).charAt(0).toUpperCase()}</span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-100">{displayNameForUser(recipient)}</span>
                            <span className="block truncate text-[11px] text-slate-400">@{recipient.username}</span>
                          </span>
                        </div>
                      ) : null}
                      {recipientMatches.length ? (
                        <div className="mt-2 grid gap-2">
                          {recipientMatches.slice(0, 5).map((person) => (
                            <button
                              key={person.id}
                              type="button"
                              className="flex items-center gap-2 rounded-[10px] border border-[#304058] bg-[#111a2a] px-3 py-2 text-left hover:border-[#d6b24a66]"
                              onClick={() => {
                                setRecipient(person);
                                setRecipientQuery(`${displayNameForUser(person)} (@${person.username})`);
                                setRecipientMatches([]);
                                setRecipientLookupStatus("");
                              }}
                            >
                              {person.profile?.avatarUrl ? (
                                <Image src={person.profile.avatarUrl} alt={displayNameForUser(person)} width={34} height={34} sizes="34px" className="h-[34px] w-[34px] rounded-full object-cover" />
                              ) : (
                                <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#24334d] text-xs font-semibold text-white">{displayNameForUser(person).charAt(0).toUpperCase()}</span>
                              )}
                              <span className="min-w-0">
                                <span className="block truncate text-sm text-slate-100">{displayNameForUser(person)}</span>
                                <span className="block truncate text-[11px] text-slate-400">@{person.username}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {recipientLookupStatus ? <p className="mt-2 text-xs text-slate-400">{recipientLookupStatus}</p> : null}
                    </div>

                    <input
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      placeholder="Subject"
                      className="w-full rounded-[12px] border border-[#304058] bg-[#182232] px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-400"
                    />

                    <div className="rounded-[14px] border border-[#273449] bg-[#101a2c] p-3">
                      <div className="mb-3 flex flex-wrap gap-2">
                        <button type="button" title="Bold" className="rounded-[8px] border border-[#304058] px-2 py-1 text-sm font-bold text-slate-200" onClick={() => applyFormat("bold")}>B</button>
                        <button type="button" title="Italic" className="rounded-[8px] border border-[#304058] px-2 py-1 text-sm italic text-slate-200" onClick={() => applyFormat("italic")}>I</button>
                        <button type="button" title="Underline" className="rounded-[8px] border border-[#304058] px-2 py-1 text-sm underline text-slate-200" onClick={() => applyFormat("underline")}>U</button>
                        <button type="button" title="List" className="rounded-[8px] border border-[#304058] px-2 py-1 text-sm text-slate-200" onClick={() => applyFormat("insertUnorderedList")}>List</button>
                        <button type="button" title="Link" className="rounded-[8px] border border-[#304058] px-2 py-1 text-sm text-slate-200" onClick={() => applyFormat("createLink")}>Link</button>
                        <button type="button" title="Attach picture" className="rounded-[8px] border border-[#304058] px-2 py-1 text-sm text-slate-200" onClick={() => fileRef.current?.click()}>Picture</button>
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
                        className="min-h-[280px] rounded-[12px] border border-[#304058] bg-[#182232] px-4 py-3 text-sm leading-7 text-slate-100 outline-none empty:before:text-slate-500 empty:before:content-['Write_your_message...']"
                      />

                      {attachments.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
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
                    </div>
                  </div>
                </div>
              </>
            ) : activeThread ? (
              <>
                <div className="border-b border-[var(--border)] px-4 py-3">
                  <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{activeThread.displayLabel}</p>
                  <p className="truncate text-xs text-slate-400">{activeThread.subtitle}</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <div className="mx-auto max-w-[820px] space-y-4">
                    {messages.map((message) => (
                      <article key={message.id} className="rounded-[14px] border border-[#273449] bg-[#101a2c] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            {message.sender.profile?.avatarUrl ? (
                              <Image src={message.sender.profile.avatarUrl} alt={displayNameForSender(message.sender)} width={36} height={36} sizes="36px" className="h-9 w-9 rounded-full object-cover" />
                            ) : (
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#24334d] text-xs font-semibold text-white">{displayNameForSender(message.sender).charAt(0).toUpperCase()}</span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{displayNameForSender(message.sender)}</p>
                              <p className="truncate text-xs text-slate-400">@{message.sender.username}</p>
                            </div>
                          </div>
                          <span className="shrink-0 text-[11px] text-slate-500">{formatTime(message.createdAt)}</span>
                        </div>
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-100">{message.body}</div>
                      </article>
                    ))}
                    {messages.length === 0 ? <p className="rounded-[14px] border border-dashed border-[#304058] px-4 py-8 text-sm text-slate-400">No mail in this conversation yet.</p> : null}
                  </div>
                </div>
                <div className="border-t border-[var(--border)] bg-[#0f1728] px-4 py-3">
                  <div className="mx-auto max-w-[820px]">
                    <button type="button" className="rounded-[10px] border border-[#6a5420] bg-[#c49a35] px-4 py-2 text-sm font-semibold text-[#1a1204]" onClick={() => openCompose(recipient ?? null)}>
                      Reply
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
                <div className="max-w-md space-y-3">
                  <h2 className="text-xl font-semibold text-[var(--text-strong)]">Your mailbox</h2>
                  <p className="text-sm leading-6 text-slate-400">Select a message on the left, or start a new mail draft from your contacts list.</p>
                </div>
              </div>
            )}

            <div className="border-t border-[var(--border)] bg-[#0f1728] px-4 py-3">
              <div className="mx-auto flex max-w-[820px] items-center justify-between gap-3">
                <p className="min-w-0 truncate text-xs text-slate-400">{status}</p>
                {composeOpen ? (
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-[10px] border border-[#304058] px-4 py-2 text-sm text-slate-200 hover:bg-white/5" onClick={() => openCompose(null)}>
                      Clear
                    </button>
                    <button type="button" className="rounded-[10px] border border-[#6a5420] bg-[#c49a35] px-4 py-2 text-sm font-semibold text-[#1a1204]" onClick={() => void sendMail()}>
                      Send mail
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <button
          type="button"
          aria-label="Resize mail window"
          className="absolute bottom-1 right-1 h-5 w-5 cursor-se-resize rounded-sm border border-[var(--border)] bg-[#152238] text-[0px] opacity-70 transition hover:opacity-100 max-[759px]:hidden"
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
