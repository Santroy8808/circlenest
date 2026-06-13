"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FriendStreamPostComposer({ username }: { username: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("");

  async function submit() {
    const text = content.trim();
    if (!text) return;
    setStatus("Posting...");
    const res = await fetch(`/api/profile/${encodeURIComponent(username)}/stream-posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string; pending?: boolean } | null;
    if (!res.ok) {
      setStatus(body?.error ?? "Could not post.");
      return;
    }
    setContent("");
    setStatus(body?.pending ? "Posted for approval." : "Posted to stream.");
    router.refresh();
  }

  return (
    <section className="card p-3">
      <p className="mb-2 text-sm font-semibold text-[var(--text-strong)]">Post On This Stream</p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        placeholder="Share something respectful..."
        className="w-full rounded border px-3 py-2 text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => void submit()} className="rounded border px-3 py-1.5 text-sm">Post</button>
        {status ? <span className="text-xs text-slate-400">{status}</span> : null}
      </div>
    </section>
  );
}

