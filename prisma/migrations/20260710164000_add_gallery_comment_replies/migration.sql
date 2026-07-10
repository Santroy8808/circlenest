-- AlterTable
ALTER TABLE "GalleryAssetComment" ADD COLUMN "parentCommentId" TEXT;

-- CreateIndex
CREATE INDEX "GalleryAssetComment_mediaAssetId_parentCommentId_deletedAt_createdAt_idx" ON "GalleryAssetComment"("mediaAssetId", "parentCommentId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryAssetComment_parentCommentId_deletedAt_createdAt_idx" ON "GalleryAssetComment"("parentCommentId", "deletedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "GalleryAssetComment" ADD CONSTRAINT "GalleryAssetComment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "GalleryAssetComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
