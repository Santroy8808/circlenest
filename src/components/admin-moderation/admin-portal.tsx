import Link from "next/link";
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
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Portal</p>
        <h1 className="mt-3 text-3xl font-semibold">Guided platform operations</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Every action starts as a card and opens a wizard. Real-money balances are intentionally outside direct admin mutation.
        </p>
      </section>

      <section className="admin-action-grid">
        {portal.actions.map((action) => (
          <Link className="module-card rounded-md p-5" href={`/admin/actions/${action.key}`} key={action.key}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-semibold text-[var(--gold)]">{action.title}</h2>
              <span className="pill rounded-full px-3 py-1 text-xs">
                {action.key === "reports-queue" && portal.openFeedbackTicketCount > 0 ? `${portal.openFeedbackTicketCount} open` : action.risk}
              </span>
            </div>
            <p className="mt-3 leading-6 text-[var(--muted)]">{action.description}</p>
          </Link>
        ))}
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
