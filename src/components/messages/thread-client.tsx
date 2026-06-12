"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Msg = {
  id: string;
  clientMessageId?: string | null;
  body: string;
  senderId: string;
  readAt?: string | null;
  createdAt: string;
  editedAt?: string | null;
  hiddenBySenderAt?: string | null;
  localStatus?: "sending" | "failed";
  sender: {
    id: string;
    username: string;
    fullName?: string | null;
    profile?: { avatarUrl?: string | null; displayName?: string | null } | null;
  };
};

type PresenceRow = {
  userId: string;
  isTyping: boolean;
  lastTypedAt?: string | null;
  lastSeenAt?: string | null;
  updatedAt: string;
};

type ThreadMeta = {
  id: string;
  kind: "DIRECT" | "GROUP";
  title?: string | null;
  participants: Array<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  }>;
  other?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  } | null;
};

const EMOJIS = ["😀", "😂", "😍", "❤️", "👍", "🙏", "🔥", "🎉", "🤝", "💡"] as const;
const AUTO_SCROLL_THRESHOLD_PX = 140;
const POLL_INTERVAL_MS = 6000;

function formatClock(value: string | Date | number) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatFullTimestamp(value: string | Date | number) {
  return new Date(value).toLocaleString();
}

export function ThreadClient({
  threadId,
  myUserId,
  embedded = false,
  onClose,
}: {
  threadId: string;
  myUserId: string;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const sendCounter = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const typingOffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const initialLoadDoneRef = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [meta, setMeta] = useState<ThreadMeta | null>(null);
  const [presence, setPresence] = useState<PresenceRow[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  const queueScrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    pendingScrollBehaviorRef.current = behavior;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (!pendingScrollBehaviorRef.current) return;
    const behavior = pendingScrollBehaviorRef.current;
    pendingScrollBehaviorRef.current = null;
    requestAnimationFrame(() => scrollToBottom(behavior));
  }, [messages, scrollToBottom]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/messages/threads/${threadId}/messages`, { cache: "no-store" });
    if (!res.ok) return;
    const nextMessages = (await res.json()) as Msg[];
    setMessages(nextMessages);
    if (!initialLoadDoneRef.current || shouldAutoScrollRef.current) {
      queueScrollToBottom();
    }
    initialLoadDoneRef.current = true;
  }, [queueScrollToBottom, threadId]);

  const loadMeta = useCallback(async () => {
    const res = await fetch(`/api/messages/threads/${threadId}`, { cache: "no-store" });
    if (res.ok) setMeta((await res.json()) as ThreadMeta);
  }, [threadId]);

  const loadPresence = useCallback(async () => {
    const res = await fetch(`/api/messages/threads/${threadId}/presence`, { cache: "no-store" });
    if (res.ok) setPresence((await res.json()) as PresenceRow[]);
  }, [threadId]);

  async function readApiError(res: Response, fallback: string) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    return payload?.error?.trim() || fallback;
  }

  async function sendMessageToThread(body: string, clientMessageId: string) {
    const res = await fetch(`/api/messages/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, clientMessageId }),
    });
    if (!res.ok) {
      return {
        ok: false as const,
        error: await readApiError(res, "Message failed to send. Please retry."),
      };
    }
    const message = (await res.json().catch(() => null)) as Partial<Msg> | null;
    return { ok: true as const, message };
  }

  async function updateTyping(typing: boolean) {
    await fetch(`/api/messages/threads/${threadId}/presence`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typing }),
    }).catch(() => null);
  }

  function insertFormat(prefix: string, suffix = "") {
    const area = editorRef.current;
    if (!area) {
      setText((value) => `${value}${prefix}${suffix}`);
      return;
    }
    const start = area.selectionStart ?? area.value.length;
    const end = area.selectionEnd ?? area.value.length;
    const selected = area.value.slice(start, end);
    const next = `${area.value.slice(0, start)}${prefix}${selected}${suffix}${area.value.slice(end)}`;
    setText(next);
    requestAnimationFrame(() => {
      area.focus();
      const caret = start + prefix.length + selected.length + suffix.length;
      area.setSelectionRange(caret, caret);
    });
  }

  const otherPresence = useMemo(() => presence.find((row) => row.userId !== myUserId) ?? null, [myUserId, presence]);
  const isGroupThread = meta?.kind === "GROUP";
  const threadLabel = isGroupThread ? meta?.title ?? "Group chat" : meta?.other?.displayName ?? "Direct Message";
  const threadSubtitle = isGroupThread
    ? `${meta?.participants?.length ?? 0} participants`
    : meta?.other
      ? `@${meta.other.username}`
      : "Inbox chat";
  const otherTyping = Boolean(
    otherPresence?.isTyping &&
      otherPresence.lastTypedAt &&
      Date.now() - new Date(otherPresence.lastTypedAt).getTime() < 15_000,
  );
  const otherSeenAtMs = useMemo(() => {
    if (!otherPresence?.lastSeenAt) return null;
    const parsed = Date.parse(otherPresence.lastSeenAt);
    return Number.isNaN(parsed) ? null : parsed;
  }, [otherPresence]);
  const otherActive = useMemo(() => {
    const marker = otherPresence?.lastSeenAt ?? otherPresence?.updatedAt ?? null;
    if (!marker) return false;
    const parsed = Date.parse(marker);
    if (Number.isNaN(parsed)) return false;
    return Date.now() - parsed < 90_000;
  }, [otherPresence]);

  const orderedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const aTime = Date.parse(a.createdAt);
      const bTime = Date.parse(b.createdAt);
      if (aTime !== bTime) return aTime - bTime;
      return a.id.localeCompare(b.id);
    });
  }, [messages]);

  const headerStatus = otherTyping ? "Typing..." : isGroupThread ? `${meta?.participants?.length ?? 0} participants` : otherActive ? "Active now" : "Inbox chat";

  const getOwnMessageStatus = useCallback(
    (message: Msg) => {
      if (message.localStatus === "sending") return "Sending...";
      if (message.localStatus === "failed") return "Failed to send";
      if (message.senderId !== myUserId) return null;
      if (otherSeenAtMs && Date.parse(message.createdAt) <= otherSeenAtMs) return `Read ${formatClock(otherSeenAtMs)}`;
      if (message.readAt) return `Read ${formatClock(message.readAt)}`;
      return `Sent ${formatClock(message.createdAt)}`;
    },
    [myUserId, otherSeenAtMs],
  );

  useEffect(() => {
    initialLoadDoneRef.current = false;
    shouldAutoScrollRef.current = true;
    setMessages([]);
    setPresence([]);
    setMeta(null);
    setStatus("");
    setEditingId(null);
    setEditingText("");
    setText("");
    void load();
    void loadMeta();
    void loadPresence();
    const id = setInterval(() => {
      void load();
      void loadPresence();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load, loadMeta, loadPresence, threadId]);

  useEffect(() => {
    return () => {
      if (typingOffTimer.current) clearTimeout(typingOffTimer.current);
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded border border-[var(--border)] bg-[#0e1728]/95 p-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          {!embedded ? (
            <Link href="/messages" className="rounded border border-[var(--border)] px-3 py-1 text-xs text-slate-200 transition hover:bg-white/5">
              ← Messages
            </Link>
          ) : null}
          {isGroupThread ? (
            <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[#1a2538] text-sm font-semibold text-slate-100">
              {threadLabel.slice(0, 1).toUpperCase()}
            </div>
          ) : (
            <Link href={meta?.other ? `/profile/${meta.other.username}` : "/messages"} className="relative h-11 w-11 overflow-hidden rounded-full border border-[var(--border)] bg-[#1a2538]">
              {meta?.other?.avatarUrl ? (
                <Image src={meta.other.avatarUrl} alt={meta.other.username} fill unoptimized className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-[#1a2538] text-sm font-semibold text-slate-100">
                  {(meta?.other?.displayName ?? "?").charAt(0).toUpperCase()}
                </span>
              )}
            </Link>
          )}
          <div className="min-w-0">
            {isGroupThread ? (
              <p className="block truncate text-sm font-semibold text-[var(--text-strong)]">{threadLabel}</p>
            ) : (
              <Link href={meta?.other ? `/profile/${meta.other.username}` : "/messages"} className="block truncate text-sm font-semibold text-[var(--text-strong)] hover:underline">
                {threadLabel}
              </Link>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>{threadSubtitle}</span>
              <span>•</span>
              <span>{headerStatus}</span>
              {otherTyping ? <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">Live</span> : null}
            </div>
          </div>
        </div>
        {meta && !isGroupThread ? (
          <details className="relative">
            <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded border border-[var(--border)] text-sm text-slate-200 transition hover:bg-white/5">
              ⋯
            </summary>
            <div className="absolute right-0 z-30 mt-2 min-w-40 rounded border border-[var(--border)] bg-[#111a2a] p-1 shadow-lg">
              <button
                type="button"
                className="block w-full rounded px-2 py-1.5 text-left text-xs text-red-200 transition hover:bg-red-500/10"
                onClick={async () => {
                  const other = meta.other;
                  if (!other) {
                    setStatus("Could not block user.");
                    return;
                  }
                  const res = await fetch("/api/blocks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: other.id }),
                  });
                  if (!res.ok) {
                    setStatus("Could not block user.");
                    return;
                  }
                  setStatus("User blocked. Thread closed.");
                  if (onClose) onClose();
                  else router.push("/messages");
                  router.refresh();
                }}
              >
                Block user
              </button>
            </div>
          </details>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col rounded border border-[var(--border)] bg-gradient-to-b from-[#0d1626] to-[#0b1422]">
        <div
          ref={listRef}
          onScroll={() => {
            const node = listRef.current;
            if (!node) return;
            const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
            shouldAutoScrollRef.current = distanceFromBottom < AUTO_SCROLL_THRESHOLD_PX;
          }}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
        >
          {orderedMessages.length > 0 ? (
            orderedMessages.map((message) => {
              const isMine = message.senderId === myUserId;
              const statusText = getOwnMessageStatus(message);
              const displayName = message.sender.profile?.displayName ?? message.sender.fullName ?? message.sender.username;
              const senderHref = `/profile/${message.sender.username}`;

              return (
                <article key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className={`flex max-w-[min(92%,42rem)] items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                    {!isMine ? (
                      <Link href={senderHref} className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[#1a2538]">
                        {message.sender.profile?.avatarUrl ? (
                          <Image src={message.sender.profile.avatarUrl} alt={message.sender.username} fill unoptimized className="object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-[#1a2538] text-[11px] font-semibold text-slate-200">
                            {message.sender.username.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </Link>
                    ) : null}

                    <div className={`min-w-0 ${isMine ? "items-end" : "items-start"}`}>
                      <div className={`mb-1 flex flex-wrap items-center gap-2 text-[11px] ${isMine ? "justify-end text-[#f5d777]" : "justify-start text-slate-300"}`}>
                        {isMine ? (
                          <span className="font-semibold text-[#f5d777]">You</span>
                        ) : (
                          <Link href={senderHref} className="font-semibold text-[var(--text-strong)] hover:underline">
                            @{displayName}
                          </Link>
                        )}
                        <span className="text-slate-500">{formatFullTimestamp(message.createdAt)}</span>
                        {message.editedAt ? <span className="text-slate-500">edited</span> : null}
                        {message.localStatus === "sending" ? <span className="text-slate-400">sending...</span> : null}
                        {message.localStatus === "failed" ? <span className="text-red-300">failed</span> : null}
                        {isMine ? (
                          <details className="relative">
                            <summary className="cursor-pointer list-none rounded px-2 py-0 text-sm leading-none text-slate-300 hover:bg-white/5">⋯</summary>
                            <div className="absolute right-0 z-20 mt-1 min-w-[120px] rounded border border-[var(--border)] bg-[#111a2a] p-1 text-xs shadow-lg">
                              <button
                                type="button"
                                className="block w-full rounded px-2 py-1 text-left hover:bg-[#1c2a42]"
                                onClick={() => {
                                  setEditingId(message.id);
                                  setEditingText(message.body);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="block w-full rounded px-2 py-1 text-left text-red-300 hover:bg-[#1c2a42]"
                                onClick={async () => {
                                  await fetch(`/api/messages/threads/${threadId}/messages/${message.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "HIDE" }),
                                  });
                                  await load();
                                }}
                              >
                                Hide
                              </button>
                              <button
                                type="button"
                                className="block w-full rounded px-2 py-1 text-left hover:bg-[#1c2a42]"
                                onClick={async () => {
                                  await fetch(`/api/messages/threads/${threadId}/messages/${message.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "REPORT", reason: "Reported by conversation participant." }),
                                  });
                                  setStatus("Message reported for moderator review.");
                                }}
                              >
                                Report
                              </button>
                            </div>
                          </details>
                        ) : null}
                      </div>

                      <div
                        className={`max-w-[82vw] whitespace-pre-wrap break-words rounded-[18px] border px-4 py-3 text-sm leading-6 shadow-[0_8px_20px_rgba(0,0,0,0.18)] md:max-w-[36rem] ${
                          isMine
                            ? "ml-auto rounded-br-sm border-[#d6b24a66] bg-[#241c0f] text-[#f5d777]"
                            : "mr-auto rounded-bl-sm border-[#94a3b866] bg-[#111a29] text-[#d1d5db]"
                        }`}
                      >
                        {editingId === message.id ? (
                          <div className="space-y-2">
                            <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} className="w-full rounded border px-2 py-1 text-sm text-slate-900" rows={3} />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="rounded border px-2 py-1 text-xs"
                                onClick={async () => {
                                  if (!editingText.trim()) return;
                                  await fetch(`/api/messages/threads/${threadId}/messages/${message.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "EDIT", text: editingText }),
                                  });
                                  setEditingId(null);
                                  setEditingText("");
                                  await load();
                                  await loadPresence();
                                }}
                              >
                                Save
                              </button>
                              <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => { setEditingId(null); setEditingText(""); }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          message.body
                        )}
                      </div>

                      <div className={`mt-1 flex items-center gap-2 text-[10px] ${isMine ? "justify-end text-amber-100/80" : "justify-start text-slate-500"}`}>
                        {statusText ? <span>{statusText}</span> : null}
                      </div>
                    </div>

                    {!isMine ? null : (
                      <div className="h-8 w-8 shrink-0 rounded-full border border-transparent bg-transparent" aria-hidden="true" />
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded border border-[var(--border)] bg-[#0d1626] px-3 py-2 text-xs text-slate-400">
              No messages yet. Send the first inbox message below.
            </div>
          )}
        </div>

        {otherTyping ? (
          <div className="border-t border-[var(--border)] px-4 py-2 text-xs text-slate-300">
            <span className="rounded-full bg-white/5 px-2 py-1 text-emerald-200">{meta?.other?.displayName ?? "This person"} is typing…</span>
          </div>
        ) : null}

        <form
          className="space-y-2 border-t border-[var(--border)] bg-[#0d1626] p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            const outgoing = text.trim();
            const clientMessageId = `${Date.now()}-${sendCounter.current}`;
            sendCounter.current += 1;
            const optimistic: Msg = {
              id: `local-${clientMessageId}`,
              clientMessageId,
              body: outgoing,
              senderId: myUserId,
              readAt: null,
              createdAt: new Date().toISOString(),
              localStatus: "sending",
              sender: {
                id: myUserId,
                username: "you",
                fullName: "You",
                profile: null,
              },
            };
            setMessages((previous) => [...previous, optimistic]);
            setText("");
            setSending(true);
            setStatus("");
            await updateTyping(false);
            queueScrollToBottom("smooth");

            const sendResult = await sendMessageToThread(outgoing, clientMessageId);
            setSending(false);
            if (!sendResult.ok) {
              setMessages((previous) =>
                previous.map((row) =>
                  row.clientMessageId === clientMessageId ? { ...row, localStatus: "failed" } : row,
                ),
              );
              setStatus(sendResult.error);
              return;
            }
            if (sendResult.message) {
              setMessages((previous) =>
                previous.map((row) =>
                  row.clientMessageId === clientMessageId
                    ? {
                        ...row,
                        ...sendResult.message,
                        localStatus: undefined,
                        sender: row.sender,
                      }
                    : row,
                ),
              );
            } else {
              setMessages((previous) =>
                previous.map((row) =>
                  row.clientMessageId === clientMessageId ? { ...row, localStatus: undefined } : row,
                ),
              );
            }
            setStatus("");
            void loadPresence();
          }}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <button type="button" className="rounded border border-transparent px-1 py-0.5 underline hover:bg-white/5" onClick={() => insertFormat("**", "**")}>
              B
            </button>
            <button type="button" className="rounded border border-transparent px-1 py-0.5 italic underline hover:bg-white/5" onClick={() => insertFormat("_", "_")}>
              I
            </button>
            <button type="button" className="rounded border border-transparent px-1 py-0.5 underline hover:bg-white/5" onClick={() => insertFormat("<u>", "</u>")}>
              U
            </button>
            <button type="button" className="rounded border border-transparent px-1 py-0.5 line-through underline-offset-2 hover:bg-white/5" onClick={() => insertFormat("~~", "~~")}>
              S
            </button>
          </div>
          <div className="flex gap-2 rounded-[16px] border border-[var(--border)] bg-[#11192a] p-[5px]">
            <textarea
              ref={editorRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                void updateTyping(true);
                if (typingOffTimer.current) clearTimeout(typingOffTimer.current);
                typingOffTimer.current = setTimeout(() => {
                  void updateTyping(false);
                }, 3000);
              }}
              onBlur={() => {
                if (typingOffTimer.current) clearTimeout(typingOffTimer.current);
                void updateTyping(false);
              }}
              className="min-h-[88px] flex-1 rounded-[12px] border border-[#41536d] bg-[#111a2a] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
              placeholder="Type a message"
              rows={4}
            />
            <button
              className="rounded-[12px] border border-[var(--border)] bg-[#c49a35] px-4 py-2 text-sm font-semibold text-[#1a1305] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
              type="submit"
              disabled={sending || !text.trim()}
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>

        <div className="flex flex-wrap gap-1 px-3 pb-3 pt-2">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-sm border border-transparent px-0.5 py-0 text-base leading-none transition hover:scale-110"
              onClick={() => setText((prev) => `${prev}${emoji}`)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {status ? <p className="text-xs text-slate-300">{status}</p> : null}
    </div>
  );
}
