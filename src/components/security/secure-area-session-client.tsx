"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { SECURE_AREA_IDLE_MINUTES } from "@/lib/security/secure-area.shared";

const IDLE_MS = SECURE_AREA_IDLE_MINUTES * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000;

export function SecureAreaSessionClient() {
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

    const revoke = (reason: "idle" | "locked") => {
      if (revoked) return;
      revoked = true;
      void fetch("/api/auth/secure-area/revoke", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
      }).finally(() => {
        window.location.assign(`/secure-area?next=${encodeURIComponent(nextPath)}&reason=${reason}`);
      });
    };

    const refresh = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_INTERVAL_MS) return;
      lastRefreshRef.current = now;
      void fetch("/api/auth/secure-area/ping", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
      }).then((response) => {
        if (!response.ok) revoke("locked");
      }).catch(() => revoke("locked"));
    };

    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => revoke("idle"), IDLE_MS);
      refresh();
    };

    const handlePageHide = () => {
      if (revoked) return;
      navigator.sendBeacon("/api/auth/secure-area/revoke", new Blob([], { type: "application/json" }));
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
  }, [nextPath]);

  return null;
}
