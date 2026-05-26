"use client";

import { useCallback, useEffect, useState } from "react";

type Msg = { id: string; body: string; senderId: string; createdAt: string };
const EMOJIS = ["😀", "😂", "😍", "👍", "🔥", "🎉", "🙏", "💡", "❤️", "😎", "🤝", "🌟"] as const;

export function ThreadClient({ threadId, myUserId }: { threadId: string; myUserId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/messages/threads/${threadId}/messages`, { cache: "no-store" });
    if (res.ok) setMessages((await res.json()) as Msg[]);
  }, [threadId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded border border-slate-200 p-3">
        {messages.map((m) => (
          <div key={m.id} className={`rounded p-2 text-sm ${m.senderId === myUserId ? "bg-blue-50" : "bg-slate-50"}`}>
            {m.body}
          </div>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await fetch(`/api/messages/threads/${threadId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
          setText("");
          await load();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 rounded border border-slate-300 px-3 py-2" placeholder="Type a message" />
        <button className="rounded bg-blue-600 px-3 py-2 text-white" type="submit">Send</button>
      </form>
      <div className="flex flex-wrap gap-1">
        {EMOJIS.map((emoji) => (
          <button key={emoji} type="button" className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={() => setText((prev) => `${prev}${emoji}`)}>
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
