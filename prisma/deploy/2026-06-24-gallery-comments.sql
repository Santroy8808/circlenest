CREATE TABLE IF NOT EXISTS "GalleryAssetComment" (
  "id" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GalleryAssetComment_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GalleryAssetComment_mediaAssetId_fkey'
  ) THEN
    ALTER TABLE "GalleryAssetComment"
      ADD CONSTRAINT "GalleryAssetComment_mediaAssetId_fkey"
      FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GalleryAssetComment_authorUserId_fkey'
  ) THEN
    ALTER TABLE "GalleryAssetComment"
      ADD CONSTRAINT "GalleryAssetComment_authorUserId_fkey"
      FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "GalleryAssetComment_mediaAssetId_deletedAt_createdAt_idx"
  ON "GalleryAssetComment"("mediaAssetId", "deletedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "GalleryAssetComment_authorUserId_createdAt_idx"
  ON "GalleryAssetComment"("authorUserId", "createdAt");
