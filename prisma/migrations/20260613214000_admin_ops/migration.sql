-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "heldAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "verificationNotes" TEXT,
ADD COLUMN     "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlatformFeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformCategory" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAnnouncement" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "targetUrl" TEXT,
    "audienceType" TEXT NOT NULL DEFAULT 'GLOBAL',
    "audienceValueJson" TEXT,
    "deliveryModesJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSupportNote" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSupportNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReplayRequest" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payloadSummary" TEXT,
    "resultSummary" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replayedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookReplayRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataPrivacyRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT,
    "requesterEmail" TEXT,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "handledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataPrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformThrottle" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "throttleKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformThrottle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFeatureFlag_key_key" ON "PlatformFeatureFlag"("key");

-- CreateIndex
CREATE INDEX "PlatformFeatureFlag_enabled_updatedAt_idx" ON "PlatformFeatureFlag"("enabled", "updatedAt");

-- CreateIndex
CREATE INDEX "PlatformCategory_area_isActive_sortOrder_idx" ON "PlatformCategory"("area", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformCategory_area_slug_key" ON "PlatformCategory"("area", "slug");

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_status_publishedAt_idx" ON "PlatformAnnouncement"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "PlatformAnnouncement_audienceType_createdAt_idx" ON "PlatformAnnouncement"("audienceType", "createdAt");

-- CreateIndex
CREATE INDEX "AdminSupportNote_targetType_targetId_createdAt_idx" ON "AdminSupportNote"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminSupportNote_authorUserId_createdAt_idx" ON "AdminSupportNote"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookReplayRequest_provider_eventId_idx" ON "WebhookReplayRequest"("provider", "eventId");

-- CreateIndex
CREATE INDEX "WebhookReplayRequest_status_requestedAt_idx" ON "WebhookReplayRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "DataPrivacyRequest_status_createdAt_idx" ON "DataPrivacyRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DataPrivacyRequest_requesterId_createdAt_idx" ON "DataPrivacyRequest"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "DataPrivacyRequest_requesterEmail_createdAt_idx" ON "DataPrivacyRequest"("requesterEmail", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformThrottle_targetType_targetId_status_idx" ON "PlatformThrottle"("targetType", "targetId", "status");

-- CreateIndex
CREATE INDEX "PlatformThrottle_throttleKey_status_idx" ON "PlatformThrottle"("throttleKey", "status");

-- CreateIndex
CREATE INDEX "PlatformThrottle_expiresAt_idx" ON "PlatformThrottle"("expiresAt");

-- CreateIndex
CREATE INDEX "BusinessProfile_status_verificationStatus_createdAt_idx" ON "BusinessProfile"("status", "verificationStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformFeatureFlag" ADD CONSTRAINT "PlatformFeatureFlag_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCategory" ADD CONSTRAINT "PlatformCategory_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAnnouncement" ADD CONSTRAINT "PlatformAnnouncement_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSupportNote" ADD CONSTRAINT "AdminSupportNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookReplayRequest" ADD CONSTRAINT "WebhookReplayRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataPrivacyRequest" ADD CONSTRAINT "DataPrivacyRequest_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformThrottle" ADD CONSTRAINT "PlatformThrottle_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

