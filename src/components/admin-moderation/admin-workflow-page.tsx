import Link from "next/link";
import { AdminFunctionCard, AdminWorkflowGroupCard } from "@/components/admin-moderation/admin-workflow-cards";
import type { AdminWorkflowCategory } from "@/modules/admin-moderation/admin-workflows";

export function AdminWorkflowPage({ category }: { category: AdminWorkflowCategory }) {
  const isPlatformControls = category.key === "platform-controls";

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <Link className="btn-secondary inline-flex" href="/admin">
          Back to Admin Portal
        </Link>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{category.eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold">{category.title}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">{category.description}</p>
      </section>

      <section className="surface rounded-md p-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">
            {isPlatformControls ? "Platform Controls" : "Workflow Categories"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            {isPlatformControls ? "Choose an action" : "Choose the next layer"}
          </h2>
        </div>
        {isPlatformControls ? (
          <div className="admin-function-grid mt-5">
            {category.groups.flatMap((group) => group.entries).map((entry) => (
              <AdminFunctionCard entry={entry} key={`${entry.href}:${entry.title}`} />
            ))}
          </div>
        ) : (
          <div className="admin-category-grid mt-5">
            {category.groups.map((group) => (
              <AdminWorkflowGroupCard categoryKey={category.key} group={group} key={group.key} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
