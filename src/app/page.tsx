import { AppShell } from "@/components/platform/app-shell";
import { ModuleCard } from "@/components/platform/module-card";
import { getModuleDefinitions, milestoneDefinitions } from "@/modules/platform-infrastructure/platform.service";

export default function HomePage() {
  const modules = getModuleDefinitions();

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Foundation Slice</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight md:text-4xl">Modern Theta-Space rebuild</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
              The new app starts with a PostgreSQL-first platform layer, diagnostics, feature flags, R2 media boundaries,
              and module documentation before each product area is rebuilt.
            </p>
          </div>
          <div className="rounded-md border border-[var(--line)] bg-black/20 px-4 py-3 text-sm">
            <p className="text-[var(--muted)]">Current module</p>
            <p className="mt-1 font-semibold text-[var(--gold)]">Platform Infrastructure</p>
          </div>
        </div>
      </section>

      <section className="mt-5 surface rounded-md p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Dev Update Page</p>
            <h2 className="mt-2 text-2xl font-semibold">Milestones</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[var(--muted)]">
            This page stays as the rebuild console: completed slices, current phase, next phase, and docs links.
          </p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {milestoneDefinitions.map((milestone) => (
            <article key={milestone.label} className="rounded-md border border-[var(--line)] bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">{milestone.label}</p>
                  <h3 className="mt-1 text-lg font-semibold">{milestone.title}</h3>
                </div>
                <span className="pill rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
                  {milestone.status}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{milestone.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <ModuleCard key={module.key} module={module} />
        ))}
      </section>
    </AppShell>
  );
}
