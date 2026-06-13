"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/layout/logout-button";

type SwipeSide = "LEFT" | "RIGHT";
type MenuSection = { title: string; items: [string, string, boolean?][] };

const EDGE_SIZE = 44;
const OPEN_DELTA = 44;

const mobileSections: MenuSection[] = [
  {
    title: "Home",
    items: [
      ["Home", "/home"],
      ["Gallery", "/profile/gallery"],
    ],
  },
  {
    title: "Production Zone",
    items: [
      ["Production Zone", "/production-zone"],
    ],
  },
  {
    title: "People",
    items: [
      ["Friends", "/friends"],
      ["Groups", "/groups"],
    ],
  },
  {
    title: "Communications",
    items: [
      ["Messages", "/messages"],
      ["Notifications", "/notifications"],
      ["Alerts", "/alerts"],
    ],
  },
  {
    title: "Settings",
    items: [
      ["Settings", "/settings"],
    ],
  },
];

export function MobileSwipeNav({
  side = "RIGHT",
  includeAdmin = false,
  includeModerator = false,
}: {
  side?: SwipeSide;
  includeAdmin?: boolean;
  includeModerator?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let openedFromGesture = false;

    const onTouchStart = (event: TouchEvent) => {
      if (window.innerWidth >= 700 || open) return;
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      openedFromGesture = false;
      tracking = side === "RIGHT" ? startX >= window.innerWidth - EDGE_SIZE : startX <= EDGE_SIZE;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || open || openedFromGesture) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (side === "RIGHT" && dx <= -OPEN_DELTA) {
        openedFromGesture = true;
        setOpen(true);
      }
      if (side === "LEFT" && dx >= OPEN_DELTA) {
        openedFromGesture = true;
        setOpen(true);
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!tracking || open) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const horizontalIntent = Math.abs(dx) > Math.abs(dy);
      if (!horizontalIntent) return;
      if (side === "RIGHT" && dx <= -OPEN_DELTA) setOpen(true);
      if (side === "LEFT" && dx >= OPEN_DELTA) setOpen(true);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [side, open]);

  const triggerSideClass = side === "RIGHT" ? "right-3" : "left-3";

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`fixed top-[calc(env(safe-area-inset-top,0px)+10px)] ${triggerSideClass} z-[52] rounded-full border border-[#304058] bg-[#0f1624]/95 px-4 py-2 text-xs font-semibold tracking-[0.14em] text-[var(--text-strong)] shadow-lg min-[700px]:hidden`}
          aria-label="Open menu"
        >
          Control Panel
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 min-[700px]:hidden">
          <button className="absolute inset-0 bg-black/55" type="button" onClick={() => setOpen(false)} aria-label="Close menu overlay" />
          <aside className={`absolute top-0 h-full w-[82vw] max-w-[320px] min-w-[260px] overflow-auto border-[var(--border)] bg-[#0f1624] p-4 shadow-2xl transition-transform duration-200 ${side === "RIGHT" ? "right-0 border-l" : "left-0 border-r"}`}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">Control Panel</p>
              <button type="button" className="rounded-full border border-[#304058] px-3 py-1 text-xs text-slate-200" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <nav className="space-y-3 text-xs">
              {mobileSections.map((section) => (
                <Section
                  key={section.title}
                  title={section.title}
                  links={
                    section.title === "Settings"
                      ? [
                          ...section.items,
                          ...(includeModerator ? ([["Moderator Dashboard", "/moderation"]] as [string, string][]) : []),
                          ...(includeAdmin ? ([["Admin Portal", "/admin"]] as [string, string][]) : []),
                        ]
                      : section.items
                  }
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </nav>
            <div className="mt-4 border-t border-[var(--border)] pt-3 text-sm">
              <LogoutButton />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Section({
  title,
  links,
  onNavigate,
}: {
  title: string;
  links: [string, string, boolean?][];
  onNavigate: () => void;
}) {
  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[#101a2c] p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">{title}</p>
      <div className="grid gap-1">
        {links.map(([label, href, comingSoon]) => (
          <Link key={href} href={href} className="flex items-center justify-between rounded-[10px] border border-transparent px-2 py-2 text-[13px] text-slate-300 transition hover:border-[#304058] hover:bg-[#0f1624] hover:text-white" onClick={onNavigate}>
            <span>{label}</span>
            {comingSoon ? (
              <span className="rounded-full border border-amber-400/40 bg-amber-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                Coming soon!
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

