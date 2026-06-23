"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdminPortalView } from "@/modules/admin-moderation/types";

type AdminSearchEntry = {
  href: string;
  title: string;
  category: string;
  description: string;
  badge: string;
  keywords: string[];
};

const shortcutEntries: AdminSearchEntry[] = [
  {
    href: "/admin/actions/launch-access?tool=invite",
    title: "New User > Invite",
    category: "Membership",
    description: "Generate a free account invite code, email it, or attach it to an account.",
    badge: "invite",
    keywords: ["new user", "invite", "invite code", "free account", "signup", "registration", "email invite", "grant invite"]
  },
  {
    href: "/admin/actions/launch-access?tool=promo",
    title: "Launch Access > Promotional Grant",
    category: "Membership",
    description: "Temporarily upgrade Free users to Contributor or Professional access.",
    badge: "promo",
    keywords: ["promotional access", "temporary tier", "free upgrade", "contributor trial", "professional trial"]
  },
  {
    href: "/admin/actions/status-change",
    title: "Membership > Status Change",
    category: "Membership",
    description: "Permanently change an account's membership tier.",
    badge: "tier",
    keywords: ["membership", "tier", "status change", "account status", "free", "contributor", "professional", "auditor"]
  },
  {
    href: "/admin/actions/launch-access?tool=founder-pricing",
    title: "Launch Access > Founder Pricing",
    category: "Membership",
    description: "Review founder subscription pricing, caps, windows, and credit budgets.",
    badge: "pricing",
    keywords: ["founder pricing", "launch price", "subscription price", "contributor price", "professional price"]
  },
  {
    href: "/admin/actions/platform-pricing",
    title: "Ad Spend > Pricing Rules",
    category: "Ads",
    description: "Set global credit costs for listings, boosts, mail ads, and placements.",
    badge: "costs",
    keywords: ["ad spend", "ads", "pricing", "costs", "boost price", "listing price", "mail ad price"]
  },
  {
    href: "/admin/actions/platform-credits",
    title: "Ad Spend > Member Credits",
    category: "Ads",
    description: "Grant or remove platform-only credits with a ledger entry and audit trail.",
    badge: "credits",
    keywords: ["ad spend", "credits", "grant credits", "remove credits", "member balance", "platform credits"]
  },
  {
    href: "/admin/actions/launch-access?tool=ad-guardrails",
    title: "Ad Spend > Experience Guardrails",
    category: "Ads",
    description: "Review ad density, sponsored mail caps, sender cooldowns, and boost limits.",
    badge: "guardrails",
    keywords: ["ad spend", "ads", "spam", "guardrails", "density", "sponsored mail", "cooldown", "boost limit"]
  },
  {
    href: "/admin/actions/announcements",
    title: "Communications > Public Announcement",
    category: "Comms",
    description: "Send global, tier-specific, or targeted notices through approved channels.",
    badge: "notice",
    keywords: ["announcement", "broadcast", "global message", "popup", "mail", "chat notice"]
  },
  {
    href: "/admin/actions/reports-queue",
    title: "Support > Reports Queue",
    category: "Safety",
    description: "Review bug reports, abuse reports, content reports, and support tickets.",
    badge: "queue",
    keywords: ["report issue", "tickets", "support", "bug", "abuse", "feedback", "content report"]
  }
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesSearch(entry: AdminSearchEntry, query: string) {
  const terms = normalize(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = normalize([entry.title, entry.category, entry.description, entry.badge, ...entry.keywords].join(" "));
  return terms.every((term) => haystack.includes(term));
}

function LogList({ logs }: { logs: AdminPortalView["recentAuditLogs"] }) {
  return (
    <div className="mt-4 grid gap-2">
      {logs.length > 0 ? (
        logs.map((log) => (
          <article className="rounded-md border border-[var(--line)] bg-black/10 p-3" key={log.id}>
            <p className="font-semibold">{log.label}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{log.detail}</p>
          </article>
        ))
      ) : (
        <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No recent entries.</p>
      )}
    </div>
  );
}

export function AdminPortal({ portal }: { portal: AdminPortalView }) {
  const [query, setQuery] = useState("");
  const searchEntries = useMemo<AdminSearchEntry[]>(() => {
    const actionEntries = portal.actions.map((action) => ({
      href: `/admin/actions/${action.key}`,
      title: action.title,
      category: "Admin",
      description: action.description,
      badge: action.key === "reports-queue" && portal.openFeedbackTicketCount > 0 ? `${portal.openFeedbackTicketCount} open` : action.risk,
      keywords: [action.key, ...action.steps, ...(action.keywords ?? [])]
    }));

    const byHref = new Map<string, AdminSearchEntry>();

    [...shortcutEntries, ...actionEntries].forEach((entry) => {
      byHref.set(`${entry.href}:${entry.title}`, entry);
    });

    return [...byHref.values()];
  }, [portal.actions, portal.openFeedbackTicketCount]);
  const visibleEntries = useMemo(() => searchEntries.filter((entry) => matchesSearch(entry, query)), [query, searchEntries]);
  const showingSearch = query.trim().length > 0;

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Portal</p>
        <h1 className="mt-3 text-3xl font-semibold">Guided platform operations</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Every action starts as a card and opens a wizard. Real-money balances are intentionally outside direct admin mutation.
        </p>
        <label className="mt-5 grid gap-2">
          <span className="form-label">Search admin functions</span>
          <input
            aria-label="Search admin functions"
            className="form-field"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try: new user, invite, ad spend, credits, announcement, reports"
            type="search"
            value={query}
          />
        </label>
      </section>

      <section className="surface rounded-md p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{showingSearch ? "Search Results" : "Admin Functions"}</p>
            <h2 className="mt-2 text-2xl font-semibold">{showingSearch ? `${visibleEntries.length} matching function${visibleEntries.length === 1 ? "" : "s"}` : "Choose an action"}</h2>
          </div>
          {showingSearch ? (
            <button className="btn-secondary" onClick={() => setQuery("")} type="button">
              Clear search
            </button>
          ) : null}
        </div>
        <div className="admin-action-grid mt-5">
          {visibleEntries.length > 0 ? (
            visibleEntries.map((entry) => (
              <Link className="module-card rounded-md p-5" href={entry.href} key={`${entry.href}:${entry.title}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{entry.category}</p>
                    <h3 className="mt-2 text-xl font-semibold text-[var(--gold)]">{entry.title}</h3>
                  </div>
                  <span className="pill rounded-full px-3 py-1 text-xs">{entry.badge}</span>
                </div>
                <p className="mt-3 leading-6 text-[var(--muted)]">{entry.description}</p>
              </Link>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No admin functions match that search.</p>
          )}
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--gold)]">Platform Metrics</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Metadata only: login/session signals, route views, actions, and aggregate route movement. No mail, chat, or post content is read here.
            </p>
          </div>
          <div className="grid gap-2 text-right sm:grid-cols-3">
            <span className="pill rounded-full px-3 py-2 text-xs">{portal.activitySummary.activeUsers15m} active / 15m</span>
            <span className="pill rounded-full px-3 py-2 text-xs">{portal.activitySummary.pageViews24h} page views / 24h</span>
            <span className="pill rounded-full px-3 py-2 text-xs">{portal.activitySummary.actions24h} actions / 24h</span>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {portal.activitySummary.topRoutes24h.length > 0 ? (
            portal.activitySummary.topRoutes24h.map((route) => (
              <article className="rounded-md border border-[var(--line)] bg-black/10 p-3" key={route.route}>
                <p className="truncate font-semibold">{route.route}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{route.count} view(s)</p>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)] md:col-span-3">No route activity yet.</p>
          )}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Feature Flags</h2>
          <div className="mt-4 grid gap-2">
            {portal.featureFlags.length > 0 ? (
              portal.featureFlags.map((flag) => (
                <article className="rounded-md border border-[var(--line)] bg-black/10 p-3" key={flag.key}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{flag.key}</p>
                    <span className="pill rounded-full px-3 py-1 text-xs">{flag.enabled ? "on" : "off"}</span>
                  </div>
                  {flag.description ? <p className="mt-1 text-sm text-[var(--muted)]">{flag.description}</p> : null}
                </article>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No feature flags yet.</p>
            )}
          </div>
        </div>
        <div className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Recent Audit</h2>
          <LogList logs={portal.recentAuditLogs} />
        </div>
        <div className="surface rounded-md p-5 lg:col-span-2">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Recent Diagnostics</h2>
          <LogList logs={portal.recentDiagnostics} />
        </div>
      </section>
    </div>
  );
}
