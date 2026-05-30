"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/layout/logout-button";

type SwipeSide = "LEFT" | "RIGHT";

const EDGE_SIZE = 44;
const OPEN_DELTA = 44;

export function MobileSwipeNav({ side = "RIGHT" }: { side?: SwipeSide }) {
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
      <aside className={`absolute top-0 h-full w-56 border-[var(--border)] bg-[#0f1624] p-4 shadow-2xl ${side === "RIGHT" ? "right-0 border-l" : "left-0 border-r"}`}>
        <p className="mb-3 text-sm font-semibold text-[var(--text-strong)]">Navigation</p>
        <nav className="grid gap-2 text-sm">
          <Link href="/home" onClick={() => setOpen(false)}>Home</Link>
          <Link href="/friends" onClick={() => setOpen(false)}>Friends</Link>
          <Link href="/profile/edit" onClick={() => setOpen(false)}>Profile</Link>
          <Link href="/groups" onClick={() => setOpen(false)}>Groups</Link>
          <Link href="/messages" onClick={() => setOpen(false)}>Inbox</Link>
        </nav>
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <LogoutButton />
        </div>
      </aside>
    </div>
  );
}
