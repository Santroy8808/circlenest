import { readPlatformEnv } from "@/lib/platform/env";
import { hashPrivateSignal } from "@/lib/platform/private-signals";

type RateLimitInput = {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
};

type MemoryBucket = {
  count: number;
  resetAt: number;
};

const MAX_MEMORY_BUCKETS = 10_000;
const memoryBuckets = new Map<string, MemoryBucket>();
let cachedUpstashConfig: { url: string; token: string } | null | undefined;

function upstashConfig() {
  if (cachedUpstashConfig !== undefined) return cachedUpstashConfig;
  const env = readPlatformEnv();
  cachedUpstashConfig =
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? { url: env.UPSTASH_REDIS_REST_URL.replace(/\/$/, ""), token: env.UPSTASH_REDIS_REST_TOKEN }
      : null;
  return cachedUpstashConfig;
}

function normalizedInput(input: RateLimitInput) {
  const namespace = input.namespace.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, "-").slice(0, 80);
  const digest = hashPrivateSignal(input.key, `rate-limit:${namespace}`);
  if (!namespace || !digest) throw new Error("Rate-limit namespace and key are required.");

  return {
    namespace,
    digest,
    limit: Math.min(Math.max(Math.trunc(input.limit), 1), 100_000),
    windowMs: Math.min(Math.max(Math.trunc(input.windowMs), 1_000), 24 * 60 * 60 * 1000)
  };
}

function consumeMemoryRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = memoryBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  bucket.count += 1;
  memoryBuckets.set(key, bucket);

  if (memoryBuckets.size > MAX_MEMORY_BUCKETS) {
    for (const [candidateKey, candidate] of memoryBuckets) {
      if (candidate.resetAt <= now) memoryBuckets.delete(candidateKey);
      if (memoryBuckets.size <= MAX_MEMORY_BUCKETS) break;
    }
    while (memoryBuckets.size > MAX_MEMORY_BUCKETS) {
      const oldestKey = memoryBuckets.keys().next().value as string | undefined;
      if (!oldestKey) break;
      memoryBuckets.delete(oldestKey);
    }
  }

  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(limit - bucket.count, 0),
    retryAfterSeconds: Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1),
    resetAt: new Date(bucket.resetAt),
    source: "memory" as const
  };
}

async function consumeUpstashRateLimit(key: string, limit: number, windowMs: number) {
  const config = upstashConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify([
      ["INCR", key],
      ["PEXPIRE", key, windowMs, "NX"],
      ["PTTL", key]
    ]),
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`Rate-limit store returned HTTP ${response.status}.`);
  const results = await response.json() as Array<{ result?: unknown; error?: unknown }>;
  const count = Number(results[0]?.result);
  const ttlMs = Number(results[2]?.result);
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(ttlMs) || ttlMs < 0) {
    throw new Error("Rate-limit store returned an invalid response.");
  }

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(limit - count, 0),
    retryAfterSeconds: Math.max(Math.ceil(ttlMs / 1000), 1),
    resetAt: new Date(Date.now() + ttlMs),
    source: "upstash" as const
  };
}

export async function consumeRateLimit(input: RateLimitInput) {
  const normalized = normalizedInput(input);
  const storageKey = `theta:rate-limit:${normalized.namespace}:${normalized.digest}`;

  try {
    const distributed = await consumeUpstashRateLimit(
      storageKey,
      normalized.limit,
      normalized.windowMs
    );
    if (distributed) return distributed;
  } catch {
    // The in-process limiter remains a safe fallback on the single-host release.
  }

  return consumeMemoryRateLimit(storageKey, normalized.limit, normalized.windowMs);
}

export function rateLimitHeaders(result: {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: Date;
}) {
  return {
    "ratelimit-limit": String(result.limit),
    "ratelimit-remaining": String(result.remaining),
    "ratelimit-reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
    ...(!result.allowed ? { "retry-after": String(result.retryAfterSeconds) } : {})
  };
}
