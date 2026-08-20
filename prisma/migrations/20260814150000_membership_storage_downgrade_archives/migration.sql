-- CreateEnum
CREATE TYPE "MembershipStorageArchiveStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MembershipStorageArchiveItemStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "MembershipStorageArchive" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MembershipStorageArchiveStatus" NOT NULL DEFAULT 'QUEUED',
    "sourceTier" "MembershipTier" NOT NULL,
    "targetTier" "MembershipTier" NOT NULL DEFAULT 'FREE',
    "quotaBytes" BIGINT NOT NULL,
    "originalBytes" BIGINT NOT NULL DEFAULT 0,
    "archivedBytes" BIGINT NOT NULL DEFAULT 0,
    "selectedAssetCount" INTEGER NOT NULL DEFAULT 0,
    "archiveJobId" TEXT,
    "downloadStatus" "MembershipStorageArchiveStatus" NOT NULL DEFAULT 'QUEUED',
    "downloadJobId" TEXT,
    "downloadStorageKey" TEXT,
    "downloadSizeBytes" BIGINT,
    "downloadExpiresAt" TIMESTAMP(3),
    "downloadReadyAt" TIMESTAMP(3),
    "downloadNotifiedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipStorageArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipStorageArchiveItem" (
    "id" TEXT NOT NULL,
    "archiveId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "status" "MembershipStorageArchiveItemStatus" NOT NULL DEFAULT 'QUEUED',
    "position" INTEGER NOT NULL,
    "sourceStorageKey" TEXT NOT NULL,
    "sourceVisibility" "MediaVisibility" NOT NULL,
    "originalMimeType" TEXT NOT NULL,
    "originalName" TEXT,
    "originalSizeBytes" BIGINT NOT NULL,
    "archiveStorageKey" TEXT,
    "archiveMimeType" TEXT,
    "archiveCodec" TEXT,
    "archiveSizeBytes" BIGINT,
    "thumbnailStorageKey" TEXT,
    "thumbnailMimeType" TEXT,
    "thumbnailSizeBytes" BIGINT,
    "viewStatus" "MembershipStorageArchiveItemStatus" NOT NULL DEFAULT 'QUEUED',
    "viewJobId" TEXT,
    "viewStorageKey" TEXT,
    "viewMimeType" TEXT,
    "viewExpiresAt" TIMESTAMP(3),
    "error" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipStorageArchiveItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipStorageArchive_archiveJobId_key" ON "MembershipStorageArchive"("archiveJobId");
CREATE UNIQUE INDEX "MembershipStorageArchive_downloadJobId_key" ON "MembershipStorageArchive"("downloadJobId");
CREATE UNIQUE INDEX "MembershipStorageArchive_downloadStorageKey_key" ON "MembershipStorageArchive"("downloadStorageKey");
CREATE INDEX "MembershipStorageArchive_userId_status_createdAt_idx" ON "MembershipStorageArchive"("userId", "status", "createdAt");
CREATE INDEX "MembershipStorageArchive_downloadExpiresAt_idx" ON "MembershipStorageArchive"("downloadExpiresAt");
CREATE UNIQUE INDEX "MembershipStorageArchiveItem_mediaAssetId_key" ON "MembershipStorageArchiveItem"("mediaAssetId");
CREATE UNIQUE INDEX "MembershipStorageArchiveItem_archiveId_position_key" ON "MembershipStorageArchiveItem"("archiveId", "position");
CREATE UNIQUE INDEX "MembershipStorageArchiveItem_viewJobId_key" ON "MembershipStorageArchiveItem"("viewJobId");
CREATE INDEX "MembershipStorageArchiveItem_archiveId_status_position_idx" ON "MembershipStorageArchiveItem"("archiveId", "status", "position");
CREATE INDEX "MembershipStorageArchiveItem_viewExpiresAt_idx" ON "MembershipStorageArchiveItem"("viewExpiresAt");

-- AddForeignKey
ALTER TABLE "MembershipStorageArchive" ADD CONSTRAINT "MembershipStorageArchive_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipStorageArchiveItem" ADD CONSTRAINT "MembershipStorageArchiveItem_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "MembershipStorageArchive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipStorageArchiveItem" ADD CONSTRAINT "MembershipStorageArchiveItem_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
