ALTER TABLE "BusinessProfile" ADD COLUMN "legalBusinessName" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "dbaName" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "entityType" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "industry" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "supportEmail" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "publicContactEmail" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "publicContactPhone" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "businessPhone" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "streetAddress1" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "streetAddress2" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "timezone" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "bannerUrl" TEXT;

CREATE TABLE "BusinessComplianceProfile" (
  "id" TEXT NOT NULL,
  "businessProfileId" TEXT NOT NULL,
  "taxCountry" TEXT,
  "taxIdLast4" TEXT,
  "taxIdEncrypted" TEXT,
  "einLast4" TEXT,
  "einEncrypted" TEXT,
  "ownerLegalName" TEXT,
  "ownerDobEncrypted" TEXT,
  "processorAccountId" TEXT,
  "processorProvider" TEXT,
  "processorOnboardingStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "processorRequirementsJson" TEXT,
  "processorChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
  "processorPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "termsAcceptedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BusinessComplianceProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessProfileAuditLog" (
  "id" TEXT NOT NULL,
  "businessProfileId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "previousStatus" TEXT,
  "nextStatus" TEXT,
  "note" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BusinessProfileAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessComplianceProfile_businessProfileId_key" ON "BusinessComplianceProfile"("businessProfileId");
CREATE INDEX "BusinessComplianceProfile_processorProvider_processorOnboardingStatus_idx" ON "BusinessComplianceProfile"("processorProvider", "processorOnboardingStatus");
CREATE INDEX "BusinessComplianceProfile_processorChargesEnabled_processorPayoutsEnabled_idx" ON "BusinessComplianceProfile"("processorChargesEnabled", "processorPayoutsEnabled");
CREATE INDEX "BusinessProfileAuditLog_businessProfileId_createdAt_idx" ON "BusinessProfileAuditLog"("businessProfileId", "createdAt");
CREATE INDEX "BusinessProfileAuditLog_actorUserId_createdAt_idx" ON "BusinessProfileAuditLog"("actorUserId", "createdAt");
CREATE INDEX "BusinessProfileAuditLog_action_createdAt_idx" ON "BusinessProfileAuditLog"("action", "createdAt");

ALTER TABLE "BusinessComplianceProfile" ADD CONSTRAINT "BusinessComplianceProfile_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessProfileAuditLog" ADD CONSTRAINT "BusinessProfileAuditLog_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessProfileAuditLog" ADD CONSTRAINT "BusinessProfileAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
