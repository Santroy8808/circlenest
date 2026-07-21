-- OPERATOR PRECONDITION: Quiesce every worker that can claim `account-cleanup`
-- PlatformJob rows before applying this migration. The migration aborts while any
-- such job is RUNNING; reconcile those jobs before retrying.
BEGIN;

-- Keep ordinary reads available, but block worker claims and all writes until the
-- duplicate cleanup and its enforcing index commit together.
LOCK TABLE "DestructiveActionRequest", "PlatformJob" IN EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PlatformJob"
    WHERE "kind" = 'account-cleanup'
      AND "status" = 'RUNNING'
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Cannot enforce account-deletion uniqueness while account-cleanup jobs are RUNNING.',
      HINT = 'Quiesce account-cleanup workers, reconcile every RUNNING job to a terminal state, and retry the migration.';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TYPE "DestructiveStorageAction" AS ENUM ('DELETE', 'PRESERVE');
CREATE TYPE "DestructiveStorageStatus" AS ENUM ('PLANNED', 'DELETE_ACKNOWLEDGED', 'VERIFIED', 'FAILED');
CREATE TYPE "DestructiveStorageAccess" AS ENUM ('PUBLIC', 'PRIVATE');

ALTER TABLE "AdCampaign"
  ADD COLUMN "targetSnapshot" JSONB,
  ADD COLUMN "targetSnapshotAt" TIMESTAMP(3);

CREATE TABLE "DestructiveActionStorageObject" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "access" "DestructiveStorageAccess" NOT NULL,
  "action" "DestructiveStorageAction" NOT NULL,
  "status" "DestructiveStorageStatus" NOT NULL DEFAULT 'PLANNED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "attemptedAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DestructiveActionStorageObject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestructiveActionStorageObject_requestId_access_storageKey_key"
  ON "DestructiveActionStorageObject"("requestId", "access", "storageKey");
CREATE INDEX "DestructiveActionStorageObject_requestId_action_status_idx"
  ON "DestructiveActionStorageObject"("requestId", "action", "status");
CREATE INDEX "DestructiveActionStorageObject_status_updatedAt_idx"
  ON "DestructiveActionStorageObject"("status", "updatedAt");
ALTER TABLE "DestructiveActionStorageObject"
  ADD CONSTRAINT "DestructiveActionStorageObject_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "DestructiveActionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforceDestructiveStorageManifestImmutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "DestructiveActionRequest"
      WHERE "id" = NEW."requestId"
        AND "status" = 'PENDING_CONFIRMATION'
        AND ("result" IS NULL OR NOT ("result" ? 'storageManifest'))
    ) THEN
      RAISE EXCEPTION 'Destructive-action storage manifests can only be built once before confirmation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Destructive-action storage manifest rows cannot be deleted';
  END IF;

  IF ROW(
    NEW."requestId",
    NEW."sourceType",
    NEW."sourceId",
    NEW."storageKey",
    NEW."access",
    NEW."action",
    NEW."metadata",
    NEW."retentionClass"
  ) IS DISTINCT FROM ROW(
    OLD."requestId",
    OLD."sourceType",
    OLD."sourceId",
    OLD."storageKey",
    OLD."access",
    OLD."action",
    OLD."metadata",
    OLD."retentionClass"
  ) THEN
    RAISE EXCEPTION 'Destructive-action storage manifests are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DestructiveActionStorageObject_manifest_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "DestructiveActionStorageObject"
  FOR EACH ROW
  EXECUTE FUNCTION "enforceDestructiveStorageManifestImmutable"();

CREATE TEMP TABLE "account_deletion_duplicates_20260721135000"
ON COMMIT DROP
AS
WITH ranked AS (
  SELECT
    "id",
    "platformJobId",
    ROW_NUMBER() OVER (
      PARTITION BY "kind", "targetType", "targetId"
      ORDER BY
        CASE "status"
          WHEN 'RUNNING' THEN 1
          WHEN 'QUEUED' THEN 2
          WHEN 'CONFIRMED' THEN 3
          ELSE 4
        END,
        "updatedAt" DESC,
        "createdAt" DESC,
        "id" DESC
    ) AS duplicate_rank
  FROM "DestructiveActionRequest"
  WHERE "kind" = 'DELETE_ACCOUNT'
    AND "status" IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'QUEUED', 'RUNNING')
)
SELECT
  "id" AS "requestId",
  "platformJobId"
FROM ranked
WHERE duplicate_rank > 1;

-- PlatformJobStatus has no QUEUED value: schedulable jobs behind QUEUED requests
-- are PENDING. Cancel those linked jobs before making their requests terminal.
UPDATE "PlatformJob" AS job
SET
  "status" = 'CANCELLED',
  "lockedAt" = NULL,
  "lockedBy" = NULL,
  "leaseToken" = NULL,
  "leaseExpiresAt" = NULL,
  "error" = 'Cancelled while enforcing one active account-deletion request per target.',
  "completedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
FROM pg_temp."account_deletion_duplicates_20260721135000" AS duplicate
WHERE job."id" = duplicate."platformJobId"
  AND job."status" = 'PENDING';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PlatformJob" AS job
    INNER JOIN pg_temp."account_deletion_duplicates_20260721135000" AS duplicate
      ON duplicate."platformJobId" = job."id"
    WHERE job."status" IN ('PENDING', 'RUNNING')
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'A duplicate account-deletion request still has an executable PlatformJob.',
      HINT = 'Reconcile the linked job and retry the migration with account-cleanup workers quiesced.';
  END IF;
END;
$$ LANGUAGE plpgsql;

UPDATE "DestructiveActionRequest" AS request
SET
  "status" = 'CANCELLED',
  "error" = 'Cancelled while enforcing one active account-deletion request per target.',
  "completedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
FROM pg_temp."account_deletion_duplicates_20260721135000" AS duplicate
WHERE request."id" = duplicate."requestId";

CREATE UNIQUE INDEX "DestructiveActionRequest_one_active_account_delete_per_target"
  ON "DestructiveActionRequest"("kind", "targetType", "targetId")
  WHERE "kind" = 'DELETE_ACCOUNT'
    AND "status" IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'QUEUED', 'RUNNING');

COMMIT;
