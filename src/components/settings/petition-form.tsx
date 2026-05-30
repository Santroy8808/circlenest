"use client";

import { useState } from "react";

export function PetitionForm() {
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState("");

  async function submit() {
    const s = subject.trim();
    const d = details.trim();
    if (!s || !d) return;
    setStatus("Submitting...");
    const res = await fetch("/api/petitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: s, details: d }),
    });
    if (!res.ok) {
      setStatus("Could not submit petition.");
      return;
    }
    setSubject("");
    setDetails("");
    setStatus("Petition sent to administrators.");
  }

  return (
    <section className="mt-3 rounded border border-[var(--border)] p-3">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">Petition an Administrator</h2>
      <p className="mt-1 text-xs text-slate-400">Use this for account issues, moderation requests, or disputes.</p>
      <div className="mt-2 grid gap-2">
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="rounded border px-3 py-2 text-sm" />
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} placeholder="What is going on?" className="rounded border px-3 py-2 text-sm" />
        <button type="button" onClick={() => void submit()} className="w-fit rounded border px-3 py-1.5 text-sm">Send Petition</button>
        {status ? <p className="text-xs text-slate-400">{status}</p> : null}
      </div>
    </section>
  );
}

