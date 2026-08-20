-- CreateEnum
CREATE TYPE "MarketplaceListingKind" AS ENUM ('GOODS', 'VEHICLE', 'RENTAL', 'SERVICE', 'JOB', 'AUDITOR');

-- CreateEnum
CREATE TYPE "MarketplaceIntent" AS ENUM ('OFFER', 'WANTED');

-- CreateEnum
CREATE TYPE "MarketplaceListingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'RESERVED', 'FULFILLED', 'EXPIRED', 'ARCHIVED', 'REMOVED');

-- CreateEnum
CREATE TYPE "MarketplacePriceType" AS ENUM ('FIXED', 'NEGOTIABLE', 'RANGE', 'FREE', 'TRADE', 'QUOTE', 'CONTACT');

-- CreateEnum
CREATE TYPE "MarketplacePublisherKind" AS ENUM ('PERSONAL', 'BUSINESS', 'AUDITOR', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "MarketplaceInquiryKind" AS ENUM ('GENERAL', 'OFFER', 'APPLICATION', 'QUOTE_REQUEST', 'TOUR_REQUEST');

-- CreateEnum
CREATE TYPE "MarketplaceInquiryStatus" AS ENUM ('OPEN', 'RESPONDED', 'CLOSED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "MarketplaceInteractionStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "MarketplaceReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "MarketplaceSavedSearchFrequency" AS ENUM ('NONE', 'IMMEDIATE', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "MarketplaceListingEventType" AS ENUM ('CREATED', 'UPDATED', 'PUBLISHED', 'PAUSED', 'RESERVED', 'FULFILLED', 'EXPIRED', 'ARCHIVED', 'REMOVED', 'RENEWED', 'PROMOTED', 'REPORTED');

-- CreateEnum
CREATE TYPE "MarketplaceFeeAction" AS ENUM ('PUBLISH', 'RENEW', 'PROMOTE', 'ADVERTISE');

-- CreateEnum
CREATE TYPE "MarketplaceFeeStatus" AS ENUM ('WAIVED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "StripeCheckoutKind" ADD VALUE 'MARKETPLACE_FEE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConductLocationType" ADD VALUE 'MARKETPLACE_LISTING';
ALTER TYPE "ConductLocationType" ADD VALUE 'MARKETPLACE_INQUIRY';
ALTER TYPE "ConductLocationType" ADD VALUE 'MARKETPLACE_REVIEW';

-- AlterEnum
ALTER TYPE "AdDestinationKind" ADD VALUE 'MARKETPLACE_LISTING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PlatformCostSubject" ADD VALUE 'MARKETPLACE_PUBLISH';
ALTER TYPE "PlatformCostSubject" ADD VALUE 'MARKETPLACE_RENEW';
ALTER TYPE "PlatformCostSubject" ADD VALUE 'MARKETPLACE_PROMOTE';
ALTER TYPE "PlatformCostSubject" ADD VALUE 'MARKETPLACE_ADVERTISE';

-- AlterTable
ALTER TABLE "AdCampaign" ADD COLUMN     "marketplaceListingId" TEXT;

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "publisherKind" "MarketplacePublisherKind" NOT NULL DEFAULT 'PERSONAL',
    "businessProfileId" TEXT,
    "auditorProfileId" TEXT,
    "kind" "MarketplaceListingKind" NOT NULL,
    "intent" "MarketplaceIntent" NOT NULL,
    "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "condition" TEXT,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "priceType" "MarketplacePriceType" NOT NULL DEFAULT 'CONTACT',
    "priceCents" INTEGER,
    "priceMinCents" INTEGER,
    "priceMaxCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "countryCode" TEXT,
    "region" TEXT,
    "city" TEXT,
    "postalArea" TEXT,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "deliveryAvailable" BOOLEAN NOT NULL DEFAULT false,
    "exactAddress" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactWebsite" TEXT,
    "contactInstructions" TEXT,
    "showEmail" BOOLEAN NOT NULL DEFAULT false,
    "showPhone" BOOLEAN NOT NULL DEFAULT false,
    "showWebsite" BOOLEAN NOT NULL DEFAULT false,
    "showExactAddress" BOOLEAN NOT NULL DEFAULT false,
    "allowInAppMessages" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "moderatedAt" TIMESTAMP(3),
    "moderatedByUserId" TEXT,
    "moderationReason" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "inquiryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListingMedia" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "altText" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceListingMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListingFacet" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "valueBoolean" BOOLEAN,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceListingFacet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceInquiry" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "threadId" TEXT,
    "kind" "MarketplaceInquiryKind" NOT NULL DEFAULT 'GENERAL',
    "status" "MarketplaceInquiryStatus" NOT NULL DEFAULT 'OPEN',
    "initialMessage" TEXT,
    "listingSnapshot" JSONB NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceSavedListing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceSavedListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceSavedSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "frequency" "MarketplaceSavedSearchFrequency" NOT NULL DEFAULT 'NONE',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceSavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceInteraction" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "inquiryId" TEXT,
    "requesterUserId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "status" "MarketplaceInteractionStatus" NOT NULL DEFAULT 'OPEN',
    "requesterConfirmedAt" TIMESTAMP(3),
    "ownerConfirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceReview" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "status" "MarketplaceReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListingEvent" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" "MarketplaceListingEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceListingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceFeeLedgerEntry" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT,
    "checkoutIntentId" TEXT,
    "action" "MarketplaceFeeAction" NOT NULL,
    "status" "MarketplaceFeeStatus" NOT NULL DEFAULT 'WAIVED',
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceFeeLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_slug_key" ON "MarketplaceListing"("slug");

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_kind_intent_publishedAt_idx" ON "MarketplaceListing"("status", "kind", "intent", "publishedAt");

-- CreateIndex
CREATE INDEX "MarketplaceListing_kind_category_subcategory_status_idx" ON "MarketplaceListing"("kind", "category", "subcategory", "status");

-- CreateIndex
CREATE INDEX "MarketplaceListing_countryCode_region_city_status_idx" ON "MarketplaceListing"("countryCode", "region", "city", "status");

-- CreateIndex
CREATE INDEX "MarketplaceListing_ownerUserId_status_updatedAt_idx" ON "MarketplaceListing"("ownerUserId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "MarketplaceListing_businessProfileId_status_updatedAt_idx" ON "MarketplaceListing"("businessProfileId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "MarketplaceListing_auditorProfileId_status_updatedAt_idx" ON "MarketplaceListing"("auditorProfileId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "MarketplaceListing_expiresAt_status_idx" ON "MarketplaceListing"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "MarketplaceListing_priceType_priceCents_idx" ON "MarketplaceListing"("priceType", "priceCents");

-- CreateIndex
CREATE INDEX "MarketplaceListing_moderatedByUserId_moderatedAt_idx" ON "MarketplaceListing"("moderatedByUserId", "moderatedAt");

-- CreateIndex
CREATE INDEX "MarketplaceListingMedia_listingId_sortOrder_idx" ON "MarketplaceListingMedia"("listingId", "sortOrder");

-- CreateIndex
CREATE INDEX "MarketplaceListingMedia_mediaAssetId_createdAt_idx" ON "MarketplaceListingMedia"("mediaAssetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListingMedia_listingId_mediaAssetId_key" ON "MarketplaceListingMedia"("listingId", "mediaAssetId");

-- CreateIndex
CREATE INDEX "MarketplaceListingFacet_key_valueText_listingId_idx" ON "MarketplaceListingFacet"("key", "valueText", "listingId");

-- CreateIndex
CREATE INDEX "MarketplaceListingFacet_key_valueNumber_listingId_idx" ON "MarketplaceListingFacet"("key", "valueNumber", "listingId");

-- CreateIndex
CREATE INDEX "MarketplaceListingFacet_key_valueBoolean_listingId_idx" ON "MarketplaceListingFacet"("key", "valueBoolean", "listingId");

-- CreateIndex
CREATE INDEX "MarketplaceListingFacet_listingId_key_idx" ON "MarketplaceListingFacet"("listingId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceInquiry_threadId_key" ON "MarketplaceInquiry"("threadId");

-- CreateIndex
CREATE INDEX "MarketplaceInquiry_listingId_status_createdAt_idx" ON "MarketplaceInquiry"("listingId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceInquiry_requesterUserId_status_createdAt_idx" ON "MarketplaceInquiry"("requesterUserId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceInquiry_listingId_requesterUserId_kind_key" ON "MarketplaceInquiry"("listingId", "requesterUserId", "kind");

-- CreateIndex
CREATE INDEX "MarketplaceSavedListing_listingId_createdAt_idx" ON "MarketplaceSavedListing"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceSavedListing_userId_createdAt_idx" ON "MarketplaceSavedListing"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSavedListing_userId_listingId_key" ON "MarketplaceSavedListing"("userId", "listingId");

-- CreateIndex
CREATE INDEX "MarketplaceSavedSearch_userId_enabled_updatedAt_idx" ON "MarketplaceSavedSearch"("userId", "enabled", "updatedAt");

-- CreateIndex
CREATE INDEX "MarketplaceSavedSearch_frequency_enabled_lastRunAt_idx" ON "MarketplaceSavedSearch"("frequency", "enabled", "lastRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceInteraction_inquiryId_key" ON "MarketplaceInteraction"("inquiryId");

-- CreateIndex
CREATE INDEX "MarketplaceInteraction_requesterUserId_status_updatedAt_idx" ON "MarketplaceInteraction"("requesterUserId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "MarketplaceInteraction_ownerUserId_status_updatedAt_idx" ON "MarketplaceInteraction"("ownerUserId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "MarketplaceInteraction_listingId_status_idx" ON "MarketplaceInteraction"("listingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceInteraction_listingId_requesterUserId_key" ON "MarketplaceInteraction"("listingId", "requesterUserId");

-- CreateIndex
CREATE INDEX "MarketplaceReview_subjectUserId_status_createdAt_idx" ON "MarketplaceReview"("subjectUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceReview_listingId_status_createdAt_idx" ON "MarketplaceReview"("listingId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceReview_interactionId_authorUserId_key" ON "MarketplaceReview"("interactionId", "authorUserId");

-- CreateIndex
CREATE INDEX "MarketplaceListingEvent_listingId_createdAt_idx" ON "MarketplaceListingEvent"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceListingEvent_actorUserId_createdAt_idx" ON "MarketplaceListingEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceListingEvent_type_createdAt_idx" ON "MarketplaceListingEvent"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceFeeLedgerEntry_operationId_key" ON "MarketplaceFeeLedgerEntry"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceFeeLedgerEntry_checkoutIntentId_key" ON "MarketplaceFeeLedgerEntry"("checkoutIntentId");

-- CreateIndex
CREATE INDEX "MarketplaceFeeLedgerEntry_listingId_action_createdAt_idx" ON "MarketplaceFeeLedgerEntry"("listingId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceFeeLedgerEntry_userId_createdAt_idx" ON "MarketplaceFeeLedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceFeeLedgerEntry_status_createdAt_idx" ON "MarketplaceFeeLedgerEntry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AdCampaign_marketplaceListingId_createdAt_idx" ON "AdCampaign"("marketplaceListingId", "createdAt");

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_auditorProfileId_fkey" FOREIGN KEY ("auditorProfileId") REFERENCES "AuditorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_moderatedByUserId_fkey" FOREIGN KEY ("moderatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingMedia" ADD CONSTRAINT "MarketplaceListingMedia_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingMedia" ADD CONSTRAINT "MarketplaceListingMedia_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingFacet" ADD CONSTRAINT "MarketplaceListingFacet_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInquiry" ADD CONSTRAINT "MarketplaceInquiry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInquiry" ADD CONSTRAINT "MarketplaceInquiry_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInquiry" ADD CONSTRAINT "MarketplaceInquiry_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSavedListing" ADD CONSTRAINT "MarketplaceSavedListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSavedListing" ADD CONSTRAINT "MarketplaceSavedListing_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSavedSearch" ADD CONSTRAINT "MarketplaceSavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInteraction" ADD CONSTRAINT "MarketplaceInteraction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInteraction" ADD CONSTRAINT "MarketplaceInteraction_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "MarketplaceInquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInteraction" ADD CONSTRAINT "MarketplaceInteraction_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInteraction" ADD CONSTRAINT "MarketplaceInteraction_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "MarketplaceInteraction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingEvent" ADD CONSTRAINT "MarketplaceListingEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingEvent" ADD CONSTRAINT "MarketplaceListingEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceFeeLedgerEntry" ADD CONSTRAINT "MarketplaceFeeLedgerEntry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceFeeLedgerEntry" ADD CONSTRAINT "MarketplaceFeeLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceFeeLedgerEntry" ADD CONSTRAINT "MarketplaceFeeLedgerEntry_checkoutIntentId_fkey" FOREIGN KEY ("checkoutIntentId") REFERENCES "BillingCheckoutIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Search and integrity support for the marketplace-first rollout.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "MarketplaceListing_search_document_idx"
ON "MarketplaceListing"
USING GIN (
  to_tsvector(
    'simple'::regconfig,
    COALESCE("title", '') || ' ' ||
    COALESCE("summary", '') || ' ' ||
    COALESCE("description", '') || ' ' ||
    COALESCE("category", '') || ' ' ||
    COALESCE("subcategory", '') || ' ' ||
    COALESCE("city", '') || ' ' ||
    COALESCE("region", '')
  )
);

CREATE INDEX "MarketplaceListing_title_trigram_idx"
ON "MarketplaceListing" USING GIN (LOWER("title") gin_trgm_ops);

CREATE INDEX "MarketplaceListing_location_trigram_idx"
ON "MarketplaceListing" USING GIN (
  LOWER(COALESCE("city", '') || ' ' || COALESCE("region", '')) gin_trgm_ops
);

CREATE UNIQUE INDEX "MarketplaceListingMedia_one_primary_idx"
ON "MarketplaceListingMedia"("listingId")
WHERE "isPrimary" = true;

ALTER TABLE "MarketplaceListing"
  ADD CONSTRAINT "MarketplaceListing_price_values_check"
    CHECK (
      ("priceCents" IS NULL OR "priceCents" >= 0) AND
      ("priceMinCents" IS NULL OR "priceMinCents" >= 0) AND
      ("priceMaxCents" IS NULL OR "priceMaxCents" >= 0) AND
      ("priceMinCents" IS NULL OR "priceMaxCents" IS NULL OR "priceMinCents" <= "priceMaxCents")
    ),
  ADD CONSTRAINT "MarketplaceListing_contact_disclosure_check"
    CHECK (
      (NOT "showEmail" OR "contactEmail" IS NOT NULL) AND
      (NOT "showPhone" OR "contactPhone" IS NOT NULL) AND
      (NOT "showWebsite" OR "contactWebsite" IS NOT NULL) AND
      (NOT "showExactAddress" OR "exactAddress" IS NOT NULL)
    ),
  ADD CONSTRAINT "MarketplaceListing_publisher_identity_check"
    CHECK (
      ("publisherKind" = 'PERSONAL' AND "businessProfileId" IS NULL AND "auditorProfileId" IS NULL) OR
      ("publisherKind" IN ('BUSINESS', 'ORGANIZATION') AND "businessProfileId" IS NOT NULL AND "auditorProfileId" IS NULL) OR
      ("publisherKind" = 'AUDITOR' AND "auditorProfileId" IS NOT NULL AND "businessProfileId" IS NULL)
    );

ALTER TABLE "MarketplaceReview"
  ADD CONSTRAINT "MarketplaceReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "MarketplaceReview_distinct_participants_check" CHECK ("authorUserId" <> "subjectUserId");

ALTER TABLE "MarketplaceInteraction"
  ADD CONSTRAINT "MarketplaceInteraction_distinct_participants_check" CHECK ("requesterUserId" <> "ownerUserId");

INSERT INTO "FeatureFlag" (
  "id", "key", "displayName", "category", "sortOrder", "enabled", "description", "version", "createdAt", "updatedAt"
) VALUES (
  'marketplace-focused-rollout',
  'marketplace.focused_rollout',
  'Marketplace-first experience',
  'Marketplace',
  10,
  false,
  'Routes the primary Theta-Space experience through the unified marketplace while preserving legacy modules.',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
