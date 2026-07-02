"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FormEvent, MouseEvent } from "react";
import { useState } from "react";
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

const primaryNavItems = [
  { href: "/home", icon: "/assets/nav/nav-home.png", key: "home", label: "Home", tooltip: "Home stream." },
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

export function DesktopCommandBar({ avatarUrl, counts, displayName, isAdmin, isSignedIn }: DesktopCommandBarProps) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [summaries, setSummaries] = useState<Record<SummaryKind, SummaryState>>(initialSummaryState);
  const liveCounts = useShellCounts(counts);
  const commCount = totalCommCount(liveCounts);

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

  return (
    <header className="desktop-command-bar" aria-label="Theta-Space command bar">
      <div className="desktop-command-brand">
        <Link className="desktop-command-mark" href="/home" data-tooltip="Go to your stream.">
          <span aria-hidden="true">TS</span>
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
              <Image alt="" aria-hidden="true" className="desktop-command-nav-image" height={50} src={item.icon} width={50} />
              <span className="sr-only">{item.label}</span>
              {item.key === "messages" && commCount > 0 ? <strong>{commCount}</strong> : null}
            </Link>
          );
        })}
      </nav>

      <div className="desktop-command-actions">
        {isSignedIn ? (
          <>
            <Link className="desktop-command-icon" href="/ads/create" data-tooltip="Create an ad.">
              <span aria-hidden="true">+</span>
              <span className="sr-only">Create ad</span>
            </Link>
            <Link
              className="desktop-command-icon"
              href="/notifications"
              data-tooltip={summaryTooltip("notifications", summaries.notifications)}
              onFocus={() => loadSummary("notifications")}
              onPointerEnter={() => loadSummary("notifications")}
            >
              <span aria-hidden="true">N</span>
              {liveCounts.notifications > 0 ? <strong>{liveCounts.notifications}</strong> : null}
              <span className="sr-only">Notifications</span>
              <ShellSummaryPanel count={liveCounts.notifications} kind="notifications" summary={summaries.notifications} />
            </Link>
            <Link
              className="desktop-command-icon"
              href="/alerts"
              data-tooltip={summaryTooltip("alerts", summaries.alerts)}
              onFocus={() => loadSummary("alerts")}
              onPointerEnter={() => loadSummary("alerts")}
            >
              <span aria-hidden="true">!</span>
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
