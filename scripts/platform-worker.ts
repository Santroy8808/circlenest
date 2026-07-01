import { randomUUID } from "crypto";
import { prisma } from "@/lib/platform/db";
import { runOnePlatformJob } from "@/modules/platform-jobs/platform-jobs.service";

const workerId = process.env.PLATFORM_WORKER_ID ?? `worker-${randomUUID()}`;
const once = process.argv.includes("--once");
const idleDelayMs = Number.parseInt(process.env.PLATFORM_WORKER_IDLE_MS ?? "2000", 10);
let shuttingDown = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("SIGINT", () => {
  shuttingDown = true;
});

process.on("SIGTERM", () => {
  shuttingDown = true;
});

async function main() {
  console.log(`[platform-worker] started ${workerId}`);

  do {
    const result = await runOnePlatformJob(workerId);
    if (once) break;
    if (!result.ran) await sleep(idleDelayMs);
  } while (!shuttingDown);

  await prisma.$disconnect();
  console.log(`[platform-worker] stopped ${workerId}`);
}

main().catch(async (error) => {
  console.error("[platform-worker] fatal", error);
  await prisma.$disconnect();
  process.exit(1);
});
