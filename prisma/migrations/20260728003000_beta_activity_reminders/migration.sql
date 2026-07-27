ALTER TABLE "User"
ADD COLUMN "betaReminderStartedAt" TIMESTAMP(3),
ADD COLUMN "betaReminderEndsAt" TIMESTAMP(3),
ADD COLUMN "betaReminderLastSentAt" TIMESTAMP(3);

UPDATE "User"
SET
  "betaReminderStartedAt" = "createdAt",
  "betaReminderEndsAt" = "createdAt" + INTERVAL '90 days'
WHERE "isBetaTester" = true
  AND lower("email") <> 'mike@santroy.com';

CREATE INDEX "User_betaReminderEndsAt_betaReminderLastSentAt_idx"
ON "User"("betaReminderEndsAt", "betaReminderLastSentAt");
