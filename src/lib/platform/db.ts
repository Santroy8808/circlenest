import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaQueryTimingAttached?: boolean;
};

const queryLogsEnabled = process.env.PRISMA_QUERY_LOGS_ENABLED === "true" || process.env.PLATFORM_LOG_LEVEL === "debug";
const slowQueryMs = Number.parseInt(process.env.PRISMA_SLOW_QUERY_MS ?? "250", 10);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: queryLogsEnabled
      ? [
          { emit: "event", level: "query" },
          { emit: "stdout", level: "warn" },
          { emit: "stdout", level: "error" }
        ]
      : ["warn", "error"]
  });

if (queryLogsEnabled && !globalForPrisma.prismaQueryTimingAttached) {
  const prismaWithQueryEvents = prisma as unknown as {
    $on: (
      eventName: "query",
      callback: (event: { duration: number; target: string; query: string }) => void
    ) => void;
  };

  prismaWithQueryEvents.$on("query", (event) => {
    if (event.duration >= slowQueryMs) {
      console.warn("[db:slow-query]", {
        durationMs: event.duration,
        target: event.target,
        query: event.query.replace(/\s+/g, " ").slice(0, 500)
      });
    }
  });
  globalForPrisma.prismaQueryTimingAttached = true;
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
