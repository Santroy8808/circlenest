"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
  label: string;
  items: NavItem[];
};

type ControlPanelNavProps = {
  counts: Record<NavCountKey, number>;
  sections: NavSection[];
};

function sectionCount(section: NavSection, counts: Record<NavCountKey, number>) {
  return section.items.reduce((total, item) => total + (item.countKey ? counts[item.countKey] : 0), 0);
}

function matchesPath(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function itemMatchesPath(pathname: string, item: NavItem) {
  return item.href ? matchesPath(pathname, item.href) : false;
}

export function ControlPanelNav({ counts, sections }: ControlPanelNavProps) {
  const pathname = usePathname();
  const liveCounts = useShellCounts(counts);
  const activeSection = useMemo(
    () => sections.find((section) => section.items.some((item) => itemMatchesPath(pathname, item)))?.label ?? sections[0]?.label ?? "",
    [pathname, sections]
  );
  const [openSection, setOpenSection] = useState(activeSection);

  useEffect(() => {
    setOpenSection(activeSection);
  }, [activeSection]);

  function handleItemClick(event: MouseEvent<HTMLAnchorElement>, item: NavItem) {
    if (pathname !== "/home" || item.href !== "/messages" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    window.dispatchEvent(new CustomEvent("theta:open-comm-dock"));
  }

  return (
    <nav aria-label="Control panel" className="mt-8 control-panel-nav">
      {sections.map((section) => {
        const isOpen = openSection === section.label;
        const totalCount = sectionCount(section, liveCounts);

        return (
          <section className={isOpen ? "control-panel-section is-open" : "control-panel-section"} key={section.label}>
            <button
              aria-controls={`control-panel-${section.label.toLowerCase().replace(/\s+/g, "-")}`}
              aria-expanded={isOpen}
              className="control-panel-header"
              onClick={() => setOpenSection((current) => (current === section.label ? "" : section.label))}
              type="button"
            >
              <span>{section.label}</span>
              <span className="control-panel-header-meta">
                {totalCount > 0 ? <span className="control-panel-section-count">{totalCount}</span> : null}
                <span aria-hidden="true" className="control-panel-chevron">
                  ›
                </span>
              </span>
            </button>
            <div
              aria-hidden={!isOpen}
              className="control-panel-items"
              id={`control-panel-${section.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="control-panel-items-inner">
                {section.items.map((item) => {
                  const isActive = itemMatchesPath(pathname, item);
                  const count = item.countKey ? liveCounts[item.countKey] : 0;

                  if (item.action === "logout") {
                    return (
                      <button
                        className="control-panel-link control-panel-action"
                        key={item.label}
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        tabIndex={isOpen ? undefined : -1}
                        type="button"
                      >
                        <span>{item.label}</span>
                      </button>
                    );
                  }

                  return (
                    <Link
                      className={isActive ? "control-panel-link is-active" : "control-panel-link"}
                      href={item.href ?? "/"}
                      key={item.href ?? item.label}
                      onClick={(event) => handleItemClick(event, item)}
                      tabIndex={isOpen ? undefined : -1}
                    >
                      <span>{item.label}</span>
                      {count > 0 ? <span className="control-panel-link-count">{count}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
    </nav>
  );
}
