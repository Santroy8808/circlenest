"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/layout/logout-button";

type SwipeSide = "LEFT" | "RIGHT";

const EDGE_SIZE = 44;
const OPEN_DELTA = 44;

export function MobileSwipeNav({ side = "RIGHT", includeAdmin = false }: { side?: SwipeSide; includeAdmin?: boolean }) {
  const [open, setOpen] = useState(false);

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 min-[700px]:hidden">
      <button className="absolute inset-0 bg-black/55" type="button" onClick={() => setOpen(false)} aria-label="Close menu overlay" />
      <aside className={`absolute top-0 h-full w-[50vw] max-w-[280px] min-w-[220px] overflow-auto border-[var(--border)] bg-[#0f1624] p-4 shadow-2xl ${side === "RIGHT" ? "right-0 border-l" : "left-0 border-r"}`}>
        <nav className="space-y-3 text-xs">
          <Section title="Home" links={[["Home", "/home"], ["Profile", "/profile/edit"], ["My Scientology", "/profile/scientology"], ["Resume", "/profile/resume"], ["Gallery", "/profile/gallery"]]} onNavigate={() => setOpen(false)} />
          <Section title="Communications" links={[["Messages", "/messages"], ["Notifications", "/notifications"], ["Alerts", "/alerts"], ["Invites", "/friends#invites"]]} onNavigate={() => setOpen(false)} />
          <Section title="People" links={[["Friends", "/friends"], ["Groups", "/groups"], ["My Groups", "/groups?mine=1"]]} onNavigate={() => setOpen(false)} />
          <Section title="Production" links={[["Production Zone", "/production-zone"], ["Events", "/events"], ["Bazaar", "/bazaar"], ["Hiring Board", "/jobs"], ["Find an Auditor", "/auditors"]]} onNavigate={() => setOpen(false)} />
          {includeAdmin ? <Section title="Admin" links={[["Admin Portal", "/admin"]]} onNavigate={() => setOpen(false)} /> : null}
          <Section title="Settings" links={[["Security", "/settings"], ["Theme", "/settings/theme"], ["My Rules", "/settings#rules"], ["Blocked Users", "/blocked-users"], ["My Subscription", "/settings#subscription"]]} onNavigate={() => setOpen(false)} />
        </nav>
        <div className="mt-4 border-t border-[var(--border)] pt-3 text-sm">
          <LogoutButton />
        </div>
      </aside>
    </div>
  );
}

function Section({
  title,
  links,
  onNavigate,
}: {
  title: string;
  links: [string, string][];
  onNavigate: () => void;
}) {
  return (
    <section className="border-t border-[var(--border)] pt-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">{title}</p>
      <div className="grid gap-1">
        {links.map(([label, href]) => (
          <Link key={href} href={href} className="text-[13px] text-slate-300 transition hover:text-white" onClick={onNavigate}>
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
