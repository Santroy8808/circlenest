ALTER TABLE "PublicAnnouncement"
  ADD COLUMN "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByUserId" TEXT;

CREATE INDEX "PublicAnnouncement_cancelledAt_scheduledFor_idx"
  ON "PublicAnnouncement"("cancelledAt", "scheduledFor");

ALTER TABLE "PublicAnnouncement"
  ADD CONSTRAINT "PublicAnnouncement_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
