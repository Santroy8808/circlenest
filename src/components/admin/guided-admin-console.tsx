"use client";

import Link from "next/link";
import { useState } from "react";

type AdminConsoleSection = {
  key: string;
  title: string;
  description: string;
  allowed: string[];
  forbidden: string[];
  href?: string;
  stats: Array<{ label: string; value: string | number }>;
};

type AdminConsoleUser = {
  id: string;
  email: string;
  username: string;
  role: string;
  subscriptionTier: string;
  deactivatedAt: string | null;
  businessStatus: string | null;
  ledgerCents: number;
};

type GuidedAdminConsoleProps = {
  sections: AdminConsoleSection[];
  users: AdminConsoleUser[];
};

const FIELD_CLASS =
  "w-full rounded-lg border border-[#52647f] bg-[#253145] px-3 py-2 font-sans text-sm leading-5 text-[#f3f6fb] shadow-inner shadow-black/10 placeholder:text-slate-400 focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/25";

function formatMoney(amountCents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountCents / 100);
}

export function GuidedAdminConsole({ sections, users }: GuidedAdminConsoleProps) {
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  async function runAccountAction(action: string) {
    if (!selectedUserId) return;
    setMessage("");
    const response = await fetch(`/api/admin/accounts/${selectedUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(response.ok ? `${action.replaceAll("_", " ")} completed and audit logged.` : payload.error ?? "Action failed.");
  }

  return (
    <div className="space-y-5">
      <section className="rounded border border-amber-300/30 bg-amber-300/10 p-4">
        <h2 className="text-lg font-semibold text-amber-100">Admin safety boundaries</h2>
        <p className="mt-1 text-sm text-amber-100/90">
          This console is intentionally guided. Admins can review, suspend, hold, approve, and audit, but cannot delete preserved records, view secrets, or add real money.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        {sections.map((section) => (
          <article key={section.key} className="rounded border border-[var(--border)] bg-[#101a2c] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)]/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-strong)]">{section.title}</h2>
                <p className="mt-1 text-sm text-slate-400">{section.description}</p>
              </div>
              {section.href ? (
                <Link href={section.href} className="rounded-full border border-[#52647f] px-3 py-1 text-xs font-semibold text-slate-100 hover:border-[#f0d878]">
                  Open workflow
                </Link>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {section.stats.map((stat) => (
                <div key={stat.label} className="rounded border border-[#304058] bg-[#0d1626] p-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#f0d878]">{stat.label}</p>
                  <p className="text-lg font-semibold text-slate-100">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Can do</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-300">
                  {section.allowed.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-200">Cannot do</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-300">
                  {section.forbidden.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded border border-[var(--border)] bg-[#101a2c] p-4">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Guided account workflow</h2>
        <p className="mt-1 text-sm text-slate-400">Step 1: choose account. Step 2: enter reason. Step 3: run one protected action.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Account</span>
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className={FIELD_CLASS}>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username} - {user.email}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Reason / verification note</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} className={FIELD_CLASS} placeholder="Verified by support case, report review, etc." />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" onClick={() => void runAccountAction("REVOKE_SESSIONS")} className="rounded-full border border-[#52647f] px-3 py-2 text-sm text-slate-100">
              Revoke sessions
            </button>
            <button type="button" onClick={() => void runAccountAction("RESET_2FA")} className="rounded-full border border-[#52647f] px-3 py-2 text-sm text-slate-100">
              Reset 2FA
            </button>
            <button type="button" onClick={() => void runAccountAction(selectedUser?.deactivatedAt ? "RESTORE" : "SUSPEND")} className="rounded-full bg-[#3668ff] px-3 py-2 text-sm font-semibold text-white">
              {selectedUser?.deactivatedAt ? "Restore" : "Suspend"}
            </button>
          </div>
        </div>
        {selectedUser ? (
          <div className="mt-3 rounded border border-[#304058] bg-[#0d1626] p-3 text-sm text-slate-300">
            <p>
              {selectedUser.role} / {selectedUser.subscriptionTier} / {selectedUser.deactivatedAt ? "Suspended" : "Active"} / Ledger {formatMoney(selectedUser.ledgerCents)}
            </p>
            <p className="text-xs text-slate-500">Business: {selectedUser.businessStatus ?? "No company profile"}</p>
          </div>
        ) : null}
        {message ? <p className="mt-3 text-sm text-slate-300">{message}</p> : null}
      </section>
    </div>
  );
}
