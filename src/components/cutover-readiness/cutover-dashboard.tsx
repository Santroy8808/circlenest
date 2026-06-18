import Link from "next/link";
import type { CutoverDashboardView, CutoverGateStatus } from "@/modules/cutover-readiness/types";

const statusLabels: Record<CutoverGateStatus, string> = {
  automated: "Automated",
  manual: "Manual",
  required: "Required"
};

export function CutoverDashboard({ dashboard }: { dashboard: CutoverDashboardView }) {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Operations</p>
            <h1 className="mt-3 text-3xl font-semibold">Cutover readiness</h1>
            <p className="mt-3 leading-7 text-[var(--muted)]">
              A non-destructive command center for deciding when NewRepo is safe to promote into the production GitHub source.
            </p>
          </div>
          <Link href="/docs/cutover-readiness" className="btn-secondary">
            Read full checklist
          </Link>
          <Link href="/docs/release-candidate" className="btn-secondary">
            Release candidate
          </Link>
          <Link href="/docs/production-repo-snapshot" className="btn-secondary">
            Prod snapshot
          </Link>
          <Link href="/docs/cutover-runbook" className="btn-secondary">
            Cutover runbook
          </Link>
          <Link href="/docs/browser-smoke-checklist" className="btn-secondary">
            Browser smoke
          </Link>
          <Link href="/docs/promotion-dry-run" className="btn-secondary">
            Promotion dry-run
          </Link>
        </div>
      </section>

      <section className="cutover-grid">
        {dashboard.gates.map((gate) => (
          <article className="module-card rounded-md p-5" key={gate.title}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">{gate.title}</h2>
              <span className="pill rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
                {statusLabels[gate.status]}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{gate.detail}</p>
            {gate.command ? (
              <code className="mt-4 block rounded-md border border-[var(--line)] bg-black/26 p-3 text-xs text-[var(--gold)]">
                {gate.command}
              </code>
            ) : null}
          </article>
        ))}
      </section>

      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Smoke Matrix</p>
            <h2 className="mt-2 text-2xl font-semibold">Routes to visually verify</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[var(--muted)]">
            These routes are not enough by themselves, but they catch the most expensive cutover failures early.
          </p>
        </div>
        <div className="cutover-route-list mt-5">
          {dashboard.smokeRoutes.map((route) => (
            <article className="cutover-route-card" key={`${route.area}-${route.path}`}>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold)]">{route.area}</p>
                <h3 className="mt-1 font-semibold">{route.path}</h3>
              </div>
              <p className="text-sm leading-6 text-[var(--muted)]">{route.expected}</p>
              <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)]">
                {route.requiresLogin ? "Login required" : "Public/guarded"}
              </span>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="surface rounded-md p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Rollback</p>
          <h2 className="mt-2 text-2xl font-semibold">If production smoke fails</h2>
          <div className="mt-4 grid gap-3">
            {dashboard.rollbackSteps.map((step, index) => (
              <div className="rounded-md border border-[var(--line)] bg-black/20 p-3 text-sm leading-6" key={step}>
                <span className="mr-2 font-black text-[var(--gold)]">{index + 1}.</span>
                {step}
              </div>
            ))}
          </div>
        </section>
        <section className="surface rounded-md p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Safety</p>
          <h2 className="mt-2 text-2xl font-semibold">Non-goals</h2>
          <div className="mt-4 grid gap-3">
            {dashboard.nonGoals.map((goal) => (
              <div className="rounded-md border border-[var(--line)] bg-black/20 p-3 text-sm leading-6" key={goal}>
                {goal}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
