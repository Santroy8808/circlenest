-- CreateEnum
CREATE TYPE "ConductIncidentSource" AS ENUM ('MEMBER_REPORT', 'MODERATOR_REPORT', 'ADMIN_REPORT', 'AUTOMATED_REVIEW');

-- CreateEnum
CREATE TYPE "ConductLocationType" AS ENUM ('MAIN_STREAM_POST', 'MAIN_STREAM_COMMENT', 'GROUP_FORUM_THREAD', 'GROUP_FORUM_POST', 'GROUP_ASSET_COMMENT', 'DISPUTE_STATEMENT');

-- CreateEnum
CREATE TYPE "ConductIncidentStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'DISPUTED', 'RESOLVED', 'DISMISSED', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ConductReportStatus" AS ENUM ('ACTIVE', 'UNDER_REVIEW', 'DISPUTED', 'RESOLVED', 'DISMISSED', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ConductReportType" AS ENUM ('MANUAL', 'AUTOMATED', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ConductCommendationStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ConductDisputeStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ConductReviewStatus" AS ENUM ('PENDING', 'ASSIGNED', 'APPROVED', 'DISMISSED', 'NEEDS_CONTEXT');

-- CreateEnum
CREATE TYPE "ConductScanMode" AS ENUM ('MANUAL', 'AUTOMATIC', 'SCHEDULED', 'BACKFILL');

-- CreateEnum
CREATE TYPE "ConductScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ConductConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "manualEnabled" BOOLEAN NOT NULL DEFAULT true,
    "automaticEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduledEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scannerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "shadowMode" BOOLEAN NOT NULL DEFAULT true,
    "createAutomatedReports" BOOLEAN NOT NULL DEFAULT false,
    "sendAutomatedWarnings" BOOLEAN NOT NULL DEFAULT false,
    "applyAutomatedRestrictions" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "scheduleLocalTime" TEXT NOT NULL DEFAULT '02:00',
    "automaticIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
    "maxItemsPerRun" INTEGER NOT NULL DEFAULT 500,
    "maxItemsPerDay" INTEGER NOT NULL DEFAULT 2000,
    "maxBackfillDays" INTEGER NOT NULL DEFAULT 30,
    "contextBefore" INTEGER NOT NULL DEFAULT 3,
    "contextAfter" INTEGER NOT NULL DEFAULT 3,
    "primaryModel" TEXT NOT NULL DEFAULT 'gpt-5.6-luna',
    "fallbackModel" TEXT NOT NULL DEFAULT 'gpt-5.6-terra',
    "providerCallBudget" INTEGER NOT NULL DEFAULT 100,
    "tokenBudget" INTEGER NOT NULL DEFAULT 250000,
    "estimatedCostBudgetUsd" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "reviewThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "triggerDictionary" JSONB,
    "policyVersion" TEXT NOT NULL DEFAULT 'conduct-v1',
    "notificationTemplates" JSONB,
    "restrictionDurations" JSONB,
    "restrictionDecayDays" INTEGER NOT NULL DEFAULT 30,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConductConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConductIncident" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "source" "ConductIncidentSource" NOT NULL,
    "locationType" "ConductLocationType" NOT NULL,
    "groupId" TEXT,
    "subjectContentId" TEXT NOT NULL,
    "subjectAuthorUserId" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "evidenceSnapshot" JSONB NOT NULL,
    "evidenceHashes" JSONB NOT NULL,
    "evidenceContentIds" TEXT[],
    "policyCodes" TEXT[],
    "status" "ConductIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT,
    "assignedModeratorUserId" TEXT,
    "modelMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConductIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConductReport" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "type" "ConductReportType" NOT NULL,
    "status" "ConductReportStatus" NOT NULL DEFAULT 'ACTIVE',
    "reasonCode" TEXT NOT NULL,
    "context" TEXT,
    "policyCodes" TEXT[],
    "evidenceContentIds" TEXT[],
    "algorithmicWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ConductReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConductCommendation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "locationType" "ConductLocationType" NOT NULL,
    "groupId" TEXT,
    "contentId" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "commendedUserId" TEXT NOT NULL,
    "submittingUserId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT,
    "status" "ConductCommendationStatus" NOT NULL DEFAULT 'ACTIVE',
    "evidenceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "ConductCommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConductDispute" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "assignedModeratorUserId" TEXT,
    "status" "ConductDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "warningAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "overrideByUserId" TEXT,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConductDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConductDisputeParticipant" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "selectedResolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConductDisputeParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConductDisputeMessage" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkedContentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConductDisputeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConductRestriction" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userLowId" TEXT NOT NULL,
    "userHighId" TEXT NOT NULL,
    "levelDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "restrictedUntil" TIMESTAMP(3) NOT NULL,
    "lastVerifiedConflictAt" TIMESTAMP(3) NOT NULL,
    "lastRestrictionEndedAt" TIMESTAMP(3),
    "decayAppliedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConductRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConductReviewCandidate" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "incidentId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "locationType" "ConductLocationType" NOT NULL,
    "groupId" TEXT,
    "contentId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "contextSnapshot" JSONB NOT NULL,
    "evidenceHashes" JSONB NOT NULL,
    "localSignals" JSONB NOT NULL,
    "providerResult" JSONB,
    "score" DOUBLE PRECISION,
    "policyCodes" TEXT[],
    "status" "ConductReviewStatus" NOT NULL DEFAULT 'PENDING',
    "assignedModeratorUserId" TEXT,
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConductReviewCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConductScanRun" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "mode" "ConductScanMode" NOT NULL,
    "status" "ConductScanStatus" NOT NULL DEFAULT 'QUEUED',
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "requestedByUserId" TEXT,
    "groupId" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "cursorStart" JSONB,
    "cursorEnd" JSONB,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "deduplicatedCount" INTEGER NOT NULL DEFAULT 0,
    "providerCallCount" INTEGER NOT NULL DEFAULT 0,
    "providerTokenCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConductScanRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConductScanState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "cursorCreatedAt" TIMESTAMP(3),
    "cursorContentId" TEXT,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastScheduledAt" TIMESTAMP(3),
    "lastAutomaticAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConductScanState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConductEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT,
    "reportId" TEXT,
    "disputeId" TEXT,
    "restrictionId" TEXT,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConductEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConductIncident_reference_key" ON "ConductIncident"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ConductIncident_fingerprint_key" ON "ConductIncident"("fingerprint");

-- CreateIndex
CREATE INDEX "ConductIncident_subjectAuthorUserId_status_createdAt_idx" ON "ConductIncident"("subjectAuthorUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ConductIncident_locationType_groupId_status_createdAt_idx" ON "ConductIncident"("locationType", "groupId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ConductIncident_assignedModeratorUserId_status_createdAt_idx" ON "ConductIncident"("assignedModeratorUserId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConductReport_reference_key" ON "ConductReport"("reference");

-- CreateIndex
CREATE INDEX "ConductReport_reportedUserId_status_createdAt_idx" ON "ConductReport"("reportedUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ConductReport_reporterUserId_createdAt_idx" ON "ConductReport"("reporterUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ConductReport_incidentId_status_idx" ON "ConductReport"("incidentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConductReport_incidentId_reporterUserId_key" ON "ConductReport"("incidentId", "reporterUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ConductCommendation_reference_key" ON "ConductCommendation"("reference");

-- CreateIndex
CREATE INDEX "ConductCommendation_commendedUserId_status_createdAt_idx" ON "ConductCommendation"("commendedUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ConductCommendation_submittingUserId_createdAt_idx" ON "ConductCommendation"("submittingUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ConductCommendation_locationType_groupId_createdAt_idx" ON "ConductCommendation"("locationType", "groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConductCommendation_contentId_submittingUserId_key" ON "ConductCommendation"("contentId", "submittingUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ConductDispute_reference_key" ON "ConductDispute"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ConductDispute_reportId_key" ON "ConductDispute"("reportId");

-- CreateIndex
CREATE INDEX "ConductDispute_status_assignedModeratorUserId_createdAt_idx" ON "ConductDispute"("status", "assignedModeratorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ConductDispute_openedByUserId_status_createdAt_idx" ON "ConductDispute"("openedByUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ConductDisputeParticipant_userId_selectedResolvedAt_created_idx" ON "ConductDisputeParticipant"("userId", "selectedResolvedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConductDisputeParticipant_disputeId_userId_key" ON "ConductDisputeParticipant"("disputeId", "userId");

-- CreateIndex
CREATE INDEX "ConductDisputeMessage_disputeId_createdAt_idx" ON "ConductDisputeMessage"("disputeId", "createdAt");

-- CreateIndex
CREATE INDEX "ConductDisputeMessage_authorUserId_createdAt_idx" ON "ConductDisputeMessage"("authorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConductRestriction_reference_key" ON "ConductRestriction"("reference");

-- CreateIndex
CREATE INDEX "ConductRestriction_active_restrictedUntil_idx" ON "ConductRestriction"("active", "restrictedUntil");

-- CreateIndex
CREATE INDEX "ConductRestriction_userLowId_active_restrictedUntil_idx" ON "ConductRestriction"("userLowId", "active", "restrictedUntil");

-- CreateIndex
CREATE INDEX "ConductRestriction_userHighId_active_restrictedUntil_idx" ON "ConductRestriction"("userHighId", "active", "restrictedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ConductRestriction_userLowId_userHighId_key" ON "ConductRestriction"("userLowId", "userHighId");

-- CreateIndex
CREATE UNIQUE INDEX "ConductReviewCandidate_reference_key" ON "ConductReviewCandidate"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ConductReviewCandidate_fingerprint_key" ON "ConductReviewCandidate"("fingerprint");

-- CreateIndex
CREATE INDEX "ConductReviewCandidate_status_assignedModeratorUserId_creat_idx" ON "ConductReviewCandidate"("status", "assignedModeratorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ConductReviewCandidate_locationType_groupId_status_createdA_idx" ON "ConductReviewCandidate"("locationType", "groupId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ConductReviewCandidate_authorUserId_status_createdAt_idx" ON "ConductReviewCandidate"("authorUserId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConductScanRun_reference_key" ON "ConductScanRun"("reference");

-- CreateIndex
CREATE INDEX "ConductScanRun_status_createdAt_idx" ON "ConductScanRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ConductScanRun_mode_createdAt_idx" ON "ConductScanRun"("mode", "createdAt");

-- CreateIndex
CREATE INDEX "ConductScanRun_groupId_createdAt_idx" ON "ConductScanRun"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "ConductEvent_incidentId_createdAt_idx" ON "ConductEvent"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "ConductEvent_reportId_createdAt_idx" ON "ConductEvent"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ConductEvent_disputeId_createdAt_idx" ON "ConductEvent"("disputeId", "createdAt");

-- CreateIndex
CREATE INDEX "ConductEvent_restrictionId_createdAt_idx" ON "ConductEvent"("restrictionId", "createdAt");

-- CreateIndex
CREATE INDEX "ConductEvent_actorUserId_createdAt_idx" ON "ConductEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ConductEvent_type_createdAt_idx" ON "ConductEvent"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "ConductReport" ADD CONSTRAINT "ConductReport_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ConductIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConductDispute" ADD CONSTRAINT "ConductDispute_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ConductReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConductDispute" ADD CONSTRAINT "ConductDispute_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ConductIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConductDisputeParticipant" ADD CONSTRAINT "ConductDisputeParticipant_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "ConductDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConductDisputeMessage" ADD CONSTRAINT "ConductDisputeMessage_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "ConductDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConductReviewCandidate" ADD CONSTRAINT "ConductReviewCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ConductScanRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConductReviewCandidate" ADD CONSTRAINT "ConductReviewCandidate_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ConductIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConductEvent" ADD CONSTRAINT "ConductEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ConductIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConductEvent" ADD CONSTRAINT "ConductEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ConductReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConductEvent" ADD CONSTRAINT "ConductEvent_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "ConductDispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConductEvent" ADD CONSTRAINT "ConductEvent_restrictionId_fkey" FOREIGN KEY ("restrictionId") REFERENCES "ConductRestriction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
