"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NavSection } from "@/components/platform/control-panel-nav";

type CountKey = "messages" | "mail" | "notifications" | "alerts";

type AndroidAppControlsProps = {
  counts: Record<CountKey, number>;
  sections: NavSection[];
};

type IconName =
  | "alert"
  | "bell"
  | "briefcase"
  | "chat"
  | "drawer"
  | "home"
  | "mail"
  | "people"
  | "search"
  | "settings"
  | "shield"
  | "spark"
  | "up";

const bottomActions: Array<{ href: string; icon: IconName; label: string; countKey?: CountKey }> = [
  { href: "/home", icon: "home", label: "Home" },
  { href: "/messages", icon: "chat", label: "Messages", countKey: "messages" },
  { href: "/mail", icon: "mail", label: "Mail", countKey: "mail" },
  { href: "/notifications", icon: "bell", label: "Notifications", countKey: "notifications" },
  { href: "/alerts", icon: "alert", label: "Alerts", countKey: "alerts" }
];

const sectionIcons: Record<string, IconName> = {
  Account: "shield",
  Admin: "shield",
  Communications: "chat",
  Home: "home",
  People: "people",
  "Production Zone": "briefcase",
  Settings: "settings",
  Status: "spark"
};

function matchesPath(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function sectionCount(section: NavSection, counts: Record<CountKey, number>) {
  return section.items.reduce((total, item) => total + (item.countKey ? counts[item.countKey] : 0), 0);
}

function sectionHref(section: NavSection) {
  return section.items[0]?.href ?? "/home";
}

function countForAction(counts: Record<CountKey, number>, countKey?: CountKey) {
  return countKey ? counts[countKey] : 0;
}

function Icon({ name }: { name: IconName }) {
  const common = {
    "aria-hidden": true,
    fill: "none",
    focusable: false,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24"
  };

  return (
    <svg className="android-control-icon" {...common}>
      {name === "alert" ? (
        <>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.9 2.5 17.3A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.7L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </>
      ) : null}
      {name === "bell" ? (
        <>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </>
      ) : null}
      {name === "briefcase" ? (
        <>
          <path d="M10 6V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1" />
          <rect height="14" rx="2" width="18" x="3" y="6" />
          <path d="M3 12h18" />
        </>
      ) : null}
      {name === "chat" ? (
        <>
          <path d="M21 12a8 8 0 0 1-8 8H6l-3 2v-5a8 8 0 1 1 18-5Z" />
          <path d="M8 12h8" />
        </>
      ) : null}
      {name === "drawer" ? (
        <>
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </>
      ) : null}
      {name === "home" ? (
        <>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </>
      ) : null}
      {name === "mail" ? (
        <>
          <rect height="14" rx="2" width="18" x="3" y="5" />
          <path d="m3 7 9 6 9-6" />
        </>
      ) : null}
      {name === "people" ? (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
          <path d="M16 3.2a4 4 0 0 1 0 7.6" />
        </>
      ) : null}
      {name === "search" ? (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </>
      ) : null}
      {name === "settings" ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.3a2 2 0 0 1-4 0V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.7a2 2 0 0 1 0-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.3a2 2 0 0 1 4 0V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.3a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </>
      ) : null}
      {name === "shield" ? <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /> : null}
      {name === "spark" ? (
        <>
          <path d="M12 2v7" />
          <path d="M12 15v7" />
          <path d="M2 12h7" />
          <path d="M15 12h7" />
          <path d="m5 5 4 4" />
          <path d="m15 15 4 4" />
          <path d="m19 5-4 4" />
          <path d="m9 15-4 4" />
        </>
      ) : null}
      {name === "up" ? (
        <>
          <path d="m6 15 6-6 6 6" />
          <path d="M12 9v12" />
        </>
      ) : null}
    </svg>
  );
}

export function AndroidAppControls({ counts, sections }: AndroidAppControlsProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const primarySections = useMemo(() => sections.filter((section) => section.items.length > 0), [sections]);

  useEffect(() => {
    setSheetOpen(false);
    setDrawerOpen(false);
    document.documentElement.classList.remove("theta-menu-open");
  }, [pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle("theta-menu-open", drawerOpen);
    return () => document.documentElement.classList.remove("theta-menu-open");
  }, [drawerOpen]);

  useEffect(() => {
    let startX = 0;
    let startY = 0;

    function onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
    }

    function onTouchEnd(event: TouchEvent) {
      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (Math.abs(deltaY) > 70) return;
      if (!drawerOpen && startX <= 28 && deltaX > 70) setDrawerOpen(true);
      if (drawerOpen && deltaX < -70) setDrawerOpen(false);
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [drawerOpen]);

  function onTouchEnd(clientY: number) {
    if (touchStartY.current === null) return;
    const delta = touchStartY.current - clientY;
    touchStartY.current = null;
    if (delta > 28) setSheetOpen(true);
    if (delta < -28) setSheetOpen(false);
  }

  return (
    <>
      {drawerOpen ? <button aria-label="Close control panel" className="android-drawer-scrim" onClick={() => setDrawerOpen(false)} type="button" /> : null}
      {sheetOpen ? <button aria-label="Close shortcuts" className="android-shortcut-scrim" onClick={() => setSheetOpen(false)} type="button" /> : null}
      <div className={sheetOpen ? "android-shortcut-sheet is-open" : "android-shortcut-sheet"} role="dialog" aria-label="Control panel shortcuts">
        <div className="android-shortcut-grid">
          {primarySections.map((section) => {
            const href = sectionHref(section);
            const totalCount = sectionCount(section, counts);
            return (
              <Link
                aria-label={section.label}
                className={matchesPath(pathname, href) ? "android-shortcut-card is-active" : "android-shortcut-card"}
                href={href}
                key={section.label}
                onClick={() => setSheetOpen(false)}
                title={section.label}
              >
                <Icon name={sectionIcons[section.label] ?? "spark"} />
                {totalCount > 0 ? <span className="android-control-badge">{totalCount}</span> : null}
              </Link>
            );
          })}
        </div>
        <button aria-label="Open full control panel" className="android-full-drawer-button" onClick={() => setDrawerOpen(true)} title="Control panel" type="button">
          <Icon name="drawer" />
        </button>
      </div>
      <nav
        aria-label="App shortcuts"
        className="android-bottom-nav"
        onTouchEnd={(event) => onTouchEnd(event.changedTouches[0]?.clientY ?? 0)}
        onTouchStart={(event) => {
          touchStartY.current = event.touches[0]?.clientY ?? null;
        }}
      >
        <button aria-label="Control panel shortcuts" className="android-bottom-nav-button" onClick={() => setSheetOpen((open) => !open)} title="Shortcuts" type="button">
          <Icon name="up" />
        </button>
        {bottomActions.map((action) => {
          const count = countForAction(counts, action.countKey);
          return (
            <Link
              aria-label={action.label}
              className={matchesPath(pathname, action.href) ? "android-bottom-nav-link is-active" : "android-bottom-nav-link"}
              href={action.href}
              key={action.href}
              title={action.label}
            >
              <Icon name={action.icon} />
              {count > 0 ? <span className="android-control-badge">{count}</span> : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
