-- Controlled, individually grantable bulk invitation delivery.
CREATE TYPE "BulkInviteBatchStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

CREATE TABLE "BulkInviteBatch" (
  "id" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "requestedCount" INTEGER NOT NULL,
  "acceptedCount" INTEGER NOT NULL,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "status" "BulkInviteBatchStatus" NOT NULL DEFAULT 'QUEUED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BulkInviteBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FreeAccountInviteCode"
  ADD COLUMN "bulkBatchId" TEXT,
  ADD COLUMN "deliveryCodeCiphertext" TEXT;

CREATE INDEX "BulkInviteBatch_createdByUserId_createdAt_idx" ON "BulkInviteBatch"("createdByUserId", "createdAt");
CREATE INDEX "BulkInviteBatch_status_createdAt_idx" ON "BulkInviteBatch"("status", "createdAt");
CREATE INDEX "FreeAccountInviteCode_bulkBatchId_createdAt_idx" ON "FreeAccountInviteCode"("bulkBatchId", "createdAt");

ALTER TABLE "BulkInviteBatch"
  ADD CONSTRAINT "BulkInviteBatch_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FreeAccountInviteCode"
  ADD CONSTRAINT "FreeAccountInviteCode_bulkBatchId_fkey"
  FOREIGN KEY ("bulkBatchId") REFERENCES "BulkInviteBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
