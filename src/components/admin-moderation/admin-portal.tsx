"use client";

import { useMemo, useState } from "react";
import { AdminCategoryCard, AdminFunctionCard } from "@/components/admin-moderation/admin-workflow-cards";
import { buildWorkflowCategories, flattenWorkflowEntries, matchesWorkflowSearch } from "@/modules/admin-moderation/admin-workflows";
import type { AdminPortalView } from "@/modules/admin-moderation/types";

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
  const categories = useMemo(() => buildWorkflowCategories(portal.openFeedbackTicketCount), [portal.openFeedbackTicketCount]);
  const searchEntries = useMemo(() => flattenWorkflowEntries(categories), [categories]);
  const visibleEntries = useMemo(() => searchEntries.filter((entry) => matchesWorkflowSearch(entry, query)), [query, searchEntries]);
  const showingSearch = query.trim().length > 0;

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Portal</p>
        <h1 className="mt-3 text-3xl font-semibold">Guided platform operations</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Start with the operational subject, open its workflow page, then choose the specific function. Real-money balances are intentionally outside direct admin mutation.
        </p>
        <label className="mt-5 grid gap-2">
          <span className="form-label">Search admin functions</span>
          <input
            aria-label="Search admin functions"
            className="form-field"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try: account, create invite, reset password, membership, ad spend, reports"
            type="search"
            value={query}
          />
        </label>
      </section>

      {showingSearch ? (
        <section className="surface rounded-md p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Search Results</p>
              <h2 className="mt-2 text-2xl font-semibold">{visibleEntries.length} matching function{visibleEntries.length === 1 ? "" : "s"}</h2>
            </div>
            <button className="btn-secondary" onClick={() => setQuery("")} type="button">
              Clear search
            </button>
          </div>
          <div className="admin-function-grid mt-5">
            {visibleEntries.length > 0 ? (
              visibleEntries.map((entry) => <AdminFunctionCard entry={entry} key={`${entry.href}:${entry.title}`} />)
            ) : (
              <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No admin functions match that search.</p>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="surface rounded-md p-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Functions</p>
              <h2 className="mt-2 text-2xl font-semibold">Choose a subject</h2>
            </div>
            <div className="admin-category-grid mt-5">
              {categories.map((category) => (
                <AdminCategoryCard category={category} key={category.key} />
              ))}
            </div>
          </section>
        </>
      )}

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
