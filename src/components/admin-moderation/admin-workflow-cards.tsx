import Link from "next/link";
import { getAdminWorkflowGroupHref, type AdminFunctionEntry, type AdminWorkflowCategory, type AdminWorkflowGroup } from "@/modules/admin-moderation/admin-workflows";

export function AdminCategoryCard({ category }: { category: AdminWorkflowCategory }) {
  return (
    <Link className="admin-category-card rounded-md p-5" href={category.href}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{category.eyebrow}</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--gold)]">{category.title}</h3>
        </div>
        <span className="pill rounded-full px-3 py-1 text-xs">{category.badge}</span>
      </div>
      <p className="mt-3 leading-6 text-[var(--muted)]">{category.description}</p>
    </Link>
  );
}

export function AdminWorkflowGroupCard({ categoryKey, group }: { categoryKey: string; group: AdminWorkflowGroup }) {
  return (
    <Link className="admin-category-card rounded-md p-5" href={getAdminWorkflowGroupHref(categoryKey, group.key)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Workflow</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--gold)]">{group.title}</h3>
        </div>
        <span className="pill rounded-full px-3 py-1 text-xs">{group.entries.length} tool{group.entries.length === 1 ? "" : "s"}</span>
      </div>
      <p className="mt-3 leading-6 text-[var(--muted)]">{group.description}</p>
    </Link>
  );
}

export function AdminFunctionCard({ entry }: { entry: AdminFunctionEntry }) {
  return (
    <Link className="admin-function-card rounded-md p-5" href={entry.href}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{entry.category}</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--gold)]">{entry.title}</h3>
        </div>
        <span className="pill rounded-full px-3 py-1 text-xs">{entry.badge}</span>
      </div>
      <p className="mt-3 leading-6 text-[var(--muted)]">{entry.description}</p>
    </Link>
  );
}
