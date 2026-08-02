ALTER TYPE "MarketListingCategory" ADD VALUE IF NOT EXISTS 'RENTALS';

ALTER TABLE "MarketListing"
  ADD COLUMN "rentalPropertyType" TEXT,
  ADD COLUMN "rentalBedrooms" INTEGER,
  ADD COLUMN "rentalBathrooms" DOUBLE PRECISION,
  ADD COLUMN "rentalSquareFeet" INTEGER,
  ADD COLUMN "rentalDepositCents" INTEGER,
  ADD COLUMN "rentalAvailableAt" TIMESTAMP(3),
  ADD COLUMN "rentalLeaseTerm" TEXT,
  ADD COLUMN "rentalPetsAllowed" BOOLEAN,
  ADD COLUMN "rentalFurnished" BOOLEAN;

CREATE INDEX "MarketListing_category_rentalAvailableAt_idx"
  ON "MarketListing"("category", "rentalAvailableAt");
