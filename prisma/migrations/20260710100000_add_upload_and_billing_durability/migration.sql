-- CreateEnum
CREATE TYPE "StripeWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "BillingCheckoutIntentStatus" AS ENUM ('PENDING', 'SESSION_CREATED', 'COMPLETED', 'EXPIRED', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "UploadIntentPurpose" AS ENUM ('GALLERY', 'STREAM_POST', 'STREAM_REPLY', 'AD_CREATIVE', 'PROFILE_MEDIA', 'BUSINESS_MEDIA', 'CHAT_ATTACHMENT', 'MAIL_ATTACHMENT', 'GROUP_ASSET', 'MARKET_LISTING', 'RESUME');

-- CreateEnum
CREATE TYPE "UploadIntentStatus" AS ENUM ('PENDING', 'VERIFYING', 'VERIFIED', 'USED', 'EXPIRED', 'REVOKED', 'REJECTED');

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "objectId" TEXT,
    "payload" JSONB NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "apiVersion" TEXT,
    "eventCreatedAt" TIMESTAMP(3) NOT NULL,
    "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "claimToken" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "errorAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCheckoutIntent" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT,
    "kind" "StripeCheckoutKind" NOT NULL,
    "targetTier" "MembershipTier",
    "creditPackageKey" TEXT,
    "creditAmountSnapshot" INTEGER,
    "stripePriceIdSnapshot" TEXT NOT NULL,
    "amountCentsSnapshot" INTEGER NOT NULL,
    "currencySnapshot" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" "BillingCheckoutIntentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sessionCreatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCheckoutIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadIntent" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "purpose" "UploadIntentPurpose" NOT NULL,
    "declaredMimeType" TEXT NOT NULL,
    "declaredSizeBytes" BIGINT NOT NULL,
    "declaredChecksumSha256" TEXT,
    "observedMimeType" TEXT,
    "observedSizeBytes" BIGINT,
    "observedChecksumSha256" TEXT,
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "UploadIntentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "verificationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhookEvent_providerEventId_key" ON "StripeWebhookEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_status_createdAt_idx" ON "StripeWebhookEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_status_nextAttemptAt_lockedUntil_idx" ON "StripeWebhookEvent"("status", "nextAttemptAt", "lockedUntil");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_eventType_eventCreatedAt_idx" ON "StripeWebhookEvent"("eventType", "eventCreatedAt");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_objectId_eventCreatedAt_idx" ON "StripeWebhookEvent"("objectId", "eventCreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCheckoutIntent_idempotencyKey_key" ON "BillingCheckoutIntent"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCheckoutIntent_stripeCheckoutSessionId_key" ON "BillingCheckoutIntent"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCheckoutIntent_stripeSubscriptionId_key" ON "BillingCheckoutIntent"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "BillingCheckoutIntent_userId_createdAt_idx" ON "BillingCheckoutIntent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingCheckoutIntent_status_expiresAt_idx" ON "BillingCheckoutIntent"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadIntent_storageKey_key" ON "UploadIntent"("storageKey");

-- CreateIndex
CREATE INDEX "UploadIntent_ownerUserId_createdAt_idx" ON "UploadIntent"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadIntent_status_expiresAt_idx" ON "UploadIntent"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "BillingCheckoutIntent" ADD CONSTRAINT "BillingCheckoutIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadIntent" ADD CONSTRAINT "UploadIntent_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "StripeWebhookEvent"
  ADD CONSTRAINT "StripeWebhookEvent_attempts_check" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "StripeWebhookEvent_claim_check" CHECK (("lockedUntil" IS NULL) = ("claimToken" IS NULL)),
  ADD CONSTRAINT "StripeWebhookEvent_identity_check" CHECK (length(btrim("providerEventId")) > 0 AND length(btrim("eventType")) > 0);

ALTER TABLE "BillingCheckoutIntent"
  ADD CONSTRAINT "BillingCheckoutIntent_identity_check" CHECK (length(btrim("idempotencyKey")) > 0 AND length(btrim("stripePriceIdSnapshot")) > 0),
  ADD CONSTRAINT "BillingCheckoutIntent_amount_check" CHECK ("amountCentsSnapshot" > 0),
  ADD CONSTRAINT "BillingCheckoutIntent_currency_check" CHECK ("currencySnapshot" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "BillingCheckoutIntent_target_check" CHECK (
    ("kind" = 'SUBSCRIPTION' AND "targetTier" IS NOT NULL AND "creditPackageKey" IS NULL AND "creditAmountSnapshot" IS NULL)
    OR ("kind" = 'CREDIT_PURCHASE' AND "targetTier" IS NULL AND length(btrim("creditPackageKey")) > 0 AND "creditAmountSnapshot" > 0)
  ),
  ADD CONSTRAINT "BillingCheckoutIntent_expiry_check" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "UploadIntent"
  ADD CONSTRAINT "UploadIntent_storage_key_check" CHECK (length(btrim("storageKey")) > 0),
  ADD CONSTRAINT "UploadIntent_declared_mime_check" CHECK (length(btrim("declaredMimeType")) > 0),
  ADD CONSTRAINT "UploadIntent_declared_size_check" CHECK ("declaredSizeBytes" > 0 AND "declaredSizeBytes" <= 5368709120),
  ADD CONSTRAINT "UploadIntent_observed_size_check" CHECK ("observedSizeBytes" IS NULL OR ("observedSizeBytes" > 0 AND "observedSizeBytes" <= 5368709120)),
  ADD CONSTRAINT "UploadIntent_declared_checksum_check" CHECK ("declaredChecksumSha256" IS NULL OR "declaredChecksumSha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "UploadIntent_observed_checksum_check" CHECK ("observedChecksumSha256" IS NULL OR "observedChecksumSha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "UploadIntent_expiry_check" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "UploadIntent_verified_state_check" CHECK (
    "status" NOT IN ('VERIFIED', 'USED')
    OR ("observedMimeType" IS NOT NULL AND "observedSizeBytes" IS NOT NULL AND "verifiedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "UploadIntent_used_state_check" CHECK ("status" <> 'USED' OR "usedAt" IS NOT NULL),
  ADD CONSTRAINT "UploadIntent_rejected_state_check" CHECK ("status" <> 'REJECTED' OR "rejectedAt" IS NOT NULL);
