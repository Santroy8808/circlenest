-- AlterTable
ALTER TABLE "PublicAnnouncement" ADD COLUMN "dismissedAt" TIMESTAMP(3),
ADD COLUMN "dismissedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "PublicAnnouncement_dismissedAt_createdAt_idx" ON "PublicAnnouncement"("dismissedAt", "createdAt");
