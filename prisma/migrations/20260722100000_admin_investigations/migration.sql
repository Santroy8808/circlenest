CREATE TYPE "ConductPostFlagStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DISMISSED');
CREATE TYPE "ConductInvestigationStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'NEEDS_REVIEW', 'FAILED');

CREATE TABLE "ConductInvestigation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "status" "ConductInvestigationStatus" NOT NULL DEFAULT 'QUEUED',
    "triggerReason" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "sourcePostIds" TEXT[],
    "sourceSnapshot" JSONB NOT NULL,
    "report" JSONB,
    "summary" TEXT,
    "providerModel" TEXT,
    "providerTokenCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConductInvestigation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConductPostFlag" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "flaggedByUserId" TEXT NOT NULL,
    "investigationId" TEXT,
    "status" "ConductPostFlagStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "flaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConductPostFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConductInvestigation_reference_key" ON "ConductInvestigation"("reference");
CREATE INDEX "ConductInvestigation_subjectUserId_status_createdAt_idx" ON "ConductInvestigation"("subjectUserId", "status", "createdAt");
CREATE INDEX "ConductInvestigation_status_createdAt_idx" ON "ConductInvestigation"("status", "createdAt");
CREATE INDEX "ConductInvestigation_requestedByUserId_createdAt_idx" ON "ConductInvestigation"("requestedByUserId", "createdAt");

CREATE UNIQUE INDEX "ConductPostFlag_postId_key" ON "ConductPostFlag"("postId");
CREATE INDEX "ConductPostFlag_subjectUserId_status_expiresAt_idx" ON "ConductPostFlag"("subjectUserId", "status", "expiresAt");
CREATE INDEX "ConductPostFlag_flaggedByUserId_flaggedAt_idx" ON "ConductPostFlag"("flaggedByUserId", "flaggedAt");
CREATE INDEX "ConductPostFlag_investigationId_flaggedAt_idx" ON "ConductPostFlag"("investigationId", "flaggedAt");

ALTER TABLE "ConductInvestigation"
  ADD CONSTRAINT "ConductInvestigation_subjectUserId_fkey"
  FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConductInvestigation"
  ADD CONSTRAINT "ConductInvestigation_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConductPostFlag"
  ADD CONSTRAINT "ConductPostFlag_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConductPostFlag"
  ADD CONSTRAINT "ConductPostFlag_subjectUserId_fkey"
  FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConductPostFlag"
  ADD CONSTRAINT "ConductPostFlag_flaggedByUserId_fkey"
  FOREIGN KEY ("flaggedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConductPostFlag"
  ADD CONSTRAINT "ConductPostFlag_investigationId_fkey"
  FOREIGN KEY ("investigationId") REFERENCES "ConductInvestigation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
