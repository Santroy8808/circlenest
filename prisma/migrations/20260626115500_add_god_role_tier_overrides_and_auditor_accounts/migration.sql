ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'GOD';

CREATE TABLE "AuditorAccount" (
    "id" TEXT NOT NULL,
    "privateUserId" TEXT NOT NULL,
    "auditorUserId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditorAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditorAccount_auditorUserId_key" ON "AuditorAccount"("auditorUserId");
CREATE UNIQUE INDEX "AuditorAccount_privateUserId_auditorUserId_key" ON "AuditorAccount"("privateUserId", "auditorUserId");
CREATE INDEX "AuditorAccount_privateUserId_active_idx" ON "AuditorAccount"("privateUserId", "active");

ALTER TABLE "AuditorAccount" ADD CONSTRAINT "AuditorAccount_privateUserId_fkey" FOREIGN KEY ("privateUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditorAccount" ADD CONSTRAINT "AuditorAccount_auditorUserId_fkey" FOREIGN KEY ("auditorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MembershipTierFeatureOverride" (
    "id" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL,
    "featureKey" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipTierFeatureOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MembershipTierFeatureOverride_tier_featureKey_key" ON "MembershipTierFeatureOverride"("tier", "featureKey");
CREATE INDEX "MembershipTierFeatureOverride_featureKey_allowed_idx" ON "MembershipTierFeatureOverride"("featureKey", "allowed");
CREATE INDEX "MembershipTierFeatureOverride_createdByUserId_updatedAt_idx" ON "MembershipTierFeatureOverride"("createdByUserId", "updatedAt");

ALTER TABLE "MembershipTierFeatureOverride" ADD CONSTRAINT "MembershipTierFeatureOverride_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
