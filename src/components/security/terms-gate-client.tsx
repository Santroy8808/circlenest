"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function TermsGateClient({ needsAcceptance }: { needsAcceptance: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!needsAcceptance) return;
    const query = searchParams?.toString();
    const next = query ? `${pathname}?${query}` : pathname;
    if (pathname === "/accept-terms") return;
    window.location.assign(`/accept-terms?next=${encodeURIComponent(next)}`);
  }, [needsAcceptance, pathname, searchParams]);

  return null;
}
