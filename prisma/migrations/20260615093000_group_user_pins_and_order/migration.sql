ALTER TABLE "GroupMember" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GroupMember" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GroupMember" ADD COLUMN "isProvider" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "GroupMember_userId_isPinned_sortOrder_idx" ON "GroupMember"("userId", "isPinned", "sortOrder");

ALTER TABLE "GroupForumThread" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "GroupForumThread" ADD COLUMN "endedAt" DATETIME;
ALTER TABLE "GroupForumThread" ADD COLUMN "endedById" TEXT;
ALTER TABLE "GroupDocument" ADD COLUMN "sizeBytes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GroupPhoto" ADD COLUMN "sizeBytes" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "GroupForumThread_groupId_status_updatedAt_idx" ON "GroupForumThread"("groupId", "status", "updatedAt");

CREATE TABLE "GroupForumThreadPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupForumThreadPreference_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "GroupForumThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupForumThreadPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GroupForumThreadPreference_threadId_userId_key" ON "GroupForumThreadPreference"("threadId", "userId");
CREATE INDEX "GroupForumThreadPreference_userId_isPinned_sortOrder_idx" ON "GroupForumThreadPreference"("userId", "isPinned", "sortOrder");

CREATE TABLE "GroupPhotoComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "photoId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "content" TEXT NOT NULL,
    "mediaUrlsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupPhotoComment_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "GroupPhoto" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupPhotoComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "GroupPhotoComment_photoId_createdAt_idx" ON "GroupPhotoComment"("photoId", "createdAt");
CREATE INDEX "GroupPhotoComment_photoId_parentCommentId_createdAt_idx" ON "GroupPhotoComment"("photoId", "parentCommentId", "createdAt");
CREATE INDEX "GroupPhotoComment_authorId_createdAt_idx" ON "GroupPhotoComment"("authorId", "createdAt");
