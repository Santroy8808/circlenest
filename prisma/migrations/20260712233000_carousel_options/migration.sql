ALTER TABLE "MarketListing"
ADD COLUMN "carouselEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AdCampaign"
ADD COLUMN "carouselEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AdCampaignCreative" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdCampaignCreative_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdCampaignCreative_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdCampaignCreative_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AdCampaignCreative_campaignId_mediaAssetId_key" ON "AdCampaignCreative"("campaignId", "mediaAssetId");
CREATE INDEX "AdCampaignCreative_campaignId_sortOrder_idx" ON "AdCampaignCreative"("campaignId", "sortOrder");
CREATE INDEX "AdCampaignCreative_mediaAssetId_createdAt_idx" ON "AdCampaignCreative"("mediaAssetId", "createdAt");

INSERT INTO "AdCampaignCreative" ("id", "campaignId", "mediaAssetId", "sortOrder", "createdAt")
SELECT CONCAT('legacy_', "id"), "id", "imageMediaAssetId", 0, "createdAt"
FROM "AdCampaign"
WHERE "imageMediaAssetId" IS NOT NULL
ON CONFLICT ("campaignId", "mediaAssetId") DO NOTHING;
