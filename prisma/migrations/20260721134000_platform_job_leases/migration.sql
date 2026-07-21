-- Platform jobs use renewable, per-claim leases. A lease token changes for every
-- claim so a stale worker can never finalize work claimed by another worker.
ALTER TABLE "PlatformJob"
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

-- Preserve currently-running legacy work for its former one-hour lock window.
-- Legacy rows have no token and are recoverable once this deadline passes.
UPDATE "PlatformJob"
SET "leaseExpiresAt" = COALESCE("lockedAt", "updatedAt") + INTERVAL '1 hour'
WHERE "status" = 'RUNNING'
  AND "leaseExpiresAt" IS NULL;

CREATE INDEX "PlatformJob_status_leaseExpiresAt_idx"
  ON "PlatformJob"("status", "leaseExpiresAt");

CREATE UNIQUE INDEX "PlatformJob_leaseToken_key"
  ON "PlatformJob"("leaseToken");
