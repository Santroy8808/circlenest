-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('CREATED', 'UPLOADING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "PlatformJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN "status" "MediaAssetStatus" NOT NULL DEFAULT 'READY';

-- CreateTable
CREATE TABLE "PlatformJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "PlatformJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAsset_status_updatedAt_idx" ON "MediaAsset"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "PlatformJob_status_runAfter_createdAt_idx" ON "PlatformJob"("status", "runAfter", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformJob_kind_status_runAfter_idx" ON "PlatformJob"("kind", "status", "runAfter");

-- CreateIndex
CREATE INDEX "PlatformJob_lockedAt_idx" ON "PlatformJob"("lockedAt");
