import { AppShell } from "@/components/platform/app-shell";
import { getPlatformHealth } from "@/lib/platform/health";
import { requireAdminPage } from "@/lib/platform/page-access";

export const dynamic = "force-dynamic";

const statusColor = {
  healthy: "text-[var(--green)]",
  degraded: "text-[var(--gold)]",
  offline: "text-[var(--red)]",
  unknown: "text-[var(--muted)]"
};

export default async function HealthPage() {
  await requireAdminPage("/health");

  const checks = await getPlatformHealth();

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Diagnostics</p>
        <h1 className="mt-3 text-3xl font-semibold">Platform health</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          This page verifies the new rebuild foundation before product modules are added.
        </p>
      </section>

      <section className="mt-5 grid gap-3">
        {checks.map((check) => (
          <article key={check.name} className="module-card rounded-md p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-lg font-semibold capitalize">{check.name.replace(/-/g, " ")}</h2>
              <span className={`text-sm font-semibold capitalize ${statusColor[check.status]}`}>{check.status}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{check.message}</p>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
