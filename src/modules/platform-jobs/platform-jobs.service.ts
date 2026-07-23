import { randomUUID } from "node:crypto";
import { DestructiveActionStatus, PlatformJobStatus, type PlatformJob, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";

const MODULE_KEY = "platform-jobs";
const LEGACY_STALE_JOB_LOCK_MS = 60 * 60 * 1000;
export const DEFAULT_PLATFORM_JOB_LEASE_MS = 5 * 60 * 1000;
const MIN_PLATFORM_JOB_LEASE_MS = 30_000;
const MAX_PLATFORM_JOB_LEASE_MS = 60 * 60 * 1000;

export type PlatformJobHandlerResult = {
  ok: boolean;
  result?: Prisma.InputJsonValue;
  error?: string;
  retryable?: boolean;
};

export type PlatformJobLease = Readonly<{
  jobId: string;
  workerId: string;
  token: string;
}>;

export type PlatformJobHandlerContext = Readonly<{
  lease: PlatformJobLease;
  signal: AbortSignal;
  renewLease: () => Promise<boolean>;
  assertLease: () => Promise<void>;
}>;

export type PlatformJobHandler = (
  job: PlatformJob,
  context: PlatformJobHandlerContext
) => Promise<PlatformJobHandlerResult>;

export class PlatformJobLeaseLostError extends Error {
  constructor(jobId: string) {
    super(`Platform job ${jobId} no longer has its claimed worker lease.`);
    this.name = "PlatformJobLeaseLostError";
  }
}

export function normalizePlatformJobLeaseMs(value?: string | number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PLATFORM_JOB_LEASE_MS;
  return Math.min(Math.max(Math.trunc(parsed), MIN_PLATFORM_JOB_LEASE_MS), MAX_PLATFORM_JOB_LEASE_MS);
}

export function platformJobHeartbeatIntervalMs(leaseDurationMs: number, requestedMs?: number) {
  const leaseMs = normalizePlatformJobLeaseMs(leaseDurationMs);
  const maximumSafeInterval = Math.max(1_000, Math.floor(leaseMs / 3));
  const requested = Number.isFinite(requestedMs)
    ? Math.max(1_000, Math.trunc(requestedMs as number))
    : Math.min(60_000, maximumSafeInterval);
  return Math.min(requested, maximumSafeInterval);
}

export function platformJobLeaseWhere(lease: PlatformJobLease, now = new Date()): Prisma.PlatformJobWhereInput {
  return {
    id: lease.jobId,
    status: PlatformJobStatus.RUNNING,
    lockedBy: lease.workerId,
    leaseToken: lease.token,
    leaseExpiresAt: { gt: now }
  };
}

export function stalePlatformJobClaimWhere(
  job: Pick<PlatformJob, "id" | "status" | "leaseToken" | "leaseExpiresAt" | "lockedAt" | "lockedBy">
): Prisma.PlatformJobWhereInput {
  return {
    id: job.id,
    status: PlatformJobStatus.RUNNING,
    leaseToken: job.leaseToken,
    leaseExpiresAt: job.leaseExpiresAt,
    lockedAt: job.lockedAt,
    lockedBy: job.lockedBy
  };
}

export function platformJobRetryDelayMs(previousAttempts: number) {
  return Math.min(30_000 * (2 ** Math.max(0, previousAttempts)), 60 * 60 * 1000);
}

export async function enqueuePlatformJob(input: {
  kind: string;
  payload?: Prisma.InputJsonValue;
  runAfter?: Date;
  maxAttempts?: number;
}) {
  return prisma.platformJob.create({
    data: {
      kind: input.kind,
      payload: input.payload ?? undefined,
      runAfter: input.runAfter ?? new Date(),
      maxAttempts: input.maxAttempts ?? 5
    }
  });
}

export async function recoverStalePlatformJobs(now = new Date()) {
  const staleJobs = await prisma.platformJob.findMany({
    where: {
      status: PlatformJobStatus.RUNNING,
      OR: [
        { leaseExpiresAt: { lte: now } },
        {
          leaseExpiresAt: null,
          lockedAt: { lte: new Date(now.getTime() - LEGACY_STALE_JOB_LOCK_MS) }
        }
      ]
    },
    orderBy: [{ leaseExpiresAt: "asc" }, { lockedAt: "asc" }],
    take: 50
  });
  let requeued = 0;
  let failed = 0;

  for (const job of staleJobs) {
    const nextAttempts = job.attempts + 1;
    const terminal = nextAttempts >= job.maxAttempts;
    const error = "Worker lease expired before completion.";
    const recovered = await prisma.$transaction(async (tx) => {
      const updated = await tx.platformJob.updateMany({
        where: stalePlatformJobClaimWhere(job),
        data: {
          status: terminal ? PlatformJobStatus.FAILED : PlatformJobStatus.PENDING,
          attempts: nextAttempts,
          error,
          lockedAt: null,
          lockedBy: null,
          leaseToken: null,
          leaseExpiresAt: null,
          startedAt: terminal ? job.startedAt : null,
          completedAt: terminal ? now : null,
          runAfter: terminal ? job.runAfter : now
        }
      });
      if (updated.count !== 1) return false;

      await tx.destructiveActionRequest.updateMany({
        where: {
          platformJobId: job.id,
          status: terminal
            ? { in: [DestructiveActionStatus.QUEUED, DestructiveActionStatus.RUNNING] }
            : DestructiveActionStatus.RUNNING
        },
        data: terminal
          ? { status: DestructiveActionStatus.FAILED, failedAt: now, error }
          : { status: DestructiveActionStatus.QUEUED, error }
      });
      return true;
    });
    if (!recovered) continue;
    if (terminal) failed += 1;
    else requeued += 1;
  }

  return { examined: staleJobs.length, requeued, failed };
}

export async function claimNextPlatformJob(
  workerId: string,
  kinds?: string[],
  options?: { leaseDurationMs?: number }
) {
  await recoverStalePlatformJobs();
  const now = new Date();
  const leaseDurationMs = normalizePlatformJobLeaseMs(options?.leaseDurationMs);
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
  const job = await prisma.platformJob.findFirst({
    where: {
      status: PlatformJobStatus.PENDING,
      runAfter: { lte: now },
      ...(kinds?.length ? { kind: { in: kinds } } : {})
    },
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }]
  });

  if (!job) return null;

  const claimed = await prisma.platformJob.updateMany({
    where: {
      id: job.id,
      status: PlatformJobStatus.PENDING
    },
    data: {
      status: PlatformJobStatus.RUNNING,
      lockedAt: now,
      lockedBy: workerId,
      leaseToken,
      leaseExpiresAt,
      startedAt: now
    }
  });

  if (claimed.count !== 1) return null;

  return prisma.platformJob.findFirst({
    where: { id: job.id, status: PlatformJobStatus.RUNNING, lockedBy: workerId, leaseToken }
  });
}

export async function renewPlatformJobLease(
  lease: PlatformJobLease,
  leaseDurationMs = DEFAULT_PLATFORM_JOB_LEASE_MS,
  now = new Date()
) {
  const expiresAt = new Date(now.getTime() + normalizePlatformJobLeaseMs(leaseDurationMs));
  const renewed = await prisma.platformJob.updateMany({
    where: platformJobLeaseWhere(lease, now),
    data: {
      lockedAt: now,
      leaseExpiresAt: expiresAt
    }
  });
  return renewed.count === 1;
}

export async function assertPlatformJobLease(lease: PlatformJobLease, now = new Date()) {
  const job = await prisma.platformJob.findFirst({
    where: platformJobLeaseWhere(lease, now),
    select: { id: true }
  });
  if (!job) throw new PlatformJobLeaseLostError(lease.jobId);
}

export async function completePlatformJob(
  lease: PlatformJobLease,
  result?: Prisma.InputJsonValue,
  now = new Date()
) {
  const completed = await prisma.platformJob.updateMany({
    where: platformJobLeaseWhere(lease, now),
    data: {
      status: PlatformJobStatus.SUCCEEDED,
      result: result ?? undefined,
      error: null,
      lockedAt: null,
      lockedBy: null,
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: now
    }
  });
  return completed.count === 1;
}

export async function failPlatformJob(
  lease: PlatformJobLease,
  error: string,
  retryDelayMs = 30_000,
  now = new Date(),
  options: { retryable?: boolean } = {}
) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.platformJob.findFirst({ where: platformJobLeaseWhere(lease, now) });
    if (!job) return { updated: false as const, retried: false as const };

    const nextAttempts = job.attempts + 1;
    const shouldRetry = platformJobFailureShouldRetry(job, options.retryable);
    const failedAt = shouldRetry ? null : now;

    const updated = await tx.platformJob.updateMany({
      where: { ...platformJobLeaseWhere(lease, now), attempts: job.attempts },
      data: {
        status: shouldRetry ? PlatformJobStatus.PENDING : PlatformJobStatus.FAILED,
        attempts: nextAttempts,
        error,
        lockedAt: null,
        lockedBy: null,
        leaseToken: null,
        leaseExpiresAt: null,
        startedAt: shouldRetry ? null : job.startedAt,
        completedAt: failedAt,
        runAfter: shouldRetry ? new Date(now.getTime() + retryDelayMs) : job.runAfter
      }
    });
    if (updated.count !== 1) return { updated: false as const, retried: false as const };
    await tx.destructiveActionRequest.updateMany({
      where: {
        platformJobId: lease.jobId,
        status: { in: [DestructiveActionStatus.QUEUED, DestructiveActionStatus.RUNNING] }
      },
      data: shouldRetry
        ? { status: DestructiveActionStatus.QUEUED, error }
        : { status: DestructiveActionStatus.FAILED, failedAt, error }
    });
    return { updated: true as const, retried: shouldRetry };
  });
}

export function platformJobFailureShouldRetry(
  job: Pick<PlatformJob, "attempts" | "maxAttempts">,
  retryable = true
) {
  return retryable && job.attempts + 1 < job.maxAttempts;
}

export async function cancelPlatformJob(lease: PlatformJobLease, reason: string, now = new Date()) {
  const cancelled = await prisma.platformJob.updateMany({
    where: platformJobLeaseWhere(lease, now),
    data: {
      status: PlatformJobStatus.CANCELLED,
      error: reason,
      lockedAt: null,
      lockedBy: null,
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: now
    }
  });
  return cancelled.count === 1;
}

function leaseFromClaimedJob(job: PlatformJob): PlatformJobLease {
  if (!job.lockedBy || !job.leaseToken || !job.leaseExpiresAt) {
    throw new Error(`Claimed platform job ${job.id} does not contain a durable lease.`);
  }
  return { jobId: job.id, workerId: job.lockedBy, token: job.leaseToken };
}

function startPlatformJobHeartbeat(input: {
  lease: PlatformJobLease;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
}) {
  const controller = new AbortController();
  let stopped = false;
  let leaseLost = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const schedule = () => {
    if (stopped || leaseLost) return;
    timer = setTimeout(() => {
      inFlight = renewPlatformJobLease(input.lease, input.leaseDurationMs)
        .then((renewed) => {
          if (!renewed) {
            leaseLost = true;
            controller.abort(new PlatformJobLeaseLostError(input.lease.jobId));
          }
        })
        .catch(async (error) => {
          await diagnostics.warn(MODULE_KEY, "Platform job lease heartbeat failed.", {
            jobId: input.lease.jobId,
            workerId: input.lease.workerId,
            error: error instanceof Error ? error.message : "Unknown heartbeat failure."
          });
        })
        .finally(schedule);
    }, input.heartbeatIntervalMs);
  };

  schedule();
  return {
    signal: controller.signal,
    wasLeaseLost: () => leaseLost,
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await inFlight;
    }
  };
}

export const platformJobHandlers: Record<string, PlatformJobHandler> = {
  "platform.health.noop": async (job) => ({
    ok: true,
    result: {
      jobId: job.id,
      checkedAt: new Date().toISOString()
    }
  }),
  "membership.bulk-invite-email": async (job) => {
    const { deliverQueuedBulkInvite } = await import("@/modules/membership-policy/free-account-invites.service");
    return deliverQueuedBulkInvite(job);
  },
  "conduct.scan": async (job) => {
    const { runConductScanPlatformJob } = await import("@/modules/conduct-reporting/scanner.service");
    return runConductScanPlatformJob(job);
  },
  "conduct.investigation": async (job) => {
    const { runConductInvestigationPlatformJob } = await import("@/modules/conduct-reporting/investigation.service");
    return runConductInvestigationPlatformJob(job);
  },
  "account.data-cleanup.v1": async (job, context) => {
    const { runAccountDataCleanupPlatformJob } = await import("@/modules/admin-moderation/account-cleanup.service");
    return runAccountDataCleanupPlatformJob(job, context);
  },
  "gallery.media-delete.v1": async (job, context) => {
    const { runGalleryMediaDeletionPlatformJob } = await import(
      "@/modules/gallery-media-storage/gallery-media-deletion.service"
    );
    return runGalleryMediaDeletionPlatformJob(job, context);
  }
};

export async function runOnePlatformJob(
  workerId: string,
  kinds?: string[],
  options?: { leaseDurationMs?: number; heartbeatIntervalMs?: number }
) {
  const leaseDurationMs = normalizePlatformJobLeaseMs(options?.leaseDurationMs);
  const heartbeatIntervalMs = platformJobHeartbeatIntervalMs(
    leaseDurationMs,
    options?.heartbeatIntervalMs
  );
  const job = await claimNextPlatformJob(workerId, kinds, { leaseDurationMs });
  if (!job) return { ran: false as const };
  const lease = leaseFromClaimedJob(job);

  const handler = platformJobHandlers[job.kind];
  if (!handler) {
    const cancelled = await cancelPlatformJob(
      lease,
      `No worker handler is registered for job kind "${job.kind}".`
    );
    return {
      ran: true as const,
      jobId: job.id,
      ok: false as const,
      ...(cancelled ? {} : { leaseLost: true as const })
    };
  }

  const heartbeat = startPlatformJobHeartbeat({ lease, leaseDurationMs, heartbeatIntervalMs });
  const context: PlatformJobHandlerContext = {
    lease,
    signal: heartbeat.signal,
    renewLease: () => renewPlatformJobLease(lease, leaseDurationMs),
    assertLease: () => assertPlatformJobLease(lease)
  };

  try {
    const result = await handler(job, context);
    if (result.ok) {
      const completed = await completePlatformJob(lease, result.result);
      return completed
        ? { ran: true as const, jobId: job.id, ok: true as const }
        : { ran: true as const, jobId: job.id, ok: false as const, leaseLost: true as const };
    }

    const retryDelayMs = platformJobRetryDelayMs(job.attempts);
    const failed = await failPlatformJob(
      lease,
      result.error ?? "Worker job failed.",
      retryDelayMs,
      new Date(),
      { retryable: result.retryable }
    );
    return {
      ran: true as const,
      jobId: job.id,
      ok: false as const,
      ...(!failed.updated || heartbeat.wasLeaseLost() ? { leaseLost: true as const } : {})
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker job crashed.";
    const leaseLost = error instanceof PlatformJobLeaseLostError || heartbeat.wasLeaseLost();
    await diagnostics[leaseLost ? "warn" : "error"](
      MODULE_KEY,
      leaseLost ? "Platform job stopped after losing its worker lease." : "Worker job crashed.",
      { jobId: job.id, kind: job.kind, error: message }
    );
    const retryDelayMs = platformJobRetryDelayMs(job.attempts);
    const failed = await failPlatformJob(lease, message, retryDelayMs);
    return {
      ran: true as const,
      jobId: job.id,
      ok: false as const,
      ...(!failed.updated || leaseLost ? { leaseLost: true as const } : {})
    };
  } finally {
    await heartbeat.stop();
  }
}
