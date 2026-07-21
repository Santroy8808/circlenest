import assert from "node:assert/strict";
import test from "node:test";
import { PlatformJobStatus } from "@prisma/client";
import {
  DEFAULT_PLATFORM_JOB_LEASE_MS,
  normalizePlatformJobLeaseMs,
  platformJobHeartbeatIntervalMs,
  platformJobLeaseWhere,
  stalePlatformJobClaimWhere
} from "@/modules/platform-jobs/platform-jobs.service";

test("lease settings always leave multiple heartbeat opportunities before expiry", () => {
  assert.equal(normalizePlatformJobLeaseMs(undefined), DEFAULT_PLATFORM_JOB_LEASE_MS);
  assert.equal(normalizePlatformJobLeaseMs("not-a-number"), DEFAULT_PLATFORM_JOB_LEASE_MS);
  assert.equal(normalizePlatformJobLeaseMs(1), 30_000);
  assert.equal(normalizePlatformJobLeaseMs(99 * 60 * 60 * 1000), 60 * 60 * 1000);
  assert.equal(platformJobHeartbeatIntervalMs(5 * 60_000), 60_000);
  assert.equal(platformJobHeartbeatIntervalMs(30_000, 25_000), 10_000);
});

test("every finalization predicate is bound to the exact live claim", () => {
  const now = new Date("2026-07-21T18:00:00.000Z");
  const workerA = platformJobLeaseWhere({
    jobId: "job-1",
    workerId: "worker-a",
    token: "lease-a"
  }, now);
  const workerB = platformJobLeaseWhere({
    jobId: "job-1",
    workerId: "worker-b",
    token: "lease-b"
  }, now);

  assert.deepEqual(workerA, {
    id: "job-1",
    status: PlatformJobStatus.RUNNING,
    lockedBy: "worker-a",
    leaseToken: "lease-a",
    leaseExpiresAt: { gt: now }
  });
  assert.notDeepEqual(workerA, workerB);
});

test("a heartbeat invalidates a stale-recovery snapshot", () => {
  const oldLockedAt = new Date("2026-07-21T18:00:00.000Z");
  const oldExpiry = new Date("2026-07-21T18:05:00.000Z");
  const renewedLockedAt = new Date("2026-07-21T18:04:00.000Z");
  const renewedExpiry = new Date("2026-07-21T18:09:00.000Z");
  const base = {
    id: "job-1",
    status: PlatformJobStatus.RUNNING,
    leaseToken: "lease-a",
    lockedBy: "worker-a"
  };
  const staleSnapshot = stalePlatformJobClaimWhere({
    ...base,
    lockedAt: oldLockedAt,
    leaseExpiresAt: oldExpiry
  });
  const renewedSnapshot = stalePlatformJobClaimWhere({
    ...base,
    lockedAt: renewedLockedAt,
    leaseExpiresAt: renewedExpiry
  });

  assert.deepEqual(staleSnapshot, {
    ...base,
    lockedAt: oldLockedAt,
    leaseExpiresAt: oldExpiry
  });
  assert.notDeepEqual(staleSnapshot, renewedSnapshot);
});

test("a reclaimed job cannot be finalized by its previous worker", () => {
  const now = new Date("2026-07-21T18:10:00.000Z");
  const expiredWorker = platformJobLeaseWhere({
    jobId: "job-1",
    workerId: "worker-a",
    token: "expired-claim"
  }, now);
  const currentWorker = platformJobLeaseWhere({
    jobId: "job-1",
    workerId: "worker-b",
    token: "current-claim"
  }, now);

  assert.equal(expiredWorker.lockedBy, "worker-a");
  assert.equal(expiredWorker.leaseToken, "expired-claim");
  assert.equal(currentWorker.lockedBy, "worker-b");
  assert.equal(currentWorker.leaseToken, "current-claim");
});
