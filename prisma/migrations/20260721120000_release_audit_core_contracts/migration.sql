-- Release-audit core contracts: explicit offer lifecycles, durable administrative
-- records, idempotent delivery/credit operations, and secret indirection.

-- CreateEnum
CREATE TYPE "MembershipUpgradeMode" AS ENUM ('NONE', 'BETA_FREE', 'STRIPE');

-- CreateEnum
CREATE TYPE "MembershipUpgradeOfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateEnum
CREATE TYPE "RecordRetentionClass" AS ENUM ('STANDARD', 'VITAL');

-- CreateEnum
CREATE TYPE "DestructiveActionKind" AS ENUM ('DELETE_ACCOUNT', 'PURGE_ACCOUNT_DATA', 'DELETE_CONTENT', 'DELETE_MEDIA', 'DELETE_ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "DestructiveActionStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('CHAT', 'MAIL', 'POPUP', 'GLOBAL_POST', 'PERSONAL_EMAIL', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "DeliveryOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlatformCreditEntryType" AS ENUM ('OPENING_BALANCE', 'MONTHLY_ALLOCATION', 'PURCHASE', 'SPEND', 'REFUND', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('GENERAL', 'WRITER_CHAPTER_PUBLISHED', 'FRIEND_REQUEST', 'FAMILY_REQUEST', 'CHAT_MESSAGE', 'GROUP_ACTIVITY', 'ACCOUNT', 'ADMIN_ANNOUNCEMENT', 'SUPPORT', 'SYSTEM');

-- ExtendEnum
ALTER TYPE "AuthSecurityEventType" ADD VALUE IF NOT EXISTS 'DESTRUCTIVE_ACTION_CONFIRMED';
ALTER TYPE "AuthSecurityEventType" ADD VALUE IF NOT EXISTS 'DESTRUCTIVE_ACTION_DENIED';

-- Membership eligibility, grant, offer, and plan policy.
ALTER TABLE "MembershipTierUpgradeEligibility"
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedByUserId" TEXT,
  ADD COLUMN "revocationReason" TEXT;

ALTER TABLE "MembershipPromotionGrant"
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedByUserId" TEXT,
  ADD COLUMN "revocationReason" TEXT;

ALTER TABLE "SubscriptionPlanRule"
  ADD COLUMN "memberVisible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selfServiceEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "upgradeMode" "MembershipUpgradeMode" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "futurePriceCents" INTEGER;

UPDATE "SubscriptionPlanRule"
SET
  "active" = true,
  "memberVisible" = true,
  "selfServiceEnabled" = false,
  "upgradeMode" = 'NONE'
WHERE "tier" = 'FREE';

UPDATE "SubscriptionPlanRule"
SET
  "active" = true,
  "memberVisible" = true,
  "selfServiceEnabled" = true,
  "upgradeMode" = 'BETA_FREE',
  "futurePriceCents" = 499
WHERE "tier" = 'CONTRIBUTOR';

UPDATE "SubscriptionPlanRule"
SET
  "active" = false,
  "memberVisible" = false,
  "selfServiceEnabled" = false,
  "upgradeMode" = 'NONE'
WHERE "tier" IN ('PROFESSIONAL', 'AUDITOR', 'ORG');

-- Introduce environment-variable references and map existing secret presence.
-- Plaintext columns remain during this expand phase so State 02 can migrate the
-- service to SecretStore without breaking the running application. A later
-- contract migration will drop them after all reads use these references.
ALTER TABLE "StripeIntegrationConfig"
  ADD COLUMN "secretKeyEnvVar" TEXT,
  ADD COLUMN "webhookSecretEnvVar" TEXT;

UPDATE "StripeIntegrationConfig"
SET
  "secretKeyEnvVar" = CASE
    WHEN "secretKey" IS NOT NULL AND length(btrim("secretKey")) > 0 THEN 'STRIPE_SECRET_KEY'
    ELSE NULL
  END,
  "webhookSecretEnvVar" = CASE
    WHEN "webhookSecret" IS NOT NULL AND length(btrim("webhookSecret")) > 0 THEN 'STRIPE_WEBHOOK_SECRET'
    ELSE NULL
  END;

UPDATE "StripeIntegrationConfig" AS config
SET "updatedByUserId" = NULL
WHERE "updatedByUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "User" AS actor WHERE actor."id" = config."updatedByUserId"
  );

-- Durable audit records and explicit retention classification.
ALTER TABLE "AuditLog"
  ADD COLUMN "operationId" TEXT,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "before" JSONB,
  ADD COLUMN "after" JSONB,
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

UPDATE "AuditLog"
SET "operationId" = 'legacy:audit:' || "id"
WHERE "operationId" IS NULL;

ALTER TABLE "AuditLog" ALTER COLUMN "operationId" SET NOT NULL;

ALTER TABLE "AdminAction"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

ALTER TABLE "TermsAcceptance"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

ALTER TABLE "StripeCheckoutFulfillment"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

ALTER TABLE "StripeWebhookEvent"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

ALTER TABLE "BillingCheckoutIntent"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

-- Feature flags have stable display metadata and optimistic concurrency.
ALTER TABLE "FeatureFlag"
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'General',
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedByUserId" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "FeatureFlag"
SET "displayName" = "key"
WHERE "displayName" IS NULL;

-- Announcements become durable parents of delivery work.
ALTER TABLE "PublicAnnouncement"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL',
  ALTER COLUMN "createdByUserId" DROP NOT NULL;

UPDATE "PublicAnnouncement" AS announcement
SET "createdByUserId" = NULL
WHERE "createdByUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "User" AS actor WHERE actor."id" = announcement."createdByUserId"
  );

UPDATE "PublicAnnouncement" AS announcement
SET "dismissedByUserId" = NULL
WHERE "dismissedByUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "User" AS actor WHERE actor."id" = announcement."dismissedByUserId"
  );

-- Preserve business communications independently from account deletion.
ALTER TABLE "MailThread"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

ALTER TABLE "MailMessage"
  ADD COLUMN "senderIdentitySnapshot" TEXT NOT NULL DEFAULT 'Unknown sender',
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

UPDATE "MailMessage" AS message
SET "senderIdentitySnapshot" = account."username" || ' <' || account."email" || '>'
FROM "User" AS account
WHERE account."id" = message."senderUserId";

ALTER TABLE "MailRecipient"
  ADD COLUMN "recipientIdentitySnapshot" TEXT NOT NULL DEFAULT 'Unknown recipient';

UPDATE "MailRecipient" AS recipient
SET "recipientIdentitySnapshot" = account."username" || ' <' || account."email" || '>'
FROM "User" AS account
WHERE account."id" = recipient."userId";

ALTER TABLE "BusinessInquiry"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

-- Make the platform credit ledger idempotent and independently retainable.
ALTER TABLE "AdCreditLedgerEntry"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "accountReference" TEXT,
  ADD COLUMN "entryType" "PlatformCreditEntryType" NOT NULL DEFAULT 'ADJUSTMENT',
  ADD COLUMN "balanceAfter" INTEGER,
  ADD COLUMN "periodStart" TIMESTAMP(3),
  ADD COLUMN "periodEnd" TIMESTAMP(3),
  ADD COLUMN "actorUserId" TEXT,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

UPDATE "AdCreditLedgerEntry"
SET
  "idempotencyKey" = 'legacy:credit:' || "id",
  "accountReference" = 'user:' || "userId"
WHERE "idempotencyKey" IS NULL OR "accountReference" IS NULL;

ALTER TABLE "AdCreditLedgerEntry"
  ALTER COLUMN "idempotencyKey" SET NOT NULL;

ALTER TABLE "FundLedgerEntry"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

-- Typed, idempotent, actionable notifications.
ALTER TABLE "Notification"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "kind" "NotificationKind" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "actionable" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Notification"
SET "idempotencyKey" = 'legacy:notification:' || "id"
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "Notification" ALTER COLUMN "idempotencyKey" SET NOT NULL;

-- Feedback and conduct resolution attribution with optimistic versions.
ALTER TABLE "FeedbackTicket"
  ADD COLUMN "assignedToUserId" TEXT,
  ADD COLUMN "resolvedByUserId" TEXT,
  ADD COLUMN "resolution" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

ALTER TABLE "FeedbackTicketEvent"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

ALTER TABLE "ConductReport"
  ADD COLUMN "resolvedByUserId" TEXT,
  ADD COLUMN "resolutionReason" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

ALTER TABLE "ConductEvent"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL';

UPDATE "FeedbackTicketEvent" AS event
SET "actorId" = NULL
WHERE "actorId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "User" AS actor WHERE actor."id" = event."actorId"
  );

UPDATE "ConductEvent" AS event
SET "actorUserId" = NULL
WHERE "actorUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "User" AS actor WHERE actor."id" = event."actorUserId"
  );

-- CreateTable
CREATE TABLE "MembershipUpgradeOffer" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eligibilityId" TEXT NOT NULL,
  "targetTier" "MembershipTier" NOT NULL,
  "status" "MembershipUpgradeOfferStatus" NOT NULL DEFAULT 'OFFERED',
  "upgradeMode" "MembershipUpgradeMode" NOT NULL DEFAULT 'BETA_FREE',
  "currentPriceCents" INTEGER NOT NULL DEFAULT 0,
  "futurePriceCents" INTEGER,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "revokedByUserId" TEXT,
  "revocationReason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MembershipUpgradeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestructiveActionRequest" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "kind" "DestructiveActionKind" NOT NULL,
  "status" "DestructiveActionStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "confirmedByUserId" TEXT,
  "confirmationSecurityEventId" TEXT,
  "platformJobId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "error" TEXT,
  "result" JSONB,
  "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DestructiveActionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOutbox" (
  "id" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "recipientUserId" TEXT,
  "recipientAddress" TEXT,
  "channel" "DeliveryChannel" NOT NULL,
  "status" "DeliveryOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "providerMessageId" TEXT,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeliveryOutbox_pkey" PRIMARY KEY ("id")
);

-- Normalize legacy promotion rows before enforcing scope and time invariants.
UPDATE "MembershipPromotionGrant"
SET "scope" = CASE WHEN "userId" IS NULL THEN 'GLOBAL'::"PromotionAccessScope" ELSE 'USER'::"PromotionAccessScope" END;

UPDATE "MembershipPromotionGrant"
SET "expiresAt" = "startsAt" + INTERVAL '1 second'
WHERE "expiresAt" <= "startsAt";

-- CreateIndex
CREATE UNIQUE INDEX "MembershipTierUpgradeEligibility_id_userId_tier_key"
  ON "MembershipTierUpgradeEligibility"("id", "userId", "tier");
CREATE INDEX "MembershipTierUpgradeEligibility_revokedByUserId_revokedAt_idx"
  ON "MembershipTierUpgradeEligibility"("revokedByUserId", "revokedAt");

CREATE INDEX "MembershipPromotionGrant_revokedByUserId_revokedAt_idx"
  ON "MembershipPromotionGrant"("revokedByUserId", "revokedAt");

CREATE UNIQUE INDEX "MembershipUpgradeOffer_idempotencyKey_key"
  ON "MembershipUpgradeOffer"("idempotencyKey");
CREATE INDEX "MembershipUpgradeOffer_userId_status_validFrom_expiresAt_idx"
  ON "MembershipUpgradeOffer"("userId", "status", "validFrom", "expiresAt");
CREATE INDEX "MembershipUpgradeOffer_eligibilityId_createdAt_idx"
  ON "MembershipUpgradeOffer"("eligibilityId", "createdAt");
CREATE INDEX "MembershipUpgradeOffer_targetTier_status_createdAt_idx"
  ON "MembershipUpgradeOffer"("targetTier", "status", "createdAt");
CREATE INDEX "MembershipUpgradeOffer_createdByUserId_createdAt_idx"
  ON "MembershipUpgradeOffer"("createdByUserId", "createdAt");
CREATE INDEX "MembershipUpgradeOffer_revokedByUserId_revokedAt_idx"
  ON "MembershipUpgradeOffer"("revokedByUserId", "revokedAt");

CREATE UNIQUE INDEX "AuditLog_operationId_key" ON "AuditLog"("operationId");
CREATE INDEX "AuditLog_requestId_createdAt_idx" ON "AuditLog"("requestId", "createdAt");
CREATE INDEX "AuditLog_outcome_createdAt_idx" ON "AuditLog"("outcome", "createdAt");

CREATE UNIQUE INDEX "DestructiveActionRequest_idempotencyKey_key"
  ON "DestructiveActionRequest"("idempotencyKey");
CREATE UNIQUE INDEX "DestructiveActionRequest_confirmationSecurityEventId_key"
  ON "DestructiveActionRequest"("confirmationSecurityEventId");
CREATE UNIQUE INDEX "DestructiveActionRequest_platformJobId_key"
  ON "DestructiveActionRequest"("platformJobId");
CREATE INDEX "DestructiveActionRequest_status_createdAt_idx"
  ON "DestructiveActionRequest"("status", "createdAt");
CREATE INDEX "DestructiveActionRequest_kind_targetType_targetId_createdAt_idx"
  ON "DestructiveActionRequest"("kind", "targetType", "targetId", "createdAt");
CREATE INDEX "DestructiveActionRequest_requestedByUserId_createdAt_idx"
  ON "DestructiveActionRequest"("requestedByUserId", "createdAt");
CREATE INDEX "DestructiveActionRequest_confirmedByUserId_confirmedAt_idx"
  ON "DestructiveActionRequest"("confirmedByUserId", "confirmedAt");

CREATE INDEX "FeatureFlag_category_sortOrder_key_idx"
  ON "FeatureFlag"("category", "sortOrder", "key");
CREATE INDEX "FeatureFlag_updatedByUserId_updatedAt_idx"
  ON "FeatureFlag"("updatedByUserId", "updatedAt");

CREATE UNIQUE INDEX "DeliveryOutbox_idempotencyKey_key"
  ON "DeliveryOutbox"("idempotencyKey");
CREATE INDEX "DeliveryOutbox_status_availableAt_createdAt_idx"
  ON "DeliveryOutbox"("status", "availableAt", "createdAt");
CREATE INDEX "DeliveryOutbox_announcementId_channel_status_idx"
  ON "DeliveryOutbox"("announcementId", "channel", "status");
CREATE INDEX "DeliveryOutbox_recipientUserId_createdAt_idx"
  ON "DeliveryOutbox"("recipientUserId", "createdAt");
CREATE INDEX "DeliveryOutbox_lockedAt_idx" ON "DeliveryOutbox"("lockedAt");

CREATE UNIQUE INDEX "AdCreditLedgerEntry_idempotencyKey_key"
  ON "AdCreditLedgerEntry"("idempotencyKey");
CREATE INDEX "AdCreditLedgerEntry_accountReference_createdAt_idx"
  ON "AdCreditLedgerEntry"("accountReference", "createdAt");
CREATE INDEX "AdCreditLedgerEntry_entryType_createdAt_idx"
  ON "AdCreditLedgerEntry"("entryType", "createdAt");
CREATE INDEX "AdCreditLedgerEntry_actorUserId_createdAt_idx"
  ON "AdCreditLedgerEntry"("actorUserId", "createdAt");

CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");
CREATE INDEX "Notification_kind_createdAt_idx" ON "Notification"("kind", "createdAt");
CREATE INDEX "Notification_sourceType_sourceId_idx" ON "Notification"("sourceType", "sourceId");

CREATE INDEX "FeedbackTicket_assignedToUserId_status_createdAt_idx"
  ON "FeedbackTicket"("assignedToUserId", "status", "createdAt");
CREATE INDEX "FeedbackTicket_resolvedByUserId_resolvedAt_idx"
  ON "FeedbackTicket"("resolvedByUserId", "resolvedAt");
CREATE INDEX "FeedbackTicketEvent_actorId_createdAt_idx"
  ON "FeedbackTicketEvent"("actorId", "createdAt");
CREATE INDEX "ConductReport_resolvedByUserId_resolvedAt_idx"
  ON "ConductReport"("resolvedByUserId", "resolvedAt");

-- Replace cascading relationships on vital records with retention-safe policies.
ALTER TABLE "TermsAcceptance" DROP CONSTRAINT IF EXISTS "TermsAcceptance_userId_fkey";
ALTER TABLE "TermsAcceptance"
  ADD CONSTRAINT "TermsAcceptance_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MailMessage" DROP CONSTRAINT IF EXISTS "MailMessage_threadId_fkey";
ALTER TABLE "MailMessage"
  ADD CONSTRAINT "MailMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "MailThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MailMessage" DROP CONSTRAINT IF EXISTS "MailMessage_senderUserId_fkey";
ALTER TABLE "MailMessage"
  ADD CONSTRAINT "MailMessage_senderUserId_fkey"
  FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MailRecipient" DROP CONSTRAINT IF EXISTS "MailRecipient_userId_fkey";
ALTER TABLE "MailRecipient"
  ADD CONSTRAINT "MailRecipient_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MailRecipient" DROP CONSTRAINT IF EXISTS "MailRecipient_messageId_fkey";
ALTER TABLE "MailRecipient"
  ADD CONSTRAINT "MailRecipient_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "MailMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MailAttachment" DROP CONSTRAINT IF EXISTS "MailAttachment_messageId_fkey";
ALTER TABLE "MailAttachment"
  ADD CONSTRAINT "MailAttachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "MailMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BusinessProfile" DROP CONSTRAINT IF EXISTS "BusinessProfile_ownerUserId_fkey";
ALTER TABLE "BusinessProfile"
  ADD CONSTRAINT "BusinessProfile_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BusinessInquiry" DROP CONSTRAINT IF EXISTS "BusinessInquiry_businessProfileId_fkey";
ALTER TABLE "BusinessInquiry"
  ADD CONSTRAINT "BusinessInquiry_businessProfileId_fkey"
  FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdCreditLedgerEntry" DROP CONSTRAINT IF EXISTS "AdCreditLedgerEntry_userId_fkey";
ALTER TABLE "AdCreditLedgerEntry"
  ADD CONSTRAINT "AdCreditLedgerEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FundraiserCampaign" DROP CONSTRAINT IF EXISTS "FundraiserCampaign_creatorUserId_fkey";
ALTER TABLE "FundraiserCampaign"
  ADD CONSTRAINT "FundraiserCampaign_creatorUserId_fkey"
  FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FundContributionIntent" DROP CONSTRAINT IF EXISTS "FundContributionIntent_campaignId_fkey";
ALTER TABLE "FundContributionIntent"
  ADD CONSTRAINT "FundContributionIntent_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "FundraiserCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FundLedgerEntry" DROP CONSTRAINT IF EXISTS "FundLedgerEntry_campaignId_fkey";
ALTER TABLE "FundLedgerEntry"
  ADD CONSTRAINT "FundLedgerEntry_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "FundraiserCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeedbackTicketEvent" DROP CONSTRAINT IF EXISTS "FeedbackTicketEvent_ticketId_fkey";
ALTER TABLE "FeedbackTicketEvent"
  ADD CONSTRAINT "FeedbackTicketEvent_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "FeedbackTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTierUpgradeEligibility"
  ADD CONSTRAINT "MembershipTierUpgradeEligibility_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MembershipPromotionGrant"
  ADD CONSTRAINT "MembershipPromotionGrant_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MembershipUpgradeOffer"
  ADD CONSTRAINT "MembershipUpgradeOffer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipUpgradeOffer"
  ADD CONSTRAINT "MembershipUpgradeOffer_eligibilityId_userId_targetTier_fkey"
  FOREIGN KEY ("eligibilityId", "userId", "targetTier")
  REFERENCES "MembershipTierUpgradeEligibility"("id", "userId", "tier")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MembershipUpgradeOffer"
  ADD CONSTRAINT "MembershipUpgradeOffer_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MembershipUpgradeOffer"
  ADD CONSTRAINT "MembershipUpgradeOffer_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StripeIntegrationConfig"
  ADD CONSTRAINT "StripeIntegrationConfig_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DestructiveActionRequest"
  ADD CONSTRAINT "DestructiveActionRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DestructiveActionRequest"
  ADD CONSTRAINT "DestructiveActionRequest_confirmedByUserId_fkey"
  FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DestructiveActionRequest"
  ADD CONSTRAINT "DestructiveActionRequest_confirmationSecurityEventId_fkey"
  FOREIGN KEY ("confirmationSecurityEventId") REFERENCES "AuthSecurityEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DestructiveActionRequest"
  ADD CONSTRAINT "DestructiveActionRequest_platformJobId_fkey"
  FOREIGN KEY ("platformJobId") REFERENCES "PlatformJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FeatureFlag"
  ADD CONSTRAINT "FeatureFlag_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PublicAnnouncement"
  ADD CONSTRAINT "PublicAnnouncement_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublicAnnouncement"
  ADD CONSTRAINT "PublicAnnouncement_dismissedByUserId_fkey"
  FOREIGN KEY ("dismissedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryOutbox"
  ADD CONSTRAINT "DeliveryOutbox_announcementId_fkey"
  FOREIGN KEY ("announcementId") REFERENCES "PublicAnnouncement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryOutbox"
  ADD CONSTRAINT "DeliveryOutbox_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdCreditLedgerEntry"
  ADD CONSTRAINT "AdCreditLedgerEntry_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FeedbackTicket"
  ADD CONSTRAINT "FeedbackTicket_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeedbackTicket"
  ADD CONSTRAINT "FeedbackTicket_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeedbackTicketEvent"
  ADD CONSTRAINT "FeedbackTicketEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConductReport"
  ADD CONSTRAINT "ConductReport_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConductEvent"
  ADD CONSTRAINT "ConductEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "MembershipTierUpgradeEligibility"
  ADD CONSTRAINT "MembershipTierUpgradeEligibility_revocation_check"
  CHECK ("revokedAt" IS NULL OR "active" = false);

ALTER TABLE "MembershipPromotionGrant"
  ADD CONSTRAINT "MembershipPromotionGrant_scope_check"
  CHECK (
    ("scope" = 'GLOBAL' AND "userId" IS NULL)
    OR ("scope" = 'USER' AND "userId" IS NOT NULL)
  ),
  ADD CONSTRAINT "MembershipPromotionGrant_window_check"
  CHECK ("expiresAt" > "startsAt"),
  ADD CONSTRAINT "MembershipPromotionGrant_revocation_check"
  CHECK ("revokedAt" IS NULL OR "active" = false);

ALTER TABLE "MembershipUpgradeOffer"
  ADD CONSTRAINT "MembershipUpgradeOffer_identity_check"
  CHECK (length(btrim("idempotencyKey")) > 0),
  ADD CONSTRAINT "MembershipUpgradeOffer_price_check"
  CHECK ("currentPriceCents" >= 0 AND ("futurePriceCents" IS NULL OR "futurePriceCents" >= 0)),
  ADD CONSTRAINT "MembershipUpgradeOffer_window_check"
  CHECK ("expiresAt" IS NULL OR "expiresAt" > "validFrom"),
  ADD CONSTRAINT "MembershipUpgradeOffer_accepted_check"
  CHECK ("status" <> 'ACCEPTED' OR "acceptedAt" IS NOT NULL),
  ADD CONSTRAINT "MembershipUpgradeOffer_revoked_check"
  CHECK ("status" <> 'REVOKED' OR "revokedAt" IS NOT NULL),
  ADD CONSTRAINT "MembershipUpgradeOffer_expired_check"
  CHECK ("status" <> 'EXPIRED' OR "expiresAt" IS NOT NULL);

ALTER TABLE "SubscriptionPlanRule"
  ADD CONSTRAINT "SubscriptionPlanRule_release_price_check"
  CHECK ("standardPriceCents" >= 0 AND ("futurePriceCents" IS NULL OR "futurePriceCents" >= 0)),
  ADD CONSTRAINT "SubscriptionPlanRule_self_service_check"
  CHECK (
    "selfServiceEnabled" = false
    OR ("active" = true AND "memberVisible" = true AND "upgradeMode" <> 'NONE')
  );

ALTER TABLE "StripeIntegrationConfig"
  ADD CONSTRAINT "StripeIntegrationConfig_secret_ref_check"
  CHECK (
    ("secretKeyEnvVar" IS NULL OR "secretKeyEnvVar" ~ '^[A-Z][A-Z0-9_]*$')
    AND ("webhookSecretEnvVar" IS NULL OR "webhookSecretEnvVar" ~ '^[A-Z][A-Z0-9_]*$')
  );

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_operation_id_check"
  CHECK (length(btrim("operationId")) > 0);

ALTER TABLE "FeatureFlag"
  ADD CONSTRAINT "FeatureFlag_display_check"
  CHECK (("displayName" IS NULL OR length(btrim("displayName")) > 0) AND length(btrim("category")) > 0),
  ADD CONSTRAINT "FeatureFlag_version_check"
  CHECK ("version" >= 1);

ALTER TABLE "DestructiveActionRequest"
  ADD CONSTRAINT "DestructiveActionRequest_identity_check"
  CHECK (
    length(btrim("idempotencyKey")) > 0
    AND length(btrim("targetType")) > 0
    AND length(btrim("targetId")) > 0
    AND length(btrim("reason")) > 0
  ),
  ADD CONSTRAINT "DestructiveActionRequest_confirmation_check"
  CHECK (
    "status" IN ('PENDING_CONFIRMATION', 'CANCELLED')
    OR (
      "confirmedAt" IS NOT NULL
      AND "confirmedByUserId" IS NOT NULL
      AND "confirmationSecurityEventId" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "DestructiveActionRequest_completion_check"
  CHECK (
    ("status" <> 'SUCCEEDED' OR "completedAt" IS NOT NULL)
    AND ("status" <> 'FAILED' OR "failedAt" IS NOT NULL)
  );

ALTER TABLE "DeliveryOutbox"
  ADD CONSTRAINT "DeliveryOutbox_identity_check"
  CHECK (length(btrim("idempotencyKey")) > 0),
  ADD CONSTRAINT "DeliveryOutbox_recipient_check"
  CHECK (
    "channel" = 'GLOBAL_POST'
    OR "recipientUserId" IS NOT NULL
    OR ("recipientAddress" IS NOT NULL AND length(btrim("recipientAddress")) > 0)
  ),
  ADD CONSTRAINT "DeliveryOutbox_attempts_check"
  CHECK ("attempts" >= 0 AND "maxAttempts" > 0 AND "attempts" <= "maxAttempts"),
  ADD CONSTRAINT "DeliveryOutbox_delivery_state_check"
  CHECK (
    ("status" <> 'SENT' OR "sentAt" IS NOT NULL)
    AND ("status" <> 'FAILED' OR "failedAt" IS NOT NULL)
  );

ALTER TABLE "AdCreditLedgerEntry"
  ADD CONSTRAINT "AdCreditLedgerEntry_identity_check"
  CHECK (length(btrim("idempotencyKey")) > 0 AND ("accountReference" IS NULL OR length(btrim("accountReference")) > 0)),
  ADD CONSTRAINT "AdCreditLedgerEntry_amount_check"
  CHECK ("amount" <> 0 AND ("balanceAfter" IS NULL OR "balanceAfter" >= 0)) NOT VALID,
  ADD CONSTRAINT "AdCreditLedgerEntry_period_check"
  CHECK (
    ("periodStart" IS NULL AND "periodEnd" IS NULL)
    OR ("periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL AND "periodEnd" > "periodStart")
  );

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_identity_check"
  CHECK (length(btrim("idempotencyKey")) > 0),
  ADD CONSTRAINT "Notification_actionable_href_check"
  CHECK ("actionable" = false OR ("href" IS NOT NULL AND length(btrim("href")) > 0));

ALTER TABLE "FeedbackTicket"
  ADD CONSTRAINT "FeedbackTicket_version_check" CHECK ("version" >= 1);

ALTER TABLE "ConductReport"
  ADD CONSTRAINT "ConductReport_version_check" CHECK ("version" >= 1);
