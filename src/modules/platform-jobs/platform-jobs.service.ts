import { PlatformJobStatus, type PlatformJob, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";

const MODULE_KEY = "platform-jobs";

export type PlatformJobHandlerResult = {
  ok: boolean;
  result?: Prisma.InputJsonValue;
  error?: string;
};

export type PlatformJobHandler = (job: PlatformJob) => Promise<PlatformJobHandlerResult>;

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

export async function claimNextPlatformJob(workerId: string, kinds?: string[]) {
  const now = new Date();
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
      startedAt: now
    }
  });

  if (claimed.count !== 1) return null;

  return prisma.platformJob.findUnique({ where: { id: job.id } });
}

export async function completePlatformJob(jobId: string, result?: Prisma.InputJsonValue) {
  return prisma.platformJob.update({
    where: { id: jobId },
    data: {
      status: PlatformJobStatus.SUCCEEDED,
      result: result ?? undefined,
      error: null,
      completedAt: new Date()
    }
  });
}

export async function failPlatformJob(jobId: string, error: string, retryDelayMs = 30_000) {
  const job = await prisma.platformJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const nextAttempts = job.attempts + 1;
  const shouldRetry = nextAttempts < job.maxAttempts;

  return prisma.platformJob.update({
    where: { id: jobId },
    data: {
      status: shouldRetry ? PlatformJobStatus.PENDING : PlatformJobStatus.FAILED,
      attempts: nextAttempts,
      error,
      lockedAt: null,
      lockedBy: null,
      startedAt: shouldRetry ? null : job.startedAt,
      completedAt: shouldRetry ? null : new Date(),
      runAfter: shouldRetry ? new Date(Date.now() + retryDelayMs) : job.runAfter
    }
  });
}

export async function cancelPlatformJob(jobId: string, reason: string) {
  return prisma.platformJob.update({
    where: { id: jobId },
    data: {
      status: PlatformJobStatus.CANCELLED,
      error: reason,
      completedAt: new Date()
    }
  });
}

export const platformJobHandlers: Record<string, PlatformJobHandler> = {
  "platform.health.noop": async (job) => ({
    ok: true,
    result: {
      jobId: job.id,
      checkedAt: new Date().toISOString()
    }
  })
};

export async function runOnePlatformJob(workerId: string, kinds?: string[]) {
  const job = await claimNextPlatformJob(workerId, kinds);
  if (!job) return { ran: false as const };

  const handler = platformJobHandlers[job.kind];
  if (!handler) {
    await cancelPlatformJob(job.id, `No worker handler is registered for job kind "${job.kind}".`);
    return { ran: true as const, jobId: job.id, ok: false as const };
  }

  try {
    const result = await handler(job);
    if (result.ok) {
      await completePlatformJob(job.id, result.result);
      return { ran: true as const, jobId: job.id, ok: true as const };
    }

    await failPlatformJob(job.id, result.error ?? "Worker job failed.");
    return { ran: true as const, jobId: job.id, ok: false as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker job crashed.";
    await diagnostics.error(MODULE_KEY, "Worker job crashed.", { jobId: job.id, kind: job.kind, error: message });
    await failPlatformJob(job.id, message);
    return { ran: true as const, jobId: job.id, ok: false as const };
  }
}
