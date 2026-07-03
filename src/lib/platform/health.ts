import { prisma } from "@/lib/platform/db";
import { safeReadPlatformEnv } from "@/lib/platform/env";
import { isR2Configured, readR2Config } from "@/lib/platform/r2";
import { getPlatformReleaseInfo, type PlatformReleaseInfo } from "@/lib/platform/release";

export type HealthCheckResult = {
  name: string;
  status: "healthy" | "degraded" | "offline" | "unknown";
  message: string;
  critical?: boolean;
  latencyMs?: number;
};

export type PlatformHealthReport = {
  ok: boolean;
  status: "healthy" | "degraded" | "offline";
  checkedAt: string;
  release: PlatformReleaseInfo;
  checks: HealthCheckResult[];
};

async function timedCheck(name: string, critical: boolean, check: () => Promise<HealthCheckResult>): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  try {
    const result = await check();
    return { ...result, name, critical, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      name,
      critical,
      status: "offline",
      message: error instanceof Error ? error.message : "Health check failed.",
      latencyMs: Date.now() - startedAt
    };
  }
}

async function checkRedis(): Promise<HealthCheckResult> {
  const env = safeReadPlatformEnv();
  if (!env.success) {
    return { name: "redis", status: "unknown", message: "Redis check skipped because environment validation failed." };
  }

  const restUrl = env.data.UPSTASH_REDIS_REST_URL;
  const token = env.data.UPSTASH_REDIS_REST_TOKEN;

  if (restUrl && token) {
    const response = await fetch(`${restUrl.replace(/\/$/, "")}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1500)
    });

    if (!response.ok) {
      return { name: "redis", status: "degraded", message: `Redis REST ping returned ${response.status}.` };
    }

    return { name: "redis", status: "healthy", message: "Redis REST ping succeeded." };
  }

  if (env.data.REDIS_URL) {
    return {
      name: "redis",
      status: "unknown",
      message: "REDIS_URL is present, but no Redis client is installed for an active readiness probe."
    };
  }

  return { name: "redis", status: "unknown", message: "Redis is not configured. Cache features should run in DB fallback mode." };
}

export async function getPlatformHealthChecks(): Promise<HealthCheckResult[]> {
  const checks: HealthCheckResult[] = [];
  const env = safeReadPlatformEnv();

  checks.push({
    name: "environment",
    status: env.success ? "healthy" : "degraded",
    critical: true,
    message: env.success ? "Required environment shape is valid." : env.error.issues.map((issue) => issue.path.join(".")).join(", ")
  });

  checks.push(await timedCheck("postgres", true, async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "postgres", status: "healthy", message: "Database connection succeeded." };
  }));

  const r2 = env.success ? readR2Config() : null;

  checks.push({
    name: "cloudflare-r2",
    critical: false,
    status: r2 && isR2Configured(r2) ? "healthy" : "unknown",
    message: r2 && isR2Configured(r2) ? "R2 configuration is present." : "R2 endpoint, bucket, or credentials are not complete yet."
  });

  checks.push(await timedCheck("redis", false, checkRedis));

  return checks;
}

export async function getPlatformHealth(): Promise<HealthCheckResult[]> {
  return getPlatformHealthChecks();
}

export async function getPlatformHealthReport(): Promise<PlatformHealthReport> {
  const checks = await getPlatformHealthChecks();
  const criticalFailure = checks.some((check) => check.critical && check.status !== "healthy");
  const degraded = checks.some((check) => check.status === "degraded" || check.status === "unknown");

  return {
    ok: !criticalFailure,
    status: criticalFailure ? "offline" : degraded ? "degraded" : "healthy",
    checkedAt: new Date().toISOString(),
    release: getPlatformReleaseInfo(),
    checks
  };
}
