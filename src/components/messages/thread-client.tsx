"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
  other: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
};

const EMOJIS = ["😀", "😂", "😍", "❤️", "👍", "🙏", "🔥", "🎉", "🤝", "💡"] as const;

export function ThreadClient({ threadId, myUserId }: { threadId: string; myUserId: string }) {
  const router = useRouter();
  const sendCounter = useRef(0);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [meta, setMeta] = useState<ThreadMeta | null>(null);
  const [presence, setPresence] = useState<PresenceRow[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [status, setStatus] = useState("");
  const typingOffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/messages/threads/${threadId}/messages`, { cache: "no-store" });
    if (res.ok) setMessages((await res.json()) as Msg[]);
  }, [threadId]);

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
    return { ok: true as const };
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
  const otherTyping = Boolean(
    otherPresence?.isTyping &&
      otherPresence.lastTypedAt &&
      Date.now() - new Date(otherPresence.lastTypedAt).getTime() < 15_000,
  );

  const lastOwnMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].senderId === myUserId) return messages[index];
    }
    return null;
  }, [messages, myUserId]);

  useEffect(() => {
    void load();
    void loadMeta();
    void loadPresence();
    const id = setInterval(() => {
      void load();
      void loadPresence();
    }, 6000);
    return () => clearInterval(id);
  }, [load, loadMeta, loadPresence]);

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] bg-[#0e1728] p-2">
        <div className="flex items-center gap-2">
          <Link href={meta ? `/profile/${meta.other.username}` : "/messages"} className="relative h-9 w-9 overflow-hidden rounded-full border border-[var(--border)]">
            {meta?.other.avatarUrl ? (
              <Image src={meta.other.avatarUrl} alt={meta.other.username} fill unoptimized className="object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-[#1a2538] text-xs text-slate-100">
                {(meta?.other.displayName ?? "?").charAt(0).toUpperCase()}
              </span>
            )}
          </Link>
          <div>
            <Link href={meta ? `/profile/${meta.other.username}` : "/messages"} className="text-sm font-semibold text-[var(--text-strong)] hover:underline">
              {meta?.other.displayName ?? "Direct Message"}
            </Link>
            <p className="text-xs text-slate-400">
              {otherTyping ? "Typing..." : "Inbox chat"}
            </p>
          </div>
        </div>
        {meta ? (
          <button
            type="button"
            className="rounded border border-red-400 px-2 py-1 text-xs text-red-200"
            onClick={async () => {
              const res = await fetch("/api/blocks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: meta.other.id }),
              });
              if (!res.ok) {
                setStatus("Could not block user.");
                return;
              }
              setStatus("User blocked. Thread closed.");
              router.push("/messages");
              router.refresh();
            }}
          >
            Block user
          </button>
        ) : null}
      </header>

      {messages.length > 0 ? (
        <div className="max-h-[62vh] space-y-3 overflow-y-auto rounded border border-[var(--border)] bg-gradient-to-b from-[#0d1626] to-[#0b1422] p-3">
          {messages.map((m) => (
            <article key={m.id} className="space-y-1">
              <div className={`flex items-end gap-2 ${m.senderId === myUserId ? "justify-end" : "justify-start"}`}>
                {m.senderId !== myUserId ? (
                  <Link href={`/profile/${m.sender.username}`} className="relative h-7 w-7 overflow-hidden rounded-full border border-[var(--border)]">
                    {m.sender.profile?.avatarUrl ? (
                      <Image src={m.sender.profile.avatarUrl} alt={m.sender.username} fill unoptimized className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-[#1a2538] text-[11px] text-slate-200">
                        {m.sender.username.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </Link>
                ) : null}

                <Link href={`/profile/${m.sender.username}`} className={`text-xs underline ${m.senderId === myUserId ? "text-[#f5d777]" : "text-slate-300"}`}>
                  @{m.sender.username}
                </Link>

                <span className="text-[11px] text-slate-400">{new Date(m.createdAt).toLocaleString()}</span>
                {m.editedAt ? <span className="text-[10px] text-slate-500">(edited)</span> : null}
                {m.localStatus === "sending" ? <span className="text-[10px] text-slate-400">sending...</span> : null}
                {m.localStatus === "failed" ? <span className="text-[10px] text-red-300">failed</span> : null}

                {m.senderId === myUserId ? (
                  <details className="relative">
                    <summary className="cursor-pointer list-none text-xs text-slate-300">v</summary>
                    <div className="absolute right-0 z-20 mt-1 min-w-[90px] rounded border border-[var(--border)] bg-[#111a2a] p-1 text-xs shadow-lg">
                      <button
                        type="button"
                        className="block w-full rounded px-2 py-1 text-left hover:bg-[#1c2a42]"
                        onClick={() => {
                          setEditingId(m.id);
                          setEditingText(m.body);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded px-2 py-1 text-left text-red-300 hover:bg-[#1c2a42]"
                        onClick={async () => {
                          await fetch(`/api/messages/threads/${threadId}/messages/${m.id}`, {
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
                          await fetch(`/api/messages/threads/${threadId}/messages/${m.id}`, {
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
                ) : (
                  <Link href={`/profile/${m.sender.username}`} className="relative h-7 w-7 overflow-hidden rounded-full border border-[var(--border)]">
                    {m.sender.profile?.avatarUrl ? (
                      <Image src={m.sender.profile.avatarUrl} alt={m.sender.username} fill unoptimized className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-[#1a2538] text-[11px] text-slate-200">
                        {m.sender.username.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </Link>
                )}
              </div>

              <div
                className={`max-w-[82%] px-3 py-2 text-sm shadow-sm ${
                  m.senderId === myUserId
                    ? "ml-auto rounded-2xl rounded-br-sm border border-[#d6b24a66] bg-[#2a2110] text-[#f5d777]"
                    : "mr-auto rounded-2xl rounded-bl-sm border border-[#94a3b866] bg-[#131c2c] text-[#d1d5db]"
                }`}
              >
                {editingId === m.id ? (
                  <div className="space-y-2">
                    <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" rows={3} />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs"
                        onClick={async () => {
                          if (!editingText.trim()) return;
                          await fetch(`/api/messages/threads/${threadId}/messages/${m.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "EDIT", text: editingText }),
                          });
                          setEditingId(null);
                          setEditingText("");
                          await load();
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
                  m.body
                )}
              </div>
              {m.localStatus === "failed" ? (
                <div className="ml-auto w-fit">
                  <button
                    type="button"
                    className="rounded border border-red-400 px-2 py-1 text-[11px] text-red-200"
                    onClick={async () => {
                      const retryClientMessageId = m.clientMessageId?.trim() || `retry-${Date.now()}-${sendCounter.current++}`;
                      setMessages((previous) =>
                        previous.map((row) =>
                          row.id === m.id
                            ? { ...row, localStatus: "sending", clientMessageId: retryClientMessageId }
                            : row,
                        ),
                      );
                      const sendResult = await sendMessageToThread(m.body, retryClientMessageId);
                      if (!sendResult.ok) {
                        setMessages((previous) =>
                          previous.map((row) =>
                            row.id === m.id ? { ...row, localStatus: "failed" } : row,
                          ),
                        );
                        setStatus(sendResult.error);
                        return;
                      }
                      setStatus("");
                      await load();
                      await loadPresence();
                    }}
                  >
                    Retry send
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded border border-[var(--border)] bg-[#0d1626] px-3 py-2 text-xs text-slate-400">
          No messages yet. Send the first inbox message below.
        </div>
      )}

      {lastOwnMessage ? (
        <p className="text-xs text-slate-400">
          {lastOwnMessage.readAt ? `Read ${new Date(lastOwnMessage.readAt).toLocaleString()}` : "Sent"}
        </p>
      ) : null}

      <form
        className="space-y-2 rounded border border-[var(--border)] bg-[#0d1626] p-3"
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
          await updateTyping(false);

          const sendResult = await sendMessageToThread(outgoing, clientMessageId);
          if (!sendResult.ok) {
            setMessages((previous) =>
              previous.map((row) =>
                row.clientMessageId === clientMessageId ? { ...row, localStatus: "failed" } : row,
              ),
            );
            setStatus(sendResult.error);
            return;
          }
          setStatus("");
          await load();
          await loadPresence();
        }}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <button type="button" className="underline" onClick={() => insertFormat("**", "**")}>B</button>
          <button type="button" className="underline italic" onClick={() => insertFormat("_", "_")}>I</button>
          <button type="button" className="underline" onClick={() => insertFormat("<u>", "</u>")}>U</button>
          <button type="button" className="line-through underline-offset-2" onClick={() => insertFormat("~~", "~~")}>S</button>
        </div>
        <div className="flex gap-2">
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
            className="flex-1 rounded border px-3 py-2 text-sm"
            placeholder="Type a message"
            rows={4}
          />
          <button className="rounded border border-[var(--border)] bg-[#c49a35] px-4 py-2 text-sm font-semibold text-[#1a1305] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)]" type="submit">Send</button>
        </div>
      </form>

      <div className="flex flex-wrap gap-1">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="rounded-sm border border-transparent px-0.5 py-0 text-base leading-none hover:scale-110"
            onClick={() => setText((prev) => `${prev}${emoji}`)}
          >
            {emoji}
          </button>
        ))}
      </div>
      {status ? <p className="text-xs text-slate-300">{status}</p> : null}
    </div>
  );
}
