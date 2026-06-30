"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ShellCounts = {
  alerts: number;
  mail: number;
  messages: number;
  notifications: number;
};

const zeroCounts: ShellCounts = {
  alerts: 0,
  mail: 0,
  messages: 0,
  notifications: 0
};

const ShellCountsContext = createContext<ShellCounts>(zeroCounts);

export function ShellCountsProvider({
  children,
  enabled,
  initialCounts = zeroCounts
}: {
  children: React.ReactNode;
  enabled: boolean;
  initialCounts?: ShellCounts;
}) {
  const [counts, setCounts] = useState(initialCounts);

  useEffect(() => {
    if (!enabled) {
      setCounts(zeroCounts);
      return;
    }

    let cancelled = false;

    async function loadCounts() {
      const response = await fetch("/api/shell/counts", { cache: "no-store" }).catch(() => null);
      if (!response?.ok || cancelled) return;

      const payload = (await response.json().catch(() => null)) as { counts?: ShellCounts } | null;
      if (payload?.counts && !cancelled) {
        setCounts(payload.counts);
      }
    }

    void loadCounts();
    const timer = window.setInterval(loadCounts, 45000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  const value = useMemo(() => counts, [counts]);

  return <ShellCountsContext.Provider value={value}>{children}</ShellCountsContext.Provider>;
}

export function useShellCounts(fallback?: ShellCounts) {
  const counts = useContext(ShellCountsContext);
  return fallback && counts === zeroCounts ? fallback : counts;
}

export { zeroCounts };
