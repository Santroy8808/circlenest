ALTER TABLE "Alert"
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT;

CREATE INDEX "Alert_sourceType_sourceId_idx" ON "Alert"("sourceType", "sourceId");
