"use client";

import { useEffect, useState } from "react";

export function StreamRulesSettings() {
  const [allow, setAllow] = useState(true);
  const [approval, setApproval] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings/stream-rules", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as {
        allowFriendFamilyStreamPosts: boolean;
        requireApprovalForFriendFamilyStreamPosts: boolean;
      };
      setAllow(Boolean(body.allowFriendFamilyStreamPosts));
      setApproval(Boolean(body.requireApprovalForFriendFamilyStreamPosts));
    })();
  }, []);

  async function save() {
    setStatus("Saving...");
    const res = await fetch("/api/settings/stream-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allowFriendFamilyStreamPosts: allow,
        requireApprovalForFriendFamilyStreamPosts: approval,
      }),
    });
    setStatus(res.ok ? "Saved." : "Could not save.");
  }

  return (
    <section id="rules" className="mt-3 rounded border border-[var(--border)] p-3">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">My Rules: Stream Posting</h2>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
        Allow friends/family to post directly on my stream
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} />
        Require my approval before friend/family stream posts go live
      </label>
      <button type="button" onClick={() => void save()} className="mt-2 rounded border px-3 py-1.5 text-sm">Save Rules</button>
      {status ? <p className="mt-1 text-xs text-slate-400">{status}</p> : null}
    </section>
  );
}

