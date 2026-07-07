-- CreateEnum
CREATE TYPE "AccountPurpose" AS ENUM ('MEMBER', 'AUDITOR_SEEKER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "accountPurpose" "AccountPurpose" NOT NULL DEFAULT 'MEMBER';

-- CreateTable
CREATE TABLE "AuditorSeekerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "resolutionGoal" TEXT,
    "location" TEXT,
    "relationship" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditorSeekerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorSuccessStory" (
    "id" TEXT NOT NULL,
    "seekerProfileId" TEXT NOT NULL,
    "auditorProfileId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'MEMBERS',
    "pinnedByAuditorAt" TIMESTAMP(3),
    "removedByAuditorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditorSuccessStory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditorSeekerProfile_userId_key" ON "AuditorSeekerProfile"("userId");

-- CreateIndex
CREATE INDEX "AuditorSeekerProfile_email_createdAt_idx" ON "AuditorSeekerProfile"("email", "createdAt");

-- CreateIndex
CREATE INDEX "AuditorSuccessStory_seekerProfileId_createdAt_idx" ON "AuditorSuccessStory"("seekerProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditorSuccessStory_auditorProfileId_removedByAuditorAt_createdAt_idx" ON "AuditorSuccessStory"("auditorProfileId", "removedByAuditorAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditorSuccessStory_authorUserId_createdAt_idx" ON "AuditorSuccessStory"("authorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditorSeekerProfile" ADD CONSTRAINT "AuditorSeekerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorSuccessStory" ADD CONSTRAINT "AuditorSuccessStory_seekerProfileId_fkey" FOREIGN KEY ("seekerProfileId") REFERENCES "AuditorSeekerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorSuccessStory" ADD CONSTRAINT "AuditorSuccessStory_auditorProfileId_fkey" FOREIGN KEY ("auditorProfileId") REFERENCES "AuditorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorSuccessStory" ADD CONSTRAINT "AuditorSuccessStory_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
