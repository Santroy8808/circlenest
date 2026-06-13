"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/layout/logout-button";

type SwipeSide = "LEFT" | "RIGHT";
type MenuSection = { title: string; items: [string, string, boolean?][] };

const mobileSections: MenuSection[] = [
  {
    title: "Home",
    items: [
      ["My Stream", "/home"],
      ["My Pics", "/profile/gallery"],
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
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const triggerSideClass = side === "RIGHT" ? "right-3" : "left-3";

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`fixed bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] ${triggerSideClass} z-[52] rounded-full border border-[#304058] bg-[#0f1624]/95 px-4 py-3 text-xs font-semibold tracking-[0.14em] text-[var(--text-strong)] shadow-[0_18px_36px_rgba(0,0,0,0.35)] min-[700px]:hidden`}
          aria-label="Open menu"
        >
          Menu
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 min-[700px]:hidden">
          <button className="absolute inset-0 bg-black/55" type="button" onClick={() => setOpen(false)} aria-label="Close menu overlay" />
          <aside className={`absolute top-0 h-full w-[88vw] max-w-[360px] overflow-y-auto border-[var(--border)] bg-[#0f1624] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-[calc(env(safe-area-inset-top,0px)+16px)] shadow-2xl ${side === "RIGHT" ? "right-0 border-l" : "left-0 border-r"}`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">Control Panel</p>
                <p className="mt-1 text-xs text-slate-400">Quick navigation</p>
              </div>
              <button type="button" className="rounded-full border border-[#304058] px-3 py-1 text-xs text-slate-200" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <QuickLink href="/home" label="My Stream" onNavigate={() => setOpen(false)} />
              <QuickLink href="/profile/gallery" label="My Pics" onNavigate={() => setOpen(false)} />
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

function QuickLink({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      className="rounded-[12px] border border-[#304058] bg-[#111a2a] px-3 py-3 text-center text-sm font-medium text-slate-100 transition hover:border-[#4a5a78] hover:bg-[#162033]"
      onClick={onNavigate}
    >
      {label}
    </Link>
  );
}

