ALTER TABLE "MarketListing"
ADD COLUMN "contactEmail" TEXT,
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "contactNotes" TEXT,
ADD COLUMN "allowMessages" BOOLEAN NOT NULL DEFAULT true;
