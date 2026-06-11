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
      ["My Groups", "/groups?view=my"],
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
  const [activeSectionTitle, setActiveSectionTitle] = useState<string | null>(null);

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
          className={`fixed top-[calc(env(safe-area-inset-top,0px)+10px)] ${triggerSideClass} z-[52] rounded-md border border-[var(--border)] bg-[#0f1624]/95 px-3 py-1.5 text-xs font-semibold text-[var(--text-strong)] shadow-lg min-[700px]:hidden`}
          aria-label="Open menu"
        >
          Menu
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 min-[700px]:hidden">
          <button className="absolute inset-0 bg-black/55" type="button" onClick={() => setOpen(false)} aria-label="Close menu overlay" />
          <aside className={`absolute top-0 h-full w-[44vw] max-w-[250px] min-w-[208px] overflow-auto border-[var(--border)] bg-[#0f1624] p-4 shadow-2xl ${side === "RIGHT" ? "right-0 border-l" : "left-0 border-r"}`}>
            <nav className="space-y-2 text-xs">
              {activeSectionTitle == null ? (
                <>
                  <p className="pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">Menu</p>
                  {mobileSections.map((section) => (
                    <PrimaryRow
                      key={section.title}
                      label={section.title}
                      onTap={() => setActiveSectionTitle(section.title)}
                    />
                  ))}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]"
                    onClick={() => setActiveSectionTitle(null)}
                  >
                    Back
                  </button>
                  <Section
                    title={activeSectionTitle}
                    links={
                      activeSectionTitle === "Settings"
                        ? [
                            ...((mobileSections.find((section) => section.title === activeSectionTitle)?.items ?? []) as [string, string][]),
                            ...(includeModerator ? ([["Moderator Dashboard", "/moderation"]] as [string, string][]) : []),
                            ...(includeAdmin ? ([["Admin Portal", "/admin"]] as [string, string][]) : []),
                          ]
                        : (mobileSections.find((section) => section.title === activeSectionTitle)?.items ?? [])
                    }
                    onNavigate={() => setOpen(false)}
                  />
                </>
              )}
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

function PrimaryRow({ label, onTap }: { label: string; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="flex w-full items-center justify-between rounded-md border border-[var(--border)] bg-[#111c30] px-3 py-3 text-left text-[16px] font-semibold text-[#f4f7ff]"
    >
      <span>{label}</span>
      <span className="text-[#f2d78d]">{"\u203A"}</span>
    </button>
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
    <section className="border border-[var(--border)] bg-[#101a2c] p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">{title}</p>
      <div className="grid gap-1">
        {links.map(([label, href, comingSoon]) => (
          <Link key={href} href={href} className="flex items-center gap-2 text-[13px] text-slate-300 transition hover:text-white" onClick={onNavigate}>
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

