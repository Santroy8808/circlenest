import type { AdminActionCard } from "@/modules/admin-moderation/types";

export function AdminActionWizard({ action }: { action: AdminActionCard }) {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Wizard</p>
        <h1 className="mt-3 text-3xl font-semibold">{action.title}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">{action.description}</p>
        <span className="pill mt-4 inline-flex rounded-full px-3 py-1 text-xs">Risk: {action.risk}</span>
      </section>

      <section className="surface rounded-md p-6">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Walkthrough</h2>
        <ol className="mt-4 grid gap-3">
          {action.steps.map((step, index) => (
            <li className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={step}>
              <span className="mr-3 font-semibold text-[var(--gold)]">{index + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="surface rounded-md p-6">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Action unavailable</h2>
        <p className="mt-3 leading-7 text-[var(--muted)]">This admin action is not enabled in the live action list.</p>
      </section>
    </div>
  );
}
