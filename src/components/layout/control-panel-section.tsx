"use client";

import Link from "next/link";
import type { ControlPanelLink } from "@/components/layout/control-panel.config";

export function ControlPanelSection({
  title,
  links,
  onNavigate,
  variant = "desktop",
}: {
  title: string;
  links: ControlPanelLink[];
  onNavigate?: () => void;
  variant?: "desktop" | "mobile";
}) {
  if (variant === "mobile") {
    return (
      <section className="rounded-[14px] border border-[var(--border)] bg-[#101a2c] p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">{title}</p>
        <div className="grid gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center justify-between rounded-[10px] border border-transparent px-2 py-2 text-[13px] text-slate-300 transition hover:border-[#304058] hover:bg-[#0f1624] hover:text-white"
              onClick={onNavigate}
            >
              <span>{link.label}</span>
              {link.comingSoon ? (
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

  return (
    <section className="border-t border-[var(--border)] pt-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">{title}</p>
      <div className="grid gap-1">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-2 text-[13px] text-slate-300 transition hover:translate-y-[-1px] hover:scale-[1.02] hover:text-white"
            onClick={(event) => {
              if (link.href !== "/mail") return;
              event.preventDefault();
              window.dispatchEvent(new Event("theta-mail-open"));
            }}
          >
            <span>{link.label}</span>
            {link.comingSoon ? (
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
