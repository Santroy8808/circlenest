"use client";

import { useEffect } from "react";

export function MailPageClient() {
  useEffect(() => {
    window.dispatchEvent(new Event("theta-chat-close"));
    window.dispatchEvent(new Event("theta-mail-open"));
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Mail</h1>
          <p className="text-sm text-slate-400">Inbox, sent mail, contacts, and formal messages.</p>
        </div>
        <button
          type="button"
          className="rounded-[10px] border border-[#6a5420] bg-[#c49a35] px-4 py-2 text-sm font-semibold text-[#1a1204]"
          onClick={() => window.dispatchEvent(new Event("theta-mail-open"))}
        >
          Open Mail
        </button>
      </div>
      <div className="rounded-[12px] border border-dashed border-[#304058] px-4 py-8 text-sm text-slate-300">
        Mail opens in a floating window on desktop and fills the screen on mobile.
      </div>
    </section>
  );
}
