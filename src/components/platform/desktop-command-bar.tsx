"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FormEvent, MouseEvent } from "react";
import { useState } from "react";

type Counts = {
  alerts: number;
  mail: number;
  messages: number;
  notifications: number;
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

export function DesktopCommandBar({ avatarUrl, counts, displayName, isAdmin, isSignedIn }: DesktopCommandBarProps) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const commCount = totalCommCount(counts);

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
        <Link className={pathname === "/home" ? "desktop-command-link is-active" : "desktop-command-link"} href="/home" data-tooltip="Home stream.">
          <span aria-hidden="true">H</span>
          <span>Home</span>
        </Link>
        <Link className={pathname.startsWith("/people") ? "desktop-command-link is-active" : "desktop-command-link"} href="/people" data-tooltip="Find people, friends, and groups.">
          <span aria-hidden="true">P</span>
          <span>People</span>
        </Link>
        <Link className={pathname.startsWith("/market") ? "desktop-command-link is-active" : "desktop-command-link"} href="/market" data-tooltip="Browse market listings.">
          <span aria-hidden="true">M</span>
          <span>Market</span>
        </Link>
        <Link className={pathname.startsWith("/search") ? "desktop-command-link is-active" : "desktop-command-link"} href="/search" data-tooltip="Search the platform.">
          <span aria-hidden="true">S</span>
          <span>Search</span>
        </Link>
        <Link className={pathname.startsWith("/messages") ? "desktop-command-link is-active" : "desktop-command-link"} href="/messages" onClick={openComm} data-tooltip="Open Comm without leaving the stream.">
          <span aria-hidden="true">C</span>
          <span>Comm</span>
          {commCount > 0 ? <strong>{commCount}</strong> : null}
        </Link>
      </nav>

      <div className="desktop-command-actions">
        {isSignedIn ? (
          <>
            <Link className="desktop-command-icon" href="/ads/create" data-tooltip="Create an ad.">
              <span aria-hidden="true">+</span>
              <span className="sr-only">Create ad</span>
            </Link>
            <Link className="desktop-command-icon" href="/notifications" data-tooltip="Notifications.">
              <span aria-hidden="true">N</span>
              {counts.notifications > 0 ? <strong>{counts.notifications}</strong> : null}
              <span className="sr-only">Notifications</span>
            </Link>
            <Link className="desktop-command-icon" href="/alerts" data-tooltip="Alerts.">
              <span aria-hidden="true">!</span>
              {counts.alerts > 0 ? <strong>{counts.alerts}</strong> : null}
              <span className="sr-only">Alerts</span>
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
