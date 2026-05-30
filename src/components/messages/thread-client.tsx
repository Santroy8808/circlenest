"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Msg = {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    fullName?: string | null;
    profile?: { avatarUrl?: string | null; displayName?: string | null } | null;
  };
};

const EMOJIS = ["??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??"] as const;

export function ThreadClient({ threadId, myUserId }: { threadId: string; myUserId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/messages/threads/${threadId}/messages`, { cache: "no-store" });
    if (res.ok) setMessages((await res.json()) as Msg[]);
  }, [threadId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      void load();
    }, 6000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="max-h-[60vh] space-y-3 overflow-y-auto rounded border border-[var(--border)] bg-[#0d1626] p-3">
        {messages.map((m) => (
          <article key={m.id} className="space-y-1">
            <div className={`flex items-center gap-2 ${m.senderId === myUserId ? "justify-end" : "justify-start"}`}>
              {m.senderId !== myUserId ? (
                <Link href={`/profile/${m.sender.username}`} className="relative h-7 w-7 overflow-hidden rounded-full border border-[var(--border)]">
                  {m.sender.profile?.avatarUrl ? (
                    <Image src={m.sender.profile.avatarUrl} alt={m.sender.username} fill className="object-cover" />
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

              {m.senderId === myUserId ? (
                <details className="relative">
                  <summary className="cursor-pointer list-none text-xs text-slate-300">?</summary>
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
                  </div>
                </details>
              ) : (
                <Link href={`/profile/${m.sender.username}`} className="relative h-7 w-7 overflow-hidden rounded-full border border-[var(--border)]">
                  {m.sender.profile?.avatarUrl ? (
                    <Image src={m.sender.profile.avatarUrl} alt={m.sender.username} fill className="object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-[#1a2538] text-[11px] text-slate-200">
                      {m.sender.username.charAt(0).toUpperCase()}
                    </span>
                  )}
                </Link>
              )}
            </div>

            <div
              className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                m.senderId === myUserId
                  ? "ml-auto border border-[#d6b24a66] bg-[#2a2110] text-[#f5d777]"
                  : "mr-auto border border-[#94a3b866] bg-[#131c2c] text-[#d1d5db]"
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
          </article>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await fetch(`/api/messages/threads/${threadId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: text }),
          });
          setText("");
          await load();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 rounded border px-3 py-2" placeholder="Type a message" />
        <button className="rounded border border-[var(--border)] bg-[#8f7228] px-3 py-2 text-black" type="submit">Send</button>
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
    </div>
  );
}
