const DEFAULT_SLOW_MS = Number(process.env.THETA_SERVER_TIMING_THRESHOLD_MS ?? 150);

type TimingMeta = Record<string, string | number | boolean | null | undefined>;

function cleanMeta(meta?: TimingMeta) {
  if (!meta) return undefined;
  return Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined));
}

export async function timeServerStep<T>(label: string, operation: Promise<T> | (() => Promise<T>), meta?: TimingMeta): Promise<T> {
  const startedAt = performance.now();

  try {
    const result = await (typeof operation === "function" ? operation() : operation);
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= DEFAULT_SLOW_MS || process.env.THETA_SERVER_TIMING === "1") {
      console.info("[theta.server-timing]", { label, durationMs, ...cleanMeta(meta) });
    }
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    console.warn("[theta.server-timing.error]", {
      label,
      durationMs,
      error: error instanceof Error ? error.message : "unknown",
      ...cleanMeta(meta)
    });
    throw error;
  }
}
