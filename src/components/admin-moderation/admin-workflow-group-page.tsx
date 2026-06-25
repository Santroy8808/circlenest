import Link from "next/link";
import { AdminFunctionCard } from "@/components/admin-moderation/admin-workflow-cards";
import type { AdminWorkflowCategory, AdminWorkflowGroup } from "@/modules/admin-moderation/admin-workflows";

export function AdminWorkflowGroupPage({ category, group }: { category: AdminWorkflowCategory; group: AdminWorkflowGroup }) {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap gap-3">
          <Link className="btn-secondary inline-flex" href={category.href}>
            Back to {category.title}
          </Link>
          <Link className="btn-secondary inline-flex" href="/admin">
            Admin Portal
          </Link>
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{category.title}</p>
        <h1 className="mt-3 text-3xl font-semibold">{group.title}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">{group.description}</p>
      </section>

      <section className="surface rounded-md p-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Function Actions</p>
          <h2 className="mt-2 text-2xl font-semibold">Choose an action</h2>
        </div>
        <div className="admin-function-grid mt-5">
          {group.entries.map((entry) => (
            <AdminFunctionCard entry={entry} key={`${entry.href}:${entry.title}`} />
          ))}
        </div>
      </section>
    </div>
  );
}
