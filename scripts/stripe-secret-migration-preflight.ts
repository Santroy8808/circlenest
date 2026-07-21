import { Prisma, PrismaClient } from "@prisma/client";
import {
  assessStripeSecretMigrationReceipt,
  assessStripeSecretColumns,
  isValidStripeSecretMigrationReceipt,
  type LegacyStripeSecretRow,
  planStripeSecretMigration,
  safeStripeSecretPreflightFailure,
  STRIPE_SECRET_MIGRATION_ID,
  STRIPE_SECRET_MIGRATION_RECEIPT,
  StripeSecretPreflightError,
  type StripeSecretMigrationReceiptRecord
} from "./stripe-secret-migration-plan";

type ColumnRow = { columnName: string };
type ExistsRow = { exists: boolean };
type ReceiptGuardRow = { rowGuardValid: boolean; truncateGuardValid: boolean };

type PreflightResult =
  | { status: "already-removed" }
  | {
      status: "verified-and-scrubbed";
      configCount: number;
      secretKeyCount: number;
      webhookSecretCount: number;
      receiptId: string;
      receiptCreated: boolean;
    };

async function installAndVerifyReceiptGuards(transaction: Prisma.TransactionClient) {
  await transaction.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION "prevent_stripe_secret_migration_receipt_mutation"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $receipt_function$
    BEGIN
      IF OLD."operationId" = '${STRIPE_SECRET_MIGRATION_RECEIPT.operationId}' THEN
        RAISE EXCEPTION 'Stripe secret migration audit receipts are immutable';
      END IF;
      IF TG_OP = 'UPDATE' THEN
        IF NEW."operationId" = '${STRIPE_SECRET_MIGRATION_RECEIPT.operationId}' THEN
          RAISE EXCEPTION 'Stripe secret migration audit receipts are immutable';
        END IF;
      END IF;
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END;
    $receipt_function$
  `);
  await transaction.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION "prevent_stripe_secret_migration_receipt_truncate"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $receipt_truncate_function$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM "AuditLog"
        WHERE "operationId" = '${STRIPE_SECRET_MIGRATION_RECEIPT.operationId}'
      ) THEN
        RAISE EXCEPTION 'Stripe secret migration audit receipts are immutable';
      END IF;
      RETURN NULL;
    END;
    $receipt_truncate_function$
  `);
  await transaction.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS "AuditLog_stripe_secret_migration_receipt_immutable" ON "AuditLog"'
  );
  await transaction.$executeRawUnsafe(`
    CREATE TRIGGER "AuditLog_stripe_secret_migration_receipt_immutable"
    BEFORE UPDATE OR DELETE ON "AuditLog"
    FOR EACH ROW
    EXECUTE FUNCTION "prevent_stripe_secret_migration_receipt_mutation"()
  `);
  await transaction.$executeRawUnsafe(
    'ALTER TABLE "AuditLog" ENABLE ALWAYS TRIGGER "AuditLog_stripe_secret_migration_receipt_immutable"'
  );
  await transaction.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS "AuditLog_stripe_secret_migration_receipt_no_truncate" ON "AuditLog"'
  );
  await transaction.$executeRawUnsafe(`
    CREATE TRIGGER "AuditLog_stripe_secret_migration_receipt_no_truncate"
    BEFORE TRUNCATE ON "AuditLog"
    FOR EACH STATEMENT
    EXECUTE FUNCTION "prevent_stripe_secret_migration_receipt_truncate"()
  `);
  await transaction.$executeRawUnsafe(
    'ALTER TABLE "AuditLog" ENABLE ALWAYS TRIGGER "AuditLog_stripe_secret_migration_receipt_no_truncate"'
  );

  const [guards] = await transaction.$queryRaw<ReceiptGuardRow[]>`
    SELECT
      EXISTS (
        SELECT 1
        FROM pg_trigger AS t
        WHERE t.tgrelid = '"AuditLog"'::regclass
          AND t.tgname = 'AuditLog_stripe_secret_migration_receipt_immutable'
          AND t.tgenabled = 'A'
          AND t.tgtype = 27
          AND t.tgfoid = '"prevent_stripe_secret_migration_receipt_mutation"()'::regprocedure
          AND NOT t.tgisinternal
      ) AS "rowGuardValid",
      EXISTS (
        SELECT 1
        FROM pg_trigger AS t
        WHERE t.tgrelid = '"AuditLog"'::regclass
          AND t.tgname = 'AuditLog_stripe_secret_migration_receipt_no_truncate'
          AND t.tgenabled = 'A'
          AND t.tgtype = 34
          AND t.tgfoid = '"prevent_stripe_secret_migration_receipt_truncate"()'::regprocedure
          AND NOT t.tgisinternal
      ) AS "truncateGuardValid"
  `;
  if (!guards?.rowGuardValid || !guards.truncateGuardValid) {
    throw new StripeSecretPreflightError("RECEIPT_GUARD_INVALID");
  }
}

async function readExistingReceipt(transaction: Prisma.TransactionClient) {
  const receipts = await transaction.$queryRaw<StripeSecretMigrationReceiptRecord[]>`
    SELECT
      "id",
      "operationId",
      "module",
      "action",
      "targetType",
      "targetId",
      "severity"::text AS "severity",
      "outcome"::text AS "outcome",
      "retentionClass"::text AS "retentionClass",
      "actorUserId",
      "requestId",
      "before" IS NULL AS "beforeIsNull",
      "after" IS NULL AS "afterIsNull",
      "metadata"
    FROM "AuditLog"
    WHERE "operationId" = ${STRIPE_SECRET_MIGRATION_RECEIPT.operationId}
       OR "id" = ${STRIPE_SECRET_MIGRATION_RECEIPT.id}
    FOR SHARE
  `;
  if (receipts.length > 1) {
    throw new StripeSecretPreflightError("RECEIPT_INVALID");
  }
  return receipts[0] ?? null;
}

async function runPreflight(prisma: PrismaClient): Promise<PreflightResult> {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw<{ lock: string }[]>`
        SELECT pg_advisory_xact_lock(hashtextextended(${STRIPE_SECRET_MIGRATION_ID}, 0))::text AS "lock"
      `;

      const [table] = await transaction.$queryRaw<ExistsRow[]>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'StripeIntegrationConfig'
        ) AS "exists"
      `;
      if (!table?.exists) {
        throw new StripeSecretPreflightError("SCHEMA_INVALID");
      }

      await transaction.$executeRawUnsafe('LOCK TABLE "StripeIntegrationConfig" IN ACCESS EXCLUSIVE MODE');

      const columns = await transaction.$queryRaw<ColumnRow[]>`
        SELECT column_name AS "columnName"
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'StripeIntegrationConfig'
      `;
      const columnAssessment = assessStripeSecretColumns(columns.map((column) => column.columnName));
      await installAndVerifyReceiptGuards(transaction);
      const existingReceipt = await readExistingReceipt(transaction);
      const receiptAssessment = assessStripeSecretMigrationReceipt(existingReceipt);
      if (columnAssessment.status === "already-removed") {
        if (receiptAssessment.status !== "reuse") {
          throw new StripeSecretPreflightError("RECEIPT_INVALID");
        }
        return { status: "already-removed" };
      }

      const rows = await transaction.$queryRaw<LegacyStripeSecretRow[]>`
        SELECT
          "id",
          "secretKey",
          "webhookSecret",
          "secretKeyEnvVar",
          "webhookSecretEnvVar"
        FROM "StripeIntegrationConfig"
        ORDER BY "id"
        FOR UPDATE
      `;
      const plans = planStripeSecretMigration(rows, process.env);

      const needsConfigUpdate = rows.some((row) => row.secretKey !== null || row.webhookSecret !== null) ||
        plans.some((plan) => plan.referenceChanged);
      if (needsConfigUpdate) {
        for (const plan of plans) {
          const updated = await transaction.$executeRaw`
            UPDATE "StripeIntegrationConfig"
            SET
              "secretKeyEnvVar" = ${plan.secretKeyEnvVar},
              "webhookSecretEnvVar" = ${plan.webhookSecretEnvVar},
              "secretKey" = NULL,
              "webhookSecret" = NULL
            WHERE "id" = ${plan.id}
          `;
          if (updated !== 1) {
            throw new StripeSecretPreflightError("CONCURRENT_CHANGE");
          }
        }
      }

      const [remaining] = await transaction.$queryRaw<{ hasRemaining: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM "StripeIntegrationConfig"
          WHERE "secretKey" IS NOT NULL OR "webhookSecret" IS NOT NULL
        ) AS "hasRemaining"
      `;
      if (!remaining || remaining.hasRemaining) {
        throw new StripeSecretPreflightError("SCRUB_VERIFICATION_FAILED");
      }

      const secretKeyCount = plans.filter((plan) => plan.secretKeyHadLegacyValue).length;
      const webhookSecretCount = plans.filter((plan) => plan.webhookSecretHadLegacyValue).length;
      let receiptCreated = false;
      if (receiptAssessment.status === "create") {
        const metadata = JSON.stringify({
          receiptVersion: STRIPE_SECRET_MIGRATION_RECEIPT.receiptVersion,
          migrationId: STRIPE_SECRET_MIGRATION_ID,
          result: STRIPE_SECRET_MIGRATION_RECEIPT.result,
          configCount: plans.length,
          secretKeyCount,
          webhookSecretCount,
          referenceUpdateCount: plans.filter((plan) => plan.referenceChanged).length,
          secretMaterialRecorded: false
        });
        await transaction.$executeRaw`
          INSERT INTO "AuditLog" (
            "id",
            "operationId",
            "module",
            "action",
            "targetType",
            "targetId",
            "severity",
            "outcome",
            "retentionClass",
            "metadata"
          ) VALUES (
            ${STRIPE_SECRET_MIGRATION_RECEIPT.id},
            ${STRIPE_SECRET_MIGRATION_RECEIPT.operationId},
            ${STRIPE_SECRET_MIGRATION_RECEIPT.module},
            ${STRIPE_SECRET_MIGRATION_RECEIPT.action},
            ${STRIPE_SECRET_MIGRATION_RECEIPT.targetType},
            ${STRIPE_SECRET_MIGRATION_RECEIPT.targetId},
            'info'::"AuditSeverity",
            'SUCCESS'::"AuditOutcome",
            'VITAL'::"RecordRetentionClass",
            ${metadata}::jsonb
          )
        `;
        receiptCreated = true;
      }

      const persistedReceipt = await readExistingReceipt(transaction);
      if (!isValidStripeSecretMigrationReceipt(persistedReceipt)) {
        throw new StripeSecretPreflightError("RECEIPT_INVALID");
      }

      return {
        status: "verified-and-scrubbed",
        configCount: plans.length,
        secretKeyCount,
        webhookSecretCount,
        receiptId: STRIPE_SECRET_MIGRATION_RECEIPT.id,
        receiptCreated
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 60_000
    }
  );
}

async function main() {
  let prisma: PrismaClient | null = null;
  try {
    await import("./load-next-env");
    prisma = new PrismaClient();
    const result = await runPreflight(prisma);
    if (result.status === "already-removed") {
      console.info("[stripe-secret-preflight] Legacy Stripe secret columns are already removed; no action was needed.");
      return;
    }
    const receiptAction = result.receiptCreated ? "recorded" : "reused";
    console.info(
      `[stripe-secret-preflight] Verified and scrubbed ${result.configCount} Stripe config row(s); ` +
      `${receiptAction} immutable receipt ${result.receiptId}.`
    );
  } catch (error) {
    const failure = safeStripeSecretPreflightFailure(error);
    console.error(`[stripe-secret-preflight] FAILED [${failure.code}]: ${failure.message}`);
    process.exitCode = 1;
  } finally {
    if (prisma) {
      try {
        await prisma.$disconnect();
      } catch {
        console.error("[stripe-secret-preflight] FAILED [DISCONNECT_ERROR]: Database cleanup failed.");
        process.exitCode = 1;
      }
    }
  }
}

void main().catch(() => {
  console.error("[stripe-secret-preflight] FAILED [UNEXPECTED_RUNTIME_ERROR]: The preflight process failed safely.");
  process.exitCode = 1;
});
