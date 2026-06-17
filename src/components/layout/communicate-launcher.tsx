"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

export function CommunicateLauncher({
  fullWidth = false,
  avatarUrl,
  displayName,
}: {
  fullWidth?: boolean;
  avatarUrl?: string | null;
  displayName?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const prompt = "Communicate something!";

  return (
    <button
      type="button"
      className={fullWidth
        ? "w-full rounded-md border border-[var(--border)] bg-[#111827] px-3 py-2 text-left shadow-sm transition hover:border-slate-500"
        : "rounded-md border border-[var(--border)] bg-[#0f1624] px-2 py-1 text-[12px] font-semibold text-slate-200 hover:translate-y-[-1px] hover:scale-[1.03]"}
      onClick={() => {
        sessionStorage.setItem("theta-space:compose-once", "1");
        if (pathname === "/home") {
          window.dispatchEvent(new Event("theta-space:open-communicate"));
          window.setTimeout(() => window.dispatchEvent(new Event("theta-space:open-communicate")), 120);
          return;
        }
        router.push("/home");
      }}
    >
      {fullWidth ? (
        <span className="flex items-center gap-3">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[#1f2937]">
            {avatarUrl ? <Image src={avatarUrl} alt="Your avatar" fill sizes="40px" className="object-cover" /> : null}
          </span>
          <span className="flex-1 rounded-full bg-[#2a2d34] px-4 py-2 text-[clamp(14px,3.6vw,17px)] text-slate-400">
            {prompt}
          </span>
        </span>
      ) : "Communicate"}
    </button>
  );
}
