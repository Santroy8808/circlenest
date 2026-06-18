import Link from "next/link";
import type { PlatformModuleDefinition } from "@/modules/platform-infrastructure/types";

const statusLabels: Record<PlatformModuleDefinition["status"], string> = {
  blueprint: "Blueprint",
  "in-progress": "In progress",
  ready: "Ready"
};

export function ModuleCard({ module }: { module: PlatformModuleDefinition }) {
  return (
    <Link href={module.href} className="module-card block rounded-md p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">{module.title}</h2>
        <span className="pill rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
          {statusLabels[module.status]}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{module.purpose}</p>
    </Link>
  );
}

