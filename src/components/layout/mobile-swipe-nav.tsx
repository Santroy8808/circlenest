"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/layout/logout-button";
import { buildControlPanelSections } from "@/components/layout/control-panel.config";
import { ControlPanelSection } from "@/components/layout/control-panel-section";

type SwipeSide = "LEFT" | "RIGHT";

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
  const mobileSections = buildControlPanelSections({
    includeAdmin,
    includeModerator,
  });

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
                <ControlPanelSection
                  key={section.title}
                  title={section.title}
                  links={section.links}
                  onNavigate={() => setOpen(false)}
                  variant="mobile"
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
