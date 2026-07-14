-- Feed stream retention and administrator hold metadata.
ALTER TABLE "FeedPost"
  ADD COLUMN "lastViewedAt" TIMESTAMP(3),
  ADD COLUMN "streamCompressedAt" TIMESTAMP(3),
  ADD COLUMN "streamArchivedAt" TIMESTAMP(3),
  ADD COLUMN "streamDeletedAt" TIMESTAMP(3),
  ADD COLUMN "adminHoldAt" TIMESTAMP(3),
  ADD COLUMN "adminHoldByUserId" TEXT,
  ADD COLUMN "adminHoldReason" TEXT,
  ADD COLUMN "adminHoldThread" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "FeedPost"
  ADD CONSTRAINT "FeedPost_adminHoldByUserId_fkey"
  FOREIGN KEY ("adminHoldByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "FeedPost"
SET "lastViewedAt" = "createdAt"
WHERE "lastViewedAt" IS NULL;

CREATE INDEX "FeedPost_visibility_streamArchivedAt_streamDeletedAt_createdAt_idx"
  ON "FeedPost"("visibility", "streamArchivedAt", "streamDeletedAt", "createdAt");

CREATE INDEX "FeedPost_adminHoldAt_createdAt_idx"
  ON "FeedPost"("adminHoldAt", "createdAt");

CREATE INDEX "FeedPost_streamArchivedAt_createdAt_idx"
  ON "FeedPost"("streamArchivedAt", "createdAt");

CREATE INDEX "FeedPost_streamDeletedAt_createdAt_idx"
  ON "FeedPost"("streamDeletedAt", "createdAt");

CREATE INDEX "FeedPost_lastViewedAt_createdAt_idx"
  ON "FeedPost"("lastViewedAt", "createdAt");
