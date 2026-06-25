CREATE TABLE IF NOT EXISTS "UserApplicationUsageMetric" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mobileActivityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "desktopActivityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reservedStreamOrganicUnits" INTEGER NOT NULL DEFAULT 0,
  "reservedStreamAdImpressions" INTEGER NOT NULL DEFAULT 0,
  "reservedStreamOrganicUnitsAtLastAd" INTEGER NOT NULL DEFAULT 0,
  "lastSeenAt" TIMESTAMP(3),
  "lastMobileSeenAt" TIMESTAMP(3),
  "lastDesktopSeenAt" TIMESTAMP(3),
  "lastReservedStreamAdAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserApplicationUsageMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserApplicationUsageMetric_userId_key"
  ON "UserApplicationUsageMetric"("userId");

CREATE INDEX IF NOT EXISTS "UserApplicationUsageMetric_lastSeenAt_idx"
  ON "UserApplicationUsageMetric"("lastSeenAt");

CREATE INDEX IF NOT EXISTS "UserApplicationUsageMetric_lastMobileSeenAt_idx"
  ON "UserApplicationUsageMetric"("lastMobileSeenAt");

CREATE INDEX IF NOT EXISTS "UserApplicationUsageMetric_lastDesktopSeenAt_idx"
  ON "UserApplicationUsageMetric"("lastDesktopSeenAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserApplicationUsageMetric_userId_fkey'
  ) THEN
    ALTER TABLE "UserApplicationUsageMetric"
      ADD CONSTRAINT "UserApplicationUsageMetric_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "PlatformCostRule"
SET "description" = 'Adaptive promoted stream placement for web and mobile feed use. Viewer exposure varies by use and is capped at 5% of stream experience.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'ads.reservedStream.1d';
