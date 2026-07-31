ALTER TYPE "UploadIntentPurpose" ADD VALUE IF NOT EXISTS 'JOB_LISTING';

ALTER TABLE "JobListing"
ADD COLUMN "needs" TEXT,
ADD COLUMN "wants" TEXT,
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "imageMediaAssetId" TEXT,
ADD COLUMN "imageOverlayText" TEXT;

CREATE INDEX "JobListing_imageMediaAssetId_idx" ON "JobListing"("imageMediaAssetId");

ALTER TABLE "JobListing"
ADD CONSTRAINT "JobListing_imageMediaAssetId_fkey"
FOREIGN KEY ("imageMediaAssetId")
REFERENCES "MediaAsset"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
