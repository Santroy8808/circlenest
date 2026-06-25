"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const HEARTBEAT_MS = 60000;

function moduleFromPath(pathname: string) {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "home";

  if (segment === "profile") return "profile-identity";
  if (segment === "messages") return "chat-messages";
  if (segment === "mail") return "mail";
  if (segment === "market") return "market";
  if (segment === "jobs") return "jobs";
  if (segment === "groups") return "groups";
  if (segment === "events") return "events";
  if (segment === "ads") return "ads-credits";
  if (segment === "admin") return "admin-moderation";

  return segment;
}

function getSessionKey() {
  if (typeof window === "undefined") return "";
  const storageKey = "theta-space.activity-session";
  const existing = window.sessionStorage.getItem(storageKey);

  if (existing) return existing;

  const next = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, next);
  return next;
}

function deviceClass() {
  if (typeof window === "undefined") return "DESKTOP";
  return window.innerWidth < 768 ? "MOBILE" : "DESKTOP";
}

function postActivity(payload: Record<string, unknown>) {
  const body = JSON.stringify({
    ...payload,
    sessionKey: getSessionKey()
  });

  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    navigator.sendBeacon("/api/metrics/activity", new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch("/api/metrics/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  });
}

export function ActivityTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const activityModule = moduleFromPath(pathname);

  useEffect(() => {
    postActivity({
      eventType: "PAGE_VIEW",
      route,
      module: activityModule,
      metadata: {
        deviceClass: deviceClass(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        visible: document.visibilityState === "visible"
      }
    });
  }, [activityModule, route]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      postActivity({
        eventType: "HEARTBEAT",
        route,
        module: activityModule,
        metadata: {
          deviceClass: deviceClass(),
          visible: document.visibilityState === "visible"
        }
      });
    }, HEARTBEAT_MS);

    return () => window.clearInterval(timer);
  }, [activityModule, route]);

  return null;
}
