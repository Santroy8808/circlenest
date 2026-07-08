"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FormEvent, MouseEvent } from "react";
import { useEffect, useState } from "react";
import { useShellCounts } from "@/components/platform/shell-counts-provider";

type Counts = {
  alerts: number;
  mail: number;
  messages: number;
  notifications: number;
};

type SummaryKind = "alerts" | "notifications";

type ShellSummaryItem = {
  body: string | null;
  createdAt: string;
  id: string;
  title: string;
};

type SummaryState = {
  items: ShellSummaryItem[];
  status: "idle" | "loading" | "ready" | "error";
};

type DesktopCommandBarProps = {
  avatarUrl?: string | null;
  counts: Counts;
  displayName: string;
  isAdmin: boolean;
  isSignedIn: boolean;
};

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function totalCommCount(counts: Counts) {
  return counts.messages + counts.mail + counts.notifications + counts.alerts;
}

type PrimaryNavItem = {
  glyph?: "gallery";
  href: string;
  icon?: string;
  key: string;
  label: string;
  tooltip: string;
};

const primaryNavItems: PrimaryNavItem[] = [
  { href: "/home", icon: "/assets/nav/nav-home.png", key: "home", label: "Home", tooltip: "Home stream." },
  { href: "/profile/gallery", glyph: "gallery", key: "gallery", label: "My Pics", tooltip: "Open your gallery." },
  { href: "/people", icon: "/assets/nav/nav-people.png", key: "people", label: "People", tooltip: "Find people, friends, and groups." },
  { href: "/market", icon: "/assets/nav/nav-market.png", key: "market", label: "Market", tooltip: "Browse market listings." },
  { href: "/search", icon: "/assets/nav/nav-search.png", key: "search", label: "Search", tooltip: "Search the platform." },
  { href: "/messages", icon: "/assets/nav/nav-comm.png", key: "messages", label: "Comm", tooltip: "Open Comm without leaving the stream." }
];

const initialSummaryState: Record<SummaryKind, SummaryState> = {
  alerts: { items: [], status: "idle" },
  notifications: { items: [], status: "idle" }
};

function summaryTooltip(kind: SummaryKind, summary: SummaryState) {
  const label = kind === "alerts" ? "Alerts" : "Notifications";
  if (summary.status === "loading") return `Loading latest ${label.toLowerCase()}.`;
  if (summary.status === "error") return `Could not load latest ${label.toLowerCase()}.`;
  if (summary.items.length === 0) return `${label}: no recent items.`;
  return `${label}: ${summary.items.map((item) => item.title).join("; ")}`;
}

function ShellSummaryPanel({ count, kind, summary }: { count: number; kind: SummaryKind; summary: SummaryState }) {
  const label = kind === "alerts" ? "Alerts" : "Notifications";

  return (
    <span className="desktop-command-summary" aria-hidden="true">
      <strong>{label}</strong>
      {summary.status === "loading" ? <small>Loading latest...</small> : null}
      {summary.status === "error" ? <small>Could not load the latest items.</small> : null}
      {summary.status !== "loading" && summary.status !== "error" && summary.items.length === 0 ? (
        <small>{count > 0 ? "Open to review current items." : "No recent items."}</small>
      ) : null}
      {summary.items.map((item) => (
        <span key={item.id}>
          {item.title}
          {item.body ? <small>{item.body}</small> : null}
        </span>
      ))}
    </span>
  );
}

function NotificationBellIcon() {
  return (
    <svg aria-hidden="true" className="desktop-command-svg" viewBox="0 0 24 24">
      <path d="M6.5 10.7c0-3.4 2.2-6.1 5.5-6.1s5.5 2.7 5.5 6.1v3.2l1.7 2.7H4.8l1.7-2.7z" />
      <path d="M9.5 18.4c.5 1 1.3 1.5 2.5 1.5s2-.5 2.5-1.5" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg aria-hidden="true" className="desktop-command-svg desktop-command-svg--alert" viewBox="0 0 24 24">
      <path d="M12 3.8 21 19H3z" />
      <path d="M12 8.5v5.2" />
      <path d="M12 16.8h.01" />
    </svg>
  );
}

function GalleryNavIcon() {
  return (
    <svg aria-hidden="true" className="desktop-command-nav-glyph" viewBox="0 0 24 24">
      <rect height="15" rx="2.6" width="18" x="3" y="5" />
      <path d="M7 15.5 10.2 12l2.2 2.3 2.1-2.8L19 17" />
      <circle cx="16.2" cy="9.3" r="1.2" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: "dark" | "light" }) {
  if (theme === "dark") {
    return (
      <svg aria-hidden="true" className="desktop-command-svg" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.8v2.1" />
        <path d="M12 19.1v2.1" />
        <path d="M4.9 4.9l1.5 1.5" />
        <path d="M17.6 17.6l1.5 1.5" />
        <path d="M2.8 12h2.1" />
        <path d="M19.1 12h2.1" />
        <path d="M4.9 19.1l1.5-1.5" />
        <path d="M17.6 6.4l1.5-1.5" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="desktop-command-svg" viewBox="0 0 24 24">
      <path d="M20.2 15.2A7.6 7.6 0 0 1 8.8 3.8 8.7 8.7 0 1 0 20.2 15.2z" />
    </svg>
  );
}

export function DesktopCommandBar({ avatarUrl, counts, displayName, isAdmin, isSignedIn }: DesktopCommandBarProps) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [summaries, setSummaries] = useState<Record<SummaryKind, SummaryState>>(initialSummaryState);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const liveCounts = useShellCounts(counts);
  const commCount = totalCommCount(liveCounts);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("theta-theme");
    const nextTheme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("theta-theme-light", nextTheme === "light");
  }, []);

  function runSearch() {
    const trimmed = query.trim();
    window.location.href = trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search";
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runSearch();
  }

  function openComm(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/home" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

    event.preventDefault();
    window.dispatchEvent(new CustomEvent("theta:open-comm-dock"));
  }

  function loadSummary(kind: SummaryKind) {
    setSummaries((current) => ({ ...current, [kind]: { ...current[kind], status: "loading" } }));

    fetch(`/api/shell/summaries?type=${kind}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load summary.");
        return (await response.json()) as { items?: ShellSummaryItem[] };
      })
      .then((payload) => {
        setSummaries((current) => ({ ...current, [kind]: { items: payload.items ?? [], status: "ready" } }));
      })
      .catch(() => {
        setSummaries((current) => ({ ...current, [kind]: { ...current[kind], status: "error" } }));
      });
  }

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("theta-theme", nextTheme);
    document.documentElement.classList.toggle("theta-theme-light", nextTheme === "light");
  }

  return (
    <header className="desktop-command-bar" aria-label="Theta-Space command bar">
      <div className="desktop-command-brand">
        <Link className="desktop-command-mark" href="/home" data-tooltip="Go to your stream.">
          <Image alt="" aria-hidden="true" height={44} src="/assets/theta-send-logo.png" width={58} />
          <span className="sr-only">Theta-Space home</span>
        </Link>
        <form className="desktop-command-search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="desktop-command-search">
            Search Theta-Space
          </label>
          <input
            id="desktop-command-search"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                runSearch();
              }
            }}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Theta-Space"
            value={query}
          />
          <button className="desktop-command-search-button" data-tooltip="Run this search." onClick={runSearch} type="button">
            Go
          </button>
        </form>
      </div>

      <nav className="desktop-command-nav" aria-label="Primary">
        {primaryNavItems.map((item) => {
          const active = item.key === "home" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              aria-label={item.label}
              className={active ? "desktop-command-link is-active" : "desktop-command-link"}
              data-tooltip={item.tooltip}
              href={item.href}
              key={item.key}
              onClick={item.key === "messages" ? openComm : undefined}
            >
              {item.icon ? <Image alt="" aria-hidden="true" className="desktop-command-nav-image" height={50} src={item.icon} width={50} /> : <GalleryNavIcon />}
              <span className="sr-only">{item.label}</span>
              {item.key === "messages" && commCount > 0 ? <strong>{commCount}</strong> : null}
            </Link>
          );
        })}
      </nav>

      <div className="desktop-command-actions">
        {isSignedIn ? (
          <>
            <button className="desktop-command-icon" data-tooltip="Toggle light/dark mode." onClick={toggleTheme} type="button">
              <ThemeIcon theme={theme} />
              <span className="sr-only">Toggle theme</span>
            </button>
            <Link className="desktop-command-create-ad" href="/ads/create" data-tooltip="Create an ad campaign.">
              <span aria-hidden="true">+</span>
              <span>Create ad</span>
            </Link>
            <Link
              className="desktop-command-icon"
              href="/notifications"
              data-tooltip={summaryTooltip("notifications", summaries.notifications)}
              onFocus={() => loadSummary("notifications")}
              onPointerEnter={() => loadSummary("notifications")}
            >
              <NotificationBellIcon />
              {liveCounts.notifications > 0 ? <strong>{liveCounts.notifications}</strong> : null}
              <span className="sr-only">Notifications</span>
              <ShellSummaryPanel count={liveCounts.notifications} kind="notifications" summary={summaries.notifications} />
            </Link>
            <Link
              className="desktop-command-icon is-alert"
              href="/notifications?view=alerts"
              data-tooltip={summaryTooltip("alerts", summaries.alerts)}
              onFocus={() => loadSummary("alerts")}
              onPointerEnter={() => loadSummary("alerts")}
            >
              <AlertIcon />
              {liveCounts.alerts > 0 ? <strong>{liveCounts.alerts}</strong> : null}
              <span className="sr-only">Alerts</span>
              <ShellSummaryPanel count={liveCounts.alerts} kind="alerts" summary={summaries.alerts} />
            </Link>
            {isAdmin ? (
              <Link className="desktop-command-icon" href="/admin" data-tooltip="Admin portal.">
                <span aria-hidden="true">A</span>
                <span className="sr-only">Admin</span>
              </Link>
            ) : null}
            <Link className="desktop-command-avatar" href="/profile" data-tooltip="Open your profile.">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={avatarUrl} />
              ) : (
                <span>{initials(displayName)}</span>
              )}
            </Link>
          </>
        ) : (
          <Link className="desktop-command-login" href="/login">
            Login
          </Link>
        )}
      </div>
    </header>
  );
}
