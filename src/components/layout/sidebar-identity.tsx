"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getPageContextLabel } from "@/components/layout/page-context";

export function SidebarIdentity({
  displayName,
  fallbackName,
}: {
  displayName?: string | null;
  fallbackName?: string | null;
}) {
  const pathname = usePathname();
  const pageLabel = getPageContextLabel(pathname);
  const memberName = displayName?.trim() || fallbackName?.trim() || "Member";

  return (
    <div>
      <p className="text-[16px] font-semibold text-[var(--text-strong)]">{memberName}</p>
      <Link href={pathname || "/home"} className="text-sm text-slate-300 hover:underline">
        {pageLabel}
      </Link>
    </div>
  );
}
