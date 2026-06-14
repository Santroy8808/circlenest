-- Phase 4: ad campaigns, landing articles, privacy-safe analytics, and ranking snapshots.

ALTER TABLE "AdPlacement" ADD COLUMN "campaignId" TEXT;

CREATE TABLE "AdCampaign" (
  "id" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "businessProfileId" TEXT,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "budgetAmountCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "platformCreditBudget" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "dailyBudgetCents" INTEGER,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "landingArticleId" TEXT,
  "imageUrl" TEXT,
  "boostFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "manualAdminBoost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "manualAdminDemotion" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdArticle" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "heroImageUrl" TEXT,
  "mediaJson" TEXT,
  "ctaLabel" TEXT,
  "ctaUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdArticle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdImpression" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "viewerId" TEXT,
  "anonymousSessionId" TEXT,
  "placementSlot" TEXT NOT NULL,
  "appearedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "viewStartedAt" TIMESTAMP(3),
  "viewEndedAt" TIMESTAMP(3),
  "viewDurationMs" INTEGER,
  "viewportJson" TEXT,
  "profileSnapshotJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdImpression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdClick" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "viewerId" TEXT,
  "anonymousSessionId" TEXT,
  "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clickTarget" TEXT NOT NULL,
  "profileSnapshotJson" TEXT,

  CONSTRAINT "AdClick_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdEngagement" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "viewerId" TEXT,
  "eventType" TEXT NOT NULL,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdEngagement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyAdRankingSnapshot" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "spendWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "engagementWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recencyWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "boostWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fairnessWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "finalRankScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "impressionsAllocated" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DailyAdRankingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdPlacement_campaignId_createdAt_idx" ON "AdPlacement"("campaignId", "createdAt");
CREATE INDEX "AdCampaign_creatorId_createdAt_idx" ON "AdCampaign"("creatorId", "createdAt");
CREATE INDEX "AdCampaign_businessProfileId_createdAt_idx" ON "AdCampaign"("businessProfileId", "createdAt");
CREATE INDEX "AdCampaign_status_startsAt_endsAt_idx" ON "AdCampaign"("status", "startsAt", "endsAt");
CREATE INDEX "AdCampaign_targetType_targetId_idx" ON "AdCampaign"("targetType", "targetId");
CREATE INDEX "AdArticle_campaignId_createdAt_idx" ON "AdArticle"("campaignId", "createdAt");
CREATE INDEX "AdArticle_status_createdAt_idx" ON "AdArticle"("status", "createdAt");
CREATE INDEX "AdImpression_campaignId_createdAt_idx" ON "AdImpression"("campaignId", "createdAt");
CREATE INDEX "AdImpression_viewerId_createdAt_idx" ON "AdImpression"("viewerId", "createdAt");
CREATE INDEX "AdImpression_placementSlot_appearedAt_idx" ON "AdImpression"("placementSlot", "appearedAt");
CREATE INDEX "AdClick_campaignId_clickedAt_idx" ON "AdClick"("campaignId", "clickedAt");
CREATE INDEX "AdClick_viewerId_clickedAt_idx" ON "AdClick"("viewerId", "clickedAt");
CREATE INDEX "AdEngagement_campaignId_createdAt_idx" ON "AdEngagement"("campaignId", "createdAt");
CREATE INDEX "AdEngagement_eventType_createdAt_idx" ON "AdEngagement"("eventType", "createdAt");
CREATE INDEX "AdEngagement_viewerId_createdAt_idx" ON "AdEngagement"("viewerId", "createdAt");
CREATE UNIQUE INDEX "DailyAdRankingSnapshot_campaignId_dateKey_key" ON "DailyAdRankingSnapshot"("campaignId", "dateKey");
CREATE INDEX "DailyAdRankingSnapshot_dateKey_finalRankScore_idx" ON "DailyAdRankingSnapshot"("dateKey", "finalRankScore");
CREATE INDEX "DailyAdRankingSnapshot_campaignId_createdAt_idx" ON "DailyAdRankingSnapshot"("campaignId", "createdAt");

ALTER TABLE "AdPlacement" ADD CONSTRAINT "AdPlacement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_landingArticleId_fkey" FOREIGN KEY ("landingArticleId") REFERENCES "AdArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdArticle" ADD CONSTRAINT "AdArticle_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdImpression" ADD CONSTRAINT "AdImpression_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdClick" ADD CONSTRAINT "AdClick_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdEngagement" ADD CONSTRAINT "AdEngagement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyAdRankingSnapshot" ADD CONSTRAINT "DailyAdRankingSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
