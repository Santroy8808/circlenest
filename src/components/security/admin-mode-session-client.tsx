"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { ADMIN_MODE_IDLE_MINUTES } from "@/lib/security/admin-mode.shared";

const IDLE_MS = ADMIN_MODE_IDLE_MINUTES * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000;

export function AdminModeSessionClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    let revoked = false;

    const finish = () => {
      if (pathname.startsWith("/admin") || pathname.startsWith("/moderation")) {
        window.location.assign("/settings/account#administrator-mode");
        return;
      }
      window.location.reload();
    };

    const revoke = () => {
      if (revoked) return;
      revoked = true;
      void fetch("/api/settings/admin-mode/revoke", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
      }).finally(finish);
    };

    const refresh = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_INTERVAL_MS) return;
      lastRefreshRef.current = now;
      void fetch("/api/settings/admin-mode/ping", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
      }).then((response) => {
        if (!response.ok) revoke();
      }).catch(revoke);
    };

    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(revoke, IDLE_MS);
      refresh();
    };

    const handlePageHide = () => {
      if (revoked) return;
      navigator.sendBeacon("/api/settings/admin-mode/revoke", new Blob([], { type: "application/json" }));
    };

    const activityEvents: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, resetIdleTimer, { passive: true });
    }
    window.addEventListener("pagehide", handlePageHide);

    resetIdleTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, resetIdleTimer);
      }
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [nextPath, pathname]);

  return null;
}
