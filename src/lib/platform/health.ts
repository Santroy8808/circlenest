import { prisma } from "@/lib/platform/db";
import { safeReadPlatformEnv } from "@/lib/platform/env";

export type HealthCheckResult = {
  name: string;
  status: "healthy" | "degraded" | "offline" | "unknown";
  message: string;
};

export async function getPlatformHealth(): Promise<HealthCheckResult[]> {
  const checks: HealthCheckResult[] = [];
  const env = safeReadPlatformEnv();

  checks.push({
    name: "environment",
    status: env.success ? "healthy" : "degraded",
    message: env.success ? "Required environment shape is valid." : env.error.issues.map((issue) => issue.path.join(".")).join(", ")
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ name: "postgres", status: "healthy", message: "Database connection succeeded." });
  } catch (error) {
    checks.push({
      name: "postgres",
      status: "offline",
      message: error instanceof Error ? error.message : "Database connection failed."
    });
  }

  checks.push({
    name: "cloudflare-r2",
    status:
      process.env.CLOUDFLARE_R2_ACCOUNT_ID && process.env.CLOUDFLARE_R2_BUCKET
        ? "healthy"
        : "unknown",
    message:
      process.env.CLOUDFLARE_R2_ACCOUNT_ID && process.env.CLOUDFLARE_R2_BUCKET
        ? "R2 configuration is present."
        : "R2 configuration is not complete yet."
  });

  return checks;
}

