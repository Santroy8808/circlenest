CREATE TABLE IF NOT EXISTS "WriterManuscriptSubscription" (
  "id" TEXT NOT NULL,
  "manuscriptId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "notify" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WriterManuscriptSubscription_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "WriterManuscriptSubscription"
    ADD CONSTRAINT "WriterManuscriptSubscription_manuscriptId_fkey"
    FOREIGN KEY ("manuscriptId") REFERENCES "WriterManuscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "WriterManuscriptSubscription"
    ADD CONSTRAINT "WriterManuscriptSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "WriterManuscriptSubscription_manuscriptId_userId_key" ON "WriterManuscriptSubscription"("manuscriptId", "userId");
CREATE INDEX IF NOT EXISTS "WriterManuscriptSubscription_userId_updatedAt_idx" ON "WriterManuscriptSubscription"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "WriterManuscriptSubscription_manuscriptId_notify_idx" ON "WriterManuscriptSubscription"("manuscriptId", "notify");

ALTER TABLE "AdCampaign"
  ADD COLUMN IF NOT EXISTS "subscriberTargetManuscriptId" TEXT;

DO $$
BEGIN
  ALTER TABLE "AdCampaign"
    ADD CONSTRAINT "AdCampaign_subscriberTargetManuscriptId_fkey"
    FOREIGN KEY ("subscriberTargetManuscriptId") REFERENCES "WriterManuscript"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "AdCampaign_subscriberTargetManuscriptId_createdAt_idx" ON "AdCampaign"("subscriberTargetManuscriptId", "createdAt");
