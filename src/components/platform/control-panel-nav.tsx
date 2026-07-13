"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import type { MouseEvent } from "react";
import { useShellCounts } from "@/components/platform/shell-counts-provider";

type NavCountKey = "messages" | "mail" | "notifications" | "alerts";

export type NavItem = {
  label: string;
  href?: string;
  countKey?: NavCountKey;
  action?: "logout";
};

export type NavSection = {
  href?: string;
  label: string;
  items: NavItem[];
};

type ControlPanelNavProps = {
  counts: Record<NavCountKey, number>;
  sections: NavSection[];
};

function hrefPath(href: string) {
  return href.split("?")[0] ?? href;
}

function sectionCount(section: NavSection, counts: Record<NavCountKey, number>) {
  return section.items.reduce((total, item) => total + (item.countKey ? counts[item.countKey] : 0), 0);
}

function matchesPath(pathname: string, href: string) {
  const path = hrefPath(href);
  return pathname === path || (path !== "/" && pathname.startsWith(`${path}/`));
}

function itemMatchesPath(pathname: string, item: NavItem) {
  return item.href ? matchesPath(pathname, item.href) : false;
}

function confirmLogout() {
  if (window.confirm("Log out of Theta-Space?")) {
    void signOut({ callbackUrl: "/login" });
  }
}

export function ControlPanelNav({ counts, sections }: ControlPanelNavProps) {
  const pathname = usePathname();
  const liveCounts = useShellCounts(counts);
  const navRows = useMemo(
    () =>
      sections.map((section) => {
        const targetHref = section.href ?? section.items.find((item) => item.href)?.href;
        return {
          ...section,
          isActive: Boolean(targetHref && matchesPath(pathname, targetHref)) || section.items.some((item) => itemMatchesPath(pathname, item)),
          targetHref,
          totalCount: sectionCount(section, liveCounts)
        };
      }),
    [liveCounts, pathname, sections]
  );
  const utilityItems = useMemo(
    () =>
      sections
        .flatMap((section) => section.items)
        .filter((item) => item.action === "logout"),
    [sections]
  );

  function handleItemClick(event: MouseEvent<HTMLAnchorElement>, item: NavItem) {
    if (pathname !== "/home" || item.href !== "/messages" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    window.dispatchEvent(new CustomEvent("theta:toggle-comm-dock"));
  }

  return (
    <nav aria-label="Control panel" className="mt-8 control-panel-nav">
      {navRows.map((section) => {
        if (!section.targetHref) return null;

        return (
          <Link
            className={section.isActive ? "control-panel-main-link is-active" : "control-panel-main-link"}
            data-tooltip={`Open ${section.label}.`}
            data-tutorial-target={`control-${section.label.toLowerCase().replace(/\s+/g, "-")}`}
            href={section.targetHref}
            key={section.label}
            onClick={(event) => handleItemClick(event, { href: section.targetHref, label: section.label })}
          >
            <span>{section.label}</span>
            {section.totalCount > 0 ? <span className="control-panel-section-count">{section.totalCount}</span> : null}
          </Link>
        );
      })}
      {utilityItems.length > 0 ? (
        <div className="control-panel-utility-list">
          {utilityItems.map((item) => (
            <button className="control-panel-main-link control-panel-action" key={item.label} onClick={confirmLogout} type="button">
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
