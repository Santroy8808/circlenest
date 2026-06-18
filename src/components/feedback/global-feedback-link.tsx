"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function GlobalFeedbackLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const currentUrl = `${pathname}${queryString ? `?${queryString}` : ""}`;

  if (pathname.startsWith("/feedback/new")) {
    return null;
  }

  return (
    <Link className="feedback-fab" href={`/feedback/new?from=${encodeURIComponent(currentUrl)}`}>
      Report issue
    </Link>
  );
}
