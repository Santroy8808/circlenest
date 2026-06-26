"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function GlobalFeedbackLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const currentUrl = `${pathname}${queryString ? `?${queryString}` : ""}`;
  const hiddenPaths = ["/login", "/signup", "/reset-password", "/verify-email"];
  const isComposerPath = pathname.startsWith("/messages") || pathname.startsWith("/mail");

  if (pathname.startsWith("/feedback/new") || hiddenPaths.some((path) => pathname.startsWith(path))) {
    return null;
  }

  return (
    <Link className={isComposerPath ? "feedback-fab feedback-fab--above-composer" : "feedback-fab"} href={`/feedback/new?from=${encodeURIComponent(currentUrl)}`}>
      Report issue
    </Link>
  );
}
