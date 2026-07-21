BEGIN;

-- Serialize the deploy with the preflight, including the already-removed path.
SELECT pg_advisory_xact_lock(
  hashtextextended('20260721132000_remove_plaintext_stripe_secrets', 0)
);

-- Hold the config table through the guard and contract change so an older
-- application process cannot reintroduce plaintext between those statements.
LOCK TABLE "StripeIntegrationConfig" IN ACCESS EXCLUSIVE MODE;

-- The preflight writes its receipt to AuditLog in the same transaction that
-- scrubs the legacy values. Protect those receipts from later mutation.
CREATE OR REPLACE FUNCTION "prevent_stripe_secret_migration_receipt_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $receipt_function$
BEGIN
  IF OLD."operationId" = 'stripe-secret-migration:20260721132000_remove_plaintext_stripe_secrets:verified-and-scrubbed' THEN
    RAISE EXCEPTION 'Stripe secret migration audit receipts are immutable';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."operationId" = 'stripe-secret-migration:20260721132000_remove_plaintext_stripe_secrets:verified-and-scrubbed' THEN
      RAISE EXCEPTION 'Stripe secret migration audit receipts are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$receipt_function$;

CREATE OR REPLACE FUNCTION "prevent_stripe_secret_migration_receipt_truncate"()
RETURNS trigger
LANGUAGE plpgsql
AS $receipt_truncate_function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AuditLog"
    WHERE "operationId" = 'stripe-secret-migration:20260721132000_remove_plaintext_stripe_secrets:verified-and-scrubbed'
  ) THEN
    RAISE EXCEPTION 'Stripe secret migration audit receipts are immutable';
  END IF;
  RETURN NULL;
END;
$receipt_truncate_function$;

DROP TRIGGER IF EXISTS "AuditLog_stripe_secret_migration_receipt_immutable" ON "AuditLog";
CREATE TRIGGER "AuditLog_stripe_secret_migration_receipt_immutable"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION "prevent_stripe_secret_migration_receipt_mutation"();
ALTER TABLE "AuditLog"
  ENABLE ALWAYS TRIGGER "AuditLog_stripe_secret_migration_receipt_immutable";

DROP TRIGGER IF EXISTS "AuditLog_stripe_secret_migration_receipt_no_truncate" ON "AuditLog";
CREATE TRIGGER "AuditLog_stripe_secret_migration_receipt_no_truncate"
BEFORE TRUNCATE ON "AuditLog"
FOR EACH STATEMENT
EXECUTE FUNCTION "prevent_stripe_secret_migration_receipt_truncate"();
ALTER TABLE "AuditLog"
  ENABLE ALWAYS TRIGGER "AuditLog_stripe_secret_migration_receipt_no_truncate";

-- Trust the receipt only while both trigger names are enabled, have the exact
-- event shape, and are bound to the guard functions recreated above.
DO $receipt_guard_verification$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS t
    WHERE t.tgrelid = '"AuditLog"'::regclass
      AND t.tgname = 'AuditLog_stripe_secret_migration_receipt_immutable'
      AND t.tgenabled = 'A'
      AND t.tgtype = 27
      AND t.tgfoid = '"prevent_stripe_secret_migration_receipt_mutation"()'::regprocedure
      AND NOT t.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS t
    WHERE t.tgrelid = '"AuditLog"'::regclass
      AND t.tgname = 'AuditLog_stripe_secret_migration_receipt_no_truncate'
      AND t.tgenabled = 'A'
      AND t.tgtype = 34
      AND t.tgfoid = '"prevent_stripe_secret_migration_receipt_truncate"()'::regprocedure
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Refusing Stripe secret migration because immutable receipt guards are invalid.';
  END IF;
END;
$receipt_guard_verification$;

-- Require the deterministic, non-secret preflight receipt. Handle both legacy
-- columns together so this contract migration is safe to rerun after success
-- and refuses every partial schema state.
DO $plaintext_contract$
DECLARE
  secret_key_column_exists boolean;
  webhook_secret_column_exists boolean;
  secret_key_reference_column_exists boolean;
  webhook_secret_reference_column_exists boolean;
  receipt_is_valid boolean;
  plaintext_remains boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'StripeIntegrationConfig'
      AND column_name = 'secretKey'
  ) INTO secret_key_column_exists;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'StripeIntegrationConfig'
      AND column_name = 'webhookSecret'
  ) INTO webhook_secret_column_exists;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'StripeIntegrationConfig'
      AND column_name = 'secretKeyEnvVar'
  ) INTO secret_key_reference_column_exists;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'StripeIntegrationConfig'
      AND column_name = 'webhookSecretEnvVar'
  ) INTO webhook_secret_reference_column_exists;

  IF NOT secret_key_reference_column_exists OR NOT webhook_secret_reference_column_exists THEN
    RAISE EXCEPTION 'Refusing Stripe secret migration because environment-reference columns are missing.';
  END IF;
  IF secret_key_column_exists <> webhook_secret_column_exists THEN
    RAISE EXCEPTION 'Refusing Stripe secret migration because legacy columns are in a partial state.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "AuditLog"
    WHERE "id" = 'stripe-secret-migration-receipt:20260721132000_remove_plaintext_stripe_secrets'
      AND "operationId" = 'stripe-secret-migration:20260721132000_remove_plaintext_stripe_secrets:verified-and-scrubbed'
      AND "module" = 'billing'
      AND "action" = 'STRIPE_SECRET_MIGRATION_PREFLIGHT'
      AND "targetType" = 'DatabaseMigration'
      AND "targetId" = '20260721132000_remove_plaintext_stripe_secrets'
      AND "severity" = 'info'
      AND "outcome" = 'SUCCESS'
      AND "retentionClass" = 'VITAL'
      AND "actorUserId" IS NULL
      AND "requestId" IS NULL
      AND "before" IS NULL
      AND "after" IS NULL
      AND "metadata" @> '{
        "receiptVersion": 1,
        "migrationId": "20260721132000_remove_plaintext_stripe_secrets",
        "result": "VERIFIED_AND_SCRUBBED",
        "secretMaterialRecorded": false
      }'::jsonb
      AND ("metadata" - ARRAY[
        'receiptVersion',
        'migrationId',
        'result',
        'configCount',
        'secretKeyCount',
        'webhookSecretCount',
        'referenceUpdateCount',
        'secretMaterialRecorded'
      ]) = '{}'::jsonb
      AND jsonb_typeof("metadata"->'configCount') = 'number'
      AND jsonb_typeof("metadata"->'secretKeyCount') = 'number'
      AND jsonb_typeof("metadata"->'webhookSecretCount') = 'number'
      AND jsonb_typeof("metadata"->'referenceUpdateCount') = 'number'
      AND ("metadata"->>'configCount') ~ '^(0|[1-9][0-9]*)$'
      AND ("metadata"->>'secretKeyCount') ~ '^(0|[1-9][0-9]*)$'
      AND ("metadata"->>'webhookSecretCount') ~ '^(0|[1-9][0-9]*)$'
      AND ("metadata"->>'referenceUpdateCount') ~ '^(0|[1-9][0-9]*)$'
  ) INTO receipt_is_valid;
  IF NOT receipt_is_valid THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Refusing to drop legacy Stripe secret columns without a valid immutable preflight receipt.',
      HINT = 'Run npm run db:stripe-secrets:preflight with the production server environment, then retry migrations.';
  END IF;

  IF secret_key_column_exists THEN
    EXECUTE '
      SELECT EXISTS (
        SELECT 1
        FROM "StripeIntegrationConfig"
        WHERE "secretKey" IS NOT NULL OR "webhookSecret" IS NOT NULL
      )
    ' INTO plaintext_remains;
    IF plaintext_remains THEN
      RAISE EXCEPTION USING
        MESSAGE = 'Refusing to drop legacy Stripe secret columns while plaintext values remain.',
        HINT = 'Run npm run db:stripe-secrets:preflight with the production server environment, then retry migrations.';
    END IF;

    EXECUTE '
      ALTER TABLE "StripeIntegrationConfig"
        DROP COLUMN "secretKey",
        DROP COLUMN "webhookSecret"
    ';
  END IF;
END;
$plaintext_contract$;

COMMIT;
