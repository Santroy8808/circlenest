"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useShellCounts } from "@/components/platform/shell-counts-provider";
import { clearWebTabSessionMarker } from "@/lib/client/web-tab-session";

type NavCountKey = "messages" | "mail" | "notifications" | "alerts";

export type NavItem = {
  label: string;
  href?: string;
  countKey?: NavCountKey;
  action?: "logout";
  isNewlyUnlocked?: boolean;
};

export type NavSection = {
  href?: string;
  label: string;
  items: NavItem[];
  isNewlyUnlocked?: boolean;
};

type ControlPanelNavProps = {
  counts: Record<NavCountKey, number>;
  sections: NavSection[];
};

const popupMenuSectionLabels = new Set(["Comm Center", "Jobs & Market"]);

function hrefPath(href: string) {
  return href.split("?")[0] ?? href;
}

function sectionTutorialTarget(label: string) {
  return `control-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
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
    clearWebTabSessionMarker();
    void signOut({ callbackUrl: "/login" });
  }
}

export function ControlPanelNav({ counts, sections }: ControlPanelNavProps) {
  const pathname = usePathname();
  const liveCounts = useShellCounts(counts);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 12, top: 12 });
  const [tutorialShimmering, setTutorialShimmering] = useState(false);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stopTimer = 0;
    const interval = window.setInterval(() => {
      setTutorialShimmering(true);
      stopTimer = window.setTimeout(() => setTutorialShimmering(false), 1400);
    }, 30_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stopTimer);
    };
  }, []);

  useLayoutEffect(() => {
    const activeMenu = openMenu ?? "";
    if (!activeMenu) return;

    function positionMenu() {
      const button = menuButtonRefs.current[activeMenu];
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const menuWidth = Math.min(280, window.innerWidth - 24);
      const preferredLeft = rect.right + 12;
      const left = preferredLeft + menuWidth <= window.innerWidth - 12
        ? preferredLeft
        : Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
      const top = Math.max(12, Math.min(rect.top, window.innerHeight - 190));
      setMenuPosition({ left, top });
    }

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [openMenu]);

  function handleItemClick(event: MouseEvent<HTMLAnchorElement>, item: NavItem) {
    if (pathname !== "/home" || item.href !== "/messages" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    window.dispatchEvent(new CustomEvent("theta:toggle-comm-dock"));
  }

  function closeMenu() {
    setOpenMenu(null);
  }

  return (
    <nav aria-label="Control panel" className="mt-8 control-panel-nav">
      {navRows.map((section) => {
        if (!section.targetHref) return null;
        const hasPopupMenu = popupMenuSectionLabels.has(section.label) && section.items.some((item) => item.href);

        if (hasPopupMenu) {
          const isOpen = openMenu === section.label;
          const tutorialTarget = sectionTutorialTarget(section.label);
          return (
            <div className="control-panel-menu-wrap" key={section.label}>
              <button
                aria-expanded={isOpen}
                aria-haspopup="menu"
                className={[
                  "control-panel-main-link",
                  section.isActive ? "is-active" : "",
                  section.isNewlyUnlocked ? "control-panel-main-link--new" : ""
                ].filter(Boolean).join(" ")}
                data-tooltip={`Open ${section.label} menu.`}
                data-tutorial-target={tutorialTarget}
                onClick={() => setOpenMenu((current) => current === section.label ? null : section.label)}
                ref={(button) => {
                  menuButtonRefs.current[section.label] = button;
                }}
                type="button"
              >
                <span>{section.label}</span>
                <span className="control-panel-header-meta">
                  {section.isNewlyUnlocked ? <span className="control-panel-new-badge">New</span> : null}
                  {section.totalCount > 0 ? <span className="control-panel-section-count">{section.totalCount}</span> : null}
                  <span aria-hidden="true" className="control-panel-menu-caret">{">"}</span>
                </span>
              </button>
              {isOpen ? createPortal(
                <div className="control-panel-popup-menu" role="menu" style={menuPosition}>
                  {section.items.filter((item) => item.href).map((item) => (
                    <Link
                      className={itemMatchesPath(pathname, item) ? "control-panel-popup-link is-active" : "control-panel-popup-link"}
                      href={item.href ?? "#"}
                      key={item.label}
                      onClick={(event) => {
                        handleItemClick(event, item);
                        closeMenu();
                      }}
                      role="menuitem"
                    >
                      <span className="control-panel-popup-link-label">
                        <span>{item.label}</span>
                        {item.isNewlyUnlocked ? <span className="control-panel-new-badge">New</span> : null}
                      </span>
                      {item.countKey && liveCounts[item.countKey] > 0 ? <span className="control-panel-link-count">{liveCounts[item.countKey]}</span> : null}
                    </Link>
                  ))}
                </div>,
                document.body
              ) : null}
            </div>
          );
        }

        return (
          <Link
            className={[
              "control-panel-main-link",
              section.isActive ? "is-active" : "",
              section.label === "Tutorial" ? "control-panel-main-link--tutorial" : "",
              section.label === "Tutorial" && tutorialShimmering ? "control-panel-main-link--shimmer" : "",
              section.isNewlyUnlocked ? "control-panel-main-link--new" : ""
            ].filter(Boolean).join(" ")}
            data-tooltip={`Open ${section.label}.`}
            data-tutorial-target={sectionTutorialTarget(section.label)}
            href={section.targetHref}
            key={section.label}
            onClick={(event) => handleItemClick(event, { href: section.targetHref, label: section.label })}
          >
            <span>{section.label}</span>
            <span className="control-panel-header-meta">
              {section.isNewlyUnlocked ? <span className="control-panel-new-badge">New</span> : null}
              {section.totalCount > 0 ? <span className="control-panel-section-count">{section.totalCount}</span> : null}
            </span>
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
