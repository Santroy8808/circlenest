import { Prisma } from "@prisma/client";
import { isEnabled } from "@/lib/platform/env";
import { prisma } from "@/lib/platform/db";

export type DiagnosticLevel = "debug" | "info" | "warn" | "error";

const levelWeight: Record<DiagnosticLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

type LogInput = {
  level: DiagnosticLevel;
  module: string;
  message: string;
  context?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
};

function shouldLog(level: DiagnosticLevel) {
  if (!isEnabled(process.env.DIAGNOSTIC_LOGS_ENABLED, true)) return false;
  const configured = (process.env.PLATFORM_LOG_LEVEL ?? "info") as DiagnosticLevel;
  return levelWeight[level] >= (levelWeight[configured] ?? levelWeight.info);
}

function withLogTimeout<T>(promise: Promise<T>) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("diagnostic log write timed out")), 1500);
    })
  ]);
}

export async function writeDiagnosticLog(input: LogInput) {
  if (!shouldLog(input.level)) return;

  const payload = {
    level: input.level,
    module: input.module,
    message: input.message,
    context: input.context as Prisma.InputJsonObject | undefined,
    requestId: input.requestId,
    userId: input.userId
  };

  if (process.env.NODE_ENV === "test") {
    console.info(JSON.stringify(payload));
    return;
  }

  try {
    await withLogTimeout(prisma.diagnosticLog.create({ data: payload }));
  } catch (error) {
    console.error("diagnostic-log-write-failed", error, payload);
  }
}

export const diagnostics = {
  debug: (module: string, message: string, context?: Record<string, unknown>) =>
    writeDiagnosticLog({ level: "debug", module, message, context }),
  info: (module: string, message: string, context?: Record<string, unknown>) =>
    writeDiagnosticLog({ level: "info", module, message, context }),
  warn: (module: string, message: string, context?: Record<string, unknown>) =>
    writeDiagnosticLog({ level: "warn", module, message, context }),
  error: (module: string, message: string, context?: Record<string, unknown>) =>
    writeDiagnosticLog({ level: "error", module, message, context })
};
