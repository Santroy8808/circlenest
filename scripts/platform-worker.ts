import "./load-next-env";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/platform/db";
import {
  cleanupRejectedOrExpiredUploadIntents,
  expireStaleUploadIntents
} from "@/modules/media/upload-intent.service";
import {
  normalizePlatformJobLeaseMs,
  platformJobHeartbeatIntervalMs,
  runOnePlatformJob
} from "@/modules/platform-jobs/platform-jobs.service";
import { enqueueDueConductScans } from "@/modules/conduct-reporting/scanner.service";
import { runOneAnnouncementDelivery } from "@/modules/admin-moderation/delivery-outbox.service";
import { allocateContributorMonthlyCredits } from "@/modules/membership-policy/monthly-credits.service";

const workerId = process.env.PLATFORM_WORKER_ID ?? `worker-${randomUUID()}`;
const once = process.argv.includes("--once");
const idleDelayMs = Number.parseInt(process.env.PLATFORM_WORKER_IDLE_MS ?? "2000", 10);
const platformJobLeaseMs = normalizePlatformJobLeaseMs(process.env.PLATFORM_JOB_LEASE_MS);
const platformJobHeartbeatMs = platformJobHeartbeatIntervalMs(
  platformJobLeaseMs,
  Number.parseInt(process.env.PLATFORM_JOB_HEARTBEAT_MS ?? "", 10)
);
const configuredUploadMaintenanceIntervalMs = Number.parseInt(
  process.env.UPLOAD_INTENT_MAINTENANCE_MS ?? "60000",
  10
);
const uploadMaintenanceIntervalMs = Number.isFinite(configuredUploadMaintenanceIntervalMs)
  ? Math.max(configuredUploadMaintenanceIntervalMs, 30_000)
  : 60_000;
let shuttingDown = false;
let lastUploadMaintenanceAt = 0;
let lastConductScheduleCheckAt = 0;
let lastMonthlyCreditCheckAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("SIGINT", () => {
  shuttingDown = true;
});

process.on("SIGTERM", () => {
  shuttingDown = true;
});

async function runUploadIntentMaintenance(force = false) {
  const now = Date.now();
  if (!force && now - lastUploadMaintenanceAt < uploadMaintenanceIntervalMs) return;
  lastUploadMaintenanceAt = now;

  const expired = await expireStaleUploadIntents({ take: 100 });
  const cleaned = await cleanupRejectedOrExpiredUploadIntents({ take: 100 });
  if (expired.expiredCount > 0 || cleaned.cleanedCount > 0) {
    console.log(
      `[platform-worker] upload maintenance expired=${expired.expiredCount} cleaned=${cleaned.cleanedCount}`
    );
  }
}

async function runConductScheduleCheck(force = false) {
  const now = Date.now();
  if (!force && now - lastConductScheduleCheckAt < 60_000) return;
  lastConductScheduleCheckAt = now;
  const queued = await enqueueDueConductScans(new Date(now));
  if (queued.length > 0) console.log(`[platform-worker] queued conduct reviews ${queued.join(", ")}`);
}

async function runMonthlyCreditCheck(force = false) {
  const now = Date.now();
  if (!force && now - lastMonthlyCreditCheckAt < 60 * 60_000) return;
  lastMonthlyCreditCheckAt = now;
  const result = await allocateContributorMonthlyCredits(new Date(now));
  if (result.allocated > 0) {
    console.log(`[platform-worker] allocated contributor credits to ${result.allocated} members`);
  }
}

async function main() {
  console.log(`[platform-worker] started ${workerId}`);

  do {
    await runUploadIntentMaintenance(lastUploadMaintenanceAt === 0);
    await runConductScheduleCheck(lastConductScheduleCheckAt === 0);
    await runMonthlyCreditCheck(lastMonthlyCreditCheckAt === 0);
    const announcement = await runOneAnnouncementDelivery(workerId);
    const result = await runOnePlatformJob(workerId, undefined, {
      leaseDurationMs: platformJobLeaseMs,
      heartbeatIntervalMs: platformJobHeartbeatMs
    });
    if (once) break;
    if (!announcement.ran && !result.ran) await sleep(idleDelayMs);
  } while (!shuttingDown);

  await prisma.$disconnect();
  console.log(`[platform-worker] stopped ${workerId}`);
}

main().catch(async (error) => {
  console.error("[platform-worker] fatal", error);
  await prisma.$disconnect();
  process.exit(1);
});
