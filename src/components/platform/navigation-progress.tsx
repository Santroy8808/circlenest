"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

function isPlainPrimaryClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function internalNavigatingAnchor(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  if (anchor.getAttribute("aria-disabled") === "true") return null;

  const href = anchor.href;
  if (!href || !href.startsWith(window.location.origin)) return null;

  const next = new URL(href);
  const current = new URL(window.location.href);
  if (next.pathname === current.pathname && next.search === current.search && next.hash) return null;
  if (next.pathname === current.pathname && next.search === current.search && next.hash === current.hash) return null;

  return anchor;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    let timeout = 0;

    function hideLater(delay: number) {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setVisible(false), delay);
    }

    function handleClick(event: MouseEvent) {
      if (!isPlainPrimaryClick(event)) return;
      if (!internalNavigatingAnchor(event.target)) return;
      setVisible(true);
      hideLater(7000);
    }

    function handlePageShow() {
      setVisible(false);
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("pageshow", handlePageShow);
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <div aria-live="polite" className={visible ? "navigation-progress is-visible" : "navigation-progress"} role="status">
      <span className="navigation-progress-bar" />
      <span className="navigation-progress-spinner" />
      <span className="sr-only">Loading page</span>
    </div>
  );
}
