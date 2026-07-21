import "./load-next-env";
import { Prisma, PrismaClient } from "@prisma/client";

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 5_000;

function parseBatchSize(value: string | undefined): number {
  if (!value) return DEFAULT_BATCH_SIZE;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_BATCH_SIZE) {
    throw new Error(`--batch must be an integer from 1 through ${MAX_BATCH_SIZE}.`);
  }
  return parsed;
}

async function countLegacyRows(transaction: Prisma.TransactionClient): Promise<number> {
  const [row] = await transaction.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS "count"
    FROM "FeedPost"
    WHERE "visibility"::text = 'MEMBERS'
  `;
  return row ? Number(row.count) : 0;
}

async function backfillBatch(transaction: Prisma.TransactionClient, batchSize: number): Promise<number> {
  return transaction.$executeRaw`
    WITH batch AS (
      SELECT "id"
      FROM "FeedPost"
      WHERE "visibility"::text = 'MEMBERS'
      ORDER BY "id"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "FeedPost" AS post
    SET "visibility" = 'PUBLIC'::"FeedVisibility"
    FROM batch
    WHERE post."id" = batch."id"
  `;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const batchArgument = process.argv.find((argument) => argument.startsWith("--batch="));
  const batchSize = parseBatchSize(batchArgument?.slice("--batch=".length));
  const prisma = new PrismaClient();

  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        if (apply) {
          // Prevent a legacy writer from inserting MEMBERS between the final
          // update and verification. This command is intended for the planned
          // deployment maintenance window after legacy processes are stopped.
          await transaction.$executeRawUnsafe('LOCK TABLE "FeedPost" IN SHARE ROW EXCLUSIVE MODE');
        }

        const before = await countLegacyRows(transaction);
        if (!apply) return { mode: "dry-run" as const, before, updated: 0, remaining: before };

        let updated = 0;
        for (;;) {
          const batchUpdated = await backfillBatch(transaction, batchSize);
          updated += batchUpdated;
          if (batchUpdated < batchSize) break;
        }

        const remaining = await countLegacyRows(transaction);
        if (remaining !== 0) {
          throw new Error(`Public Stream visibility backfill is incomplete: ${remaining} legacy rows remain.`);
        }
        return { mode: "apply" as const, before, updated, remaining };
      },
      { timeout: 15 * 60 * 1000 }
    );

    console.log(
      JSON.stringify(
        result.mode === "dry-run"
          ? {
              mode: result.mode,
              legacyRows: result.before,
              batchSize,
              next: "Stop legacy application/worker processes, then run again with --apply."
            }
          : { ...result, batchSize }
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
