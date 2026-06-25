DO $$
BEGIN
  ALTER TYPE "MembershipTier" ADD VALUE IF NOT EXISTS 'ORG';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "BusinessProfileKind" AS ENUM ('BUSINESS', 'ORG');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MembershipSubscriptionStatus" AS ENUM ('NONE', 'INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "StripeIntegrationMode" AS ENUM ('TEST', 'LIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "StripeCheckoutKind" AS ENUM ('SUBSCRIPTION', 'CREDIT_PURCHASE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Membership"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionStatus" "MembershipSubscriptionStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "subscriptionCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "Membership_stripeSubscriptionId_key" ON "Membership"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "Membership_stripeCustomerId_idx" ON "Membership"("stripeCustomerId");
CREATE INDEX IF NOT EXISTS "Membership_subscriptionStatus_updatedAt_idx" ON "Membership"("subscriptionStatus", "updatedAt");

ALTER TABLE "SubscriptionPlanRule"
  ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT;

CREATE TABLE IF NOT EXISTS "MembershipTierUpgradeEligibility" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tier" "MembershipTier" NOT NULL,
  "reason" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MembershipTierUpgradeEligibility_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "MembershipTierUpgradeEligibility"
    ADD CONSTRAINT "MembershipTierUpgradeEligibility_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MembershipTierUpgradeEligibility"
    ADD CONSTRAINT "MembershipTierUpgradeEligibility_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "MembershipTierUpgradeEligibility_userId_tier_key" ON "MembershipTierUpgradeEligibility"("userId", "tier");
CREATE INDEX IF NOT EXISTS "MembershipTierUpgradeEligibility_tier_active_expiresAt_idx" ON "MembershipTierUpgradeEligibility"("tier", "active", "expiresAt");
CREATE INDEX IF NOT EXISTS "MembershipTierUpgradeEligibility_createdByUserId_createdAt_idx" ON "MembershipTierUpgradeEligibility"("createdByUserId", "createdAt");

CREATE TABLE IF NOT EXISTS "StripeIntegrationConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "mode" "StripeIntegrationMode" NOT NULL DEFAULT 'TEST',
  "publishableKey" TEXT,
  "secretKey" TEXT,
  "webhookSecret" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "subscriptionCheckoutEnabled" BOOLEAN NOT NULL DEFAULT true,
  "creditCheckoutEnabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StripeIntegrationConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StripeIntegrationConfig_updatedByUserId_updatedAt_idx" ON "StripeIntegrationConfig"("updatedByUserId", "updatedAt");

CREATE TABLE IF NOT EXISTS "StripeCreditPackage" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "creditAmount" INTEGER NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "stripePriceId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StripeCreditPackage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StripeCreditPackage_key_key" ON "StripeCreditPackage"("key");
CREATE INDEX IF NOT EXISTS "StripeCreditPackage_active_sortOrder_idx" ON "StripeCreditPackage"("active", "sortOrder");

CREATE TABLE IF NOT EXISTS "StripeCheckoutFulfillment" (
  "id" TEXT NOT NULL,
  "stripeCheckoutSessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "StripeCheckoutKind" NOT NULL,
  "creditPackageKey" TEXT,
  "creditsGranted" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeCheckoutFulfillment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StripeCheckoutFulfillment_stripeCheckoutSessionId_key" ON "StripeCheckoutFulfillment"("stripeCheckoutSessionId");
CREATE INDEX IF NOT EXISTS "StripeCheckoutFulfillment_userId_createdAt_idx" ON "StripeCheckoutFulfillment"("userId", "createdAt");

ALTER TABLE "BusinessProfile"
  ADD COLUMN IF NOT EXISTS "profileKind" "BusinessProfileKind" NOT NULL DEFAULT 'BUSINESS',
  ADD COLUMN IF NOT EXISTS "contactPersonName" TEXT;

ALTER TABLE "EventRsvp"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "externalName" TEXT,
  ADD COLUMN IF NOT EXISTS "externalEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmationSentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "EventRsvp_eventId_externalEmail_key" ON "EventRsvp"("eventId", "externalEmail");
CREATE INDEX IF NOT EXISTS "EventRsvp_externalEmail_idx" ON "EventRsvp"("externalEmail");
