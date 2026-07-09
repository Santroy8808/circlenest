-- Add one-reaction-per-user support for gallery photos and gallery comments.
CREATE TABLE "GalleryAssetReaction" (
  "id" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "FeedReactionType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GalleryAssetReaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GalleryAssetCommentReaction" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "FeedReactionType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GalleryAssetCommentReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GalleryAssetReaction_mediaAssetId_userId_key"
  ON "GalleryAssetReaction"("mediaAssetId", "userId");

CREATE INDEX "GalleryAssetReaction_mediaAssetId_type_idx"
  ON "GalleryAssetReaction"("mediaAssetId", "type");

CREATE UNIQUE INDEX "GalleryAssetCommentReaction_commentId_userId_key"
  ON "GalleryAssetCommentReaction"("commentId", "userId");

CREATE INDEX "GalleryAssetCommentReaction_commentId_type_idx"
  ON "GalleryAssetCommentReaction"("commentId", "type");

ALTER TABLE "GalleryAssetReaction"
  ADD CONSTRAINT "GalleryAssetReaction_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GalleryAssetReaction"
  ADD CONSTRAINT "GalleryAssetReaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GalleryAssetCommentReaction"
  ADD CONSTRAINT "GalleryAssetCommentReaction_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "GalleryAssetComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GalleryAssetCommentReaction"
  ADD CONSTRAINT "GalleryAssetCommentReaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
