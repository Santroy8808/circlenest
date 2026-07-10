-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN "forumEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "forumAllowPictureUploads" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StorefrontForumTopic" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "guestName" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "lastPostAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontForumTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontForumPost" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "guestName" TEXT,
    "parentPostId" TEXT,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontForumPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorefrontForumTopic_businessProfileId_deletedAt_lastPostAt_idx" ON "StorefrontForumTopic"("businessProfileId", "deletedAt", "lastPostAt");

-- CreateIndex
CREATE INDEX "StorefrontForumTopic_authorUserId_createdAt_idx" ON "StorefrontForumTopic"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "StorefrontForumTopic_deletedByUserId_deletedAt_idx" ON "StorefrontForumTopic"("deletedByUserId", "deletedAt");

-- CreateIndex
CREATE INDEX "StorefrontForumPost_topicId_deletedAt_createdAt_idx" ON "StorefrontForumPost"("topicId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "StorefrontForumPost_parentPostId_deletedAt_createdAt_idx" ON "StorefrontForumPost"("parentPostId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "StorefrontForumPost_authorUserId_createdAt_idx" ON "StorefrontForumPost"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "StorefrontForumPost_deletedByUserId_deletedAt_idx" ON "StorefrontForumPost"("deletedByUserId", "deletedAt");

-- AddForeignKey
ALTER TABLE "StorefrontForumTopic" ADD CONSTRAINT "StorefrontForumTopic_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontForumTopic" ADD CONSTRAINT "StorefrontForumTopic_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontForumTopic" ADD CONSTRAINT "StorefrontForumTopic_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontForumPost" ADD CONSTRAINT "StorefrontForumPost_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "StorefrontForumTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontForumPost" ADD CONSTRAINT "StorefrontForumPost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontForumPost" ADD CONSTRAINT "StorefrontForumPost_parentPostId_fkey" FOREIGN KEY ("parentPostId") REFERENCES "StorefrontForumPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontForumPost" ADD CONSTRAINT "StorefrontForumPost_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
