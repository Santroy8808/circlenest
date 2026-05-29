"use client";

import { usePathname, useRouter } from "next/navigation";

export function CommunicateLauncher() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <button
      type="button"
      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[13px] font-semibold text-black hover:translate-y-[-1px] hover:scale-[1.03]"
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
      Communicate!
    </button>
  );
}
