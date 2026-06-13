"use client";

import { useState } from "react";

type Props = {
  storefrontSlug: string;
};

const inputClassName =
  "w-full rounded border border-[#52647f] bg-[#253145] px-3 py-2 text-sm text-[#f3f6fb] placeholder:text-slate-400 focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/25 disabled:cursor-not-allowed disabled:bg-[#1b2435]";

export function BusinessStorefrontPublicClient({ storefrontSlug }: Props) {
  const [visitorName, setVisitorName] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");
  const [visitorMessage, setVisitorMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submitInquiry() {
    setSending(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/storefront/${encodeURIComponent(storefrontSlug)}/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorName: visitorName.trim(),
          visitorEmail: visitorEmail.trim(),
          visitorMessage: visitorMessage.trim(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not send the inquiry.");
        return;
      }
      setVisitorName("");
      setVisitorEmail("");
      setVisitorMessage("");
      setStatus("Inquiry sent. The owner has been notified.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#4e5d7a] bg-[#11192a] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Public inquiry</p>
        <h2 className="mt-1 text-xl font-semibold text-[#f7e8bf]">Contact this storefront</h2>
        <p className="mt-1 text-sm text-slate-300">
          Non-members can reach out here without a Theta-Space account.
        </p>
      </div>

      <div className="space-y-3">
        <input
          value={visitorName}
          onChange={(event) => setVisitorName(event.target.value)}
          placeholder="Your name"
          className={inputClassName}
        />
        <input
          value={visitorEmail}
          onChange={(event) => setVisitorEmail(event.target.value)}
          placeholder="Your email"
          type="email"
          className={inputClassName}
        />
        <textarea
          value={visitorMessage}
          onChange={(event) => setVisitorMessage(event.target.value)}
          placeholder="Tell them what you need, want, or are asking about"
          className={`${inputClassName} min-h-36`}
        />
        <button
          type="button"
          disabled={sending || !visitorName.trim() || !visitorEmail.trim() || !visitorMessage.trim()}
          onClick={() => void submitInquiry()}
          className="rounded bg-[#8f7228] px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Sending..." : "Send inquiry"}
        </button>
        {status ? <p className="text-sm text-slate-300">{status}</p> : null}
      </div>
    </section>
  );
}
