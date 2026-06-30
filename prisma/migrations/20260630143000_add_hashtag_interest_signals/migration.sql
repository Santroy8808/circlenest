DO $$ BEGIN
  ALTER TYPE "FeedReactionType" ADD VALUE 'DISLIKE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TYPE "HashtagSignalKind" AS ENUM (
  'CREATED_TAG',
  'REACTION_LIKE',
  'REACTION_LOVE',
  'REACTION_CARE',
  'REACTION_HAHA',
  'REACTION_WOW',
  'REACTION_SAD',
  'REACTION_ANGRY',
  'REACTION_DISLIKE',
  'COMMENT',
  'SHARE'
);

CREATE TABLE "Hashtag" (
  "id" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Hashtag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedPostHashtag" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "hashtagId" TEXT NOT NULL,
  "taggedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedPostHashtag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedCommentHashtag" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "hashtagId" TEXT NOT NULL,
  "taggedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedCommentHashtag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaAssetHashtag" (
  "id" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "hashtagId" TEXT NOT NULL,
  "taggedByUserId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAssetHashtag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserHashtagSignal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "hashtagId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "signal" "HashtagSignalKind" NOT NULL,
  "weight" INTEGER NOT NULL,
  "isNegative" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserHashtagSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Hashtag_normalized_key" ON "Hashtag"("normalized");
CREATE INDEX "Hashtag_createdByUserId_createdAt_idx" ON "Hashtag"("createdByUserId", "createdAt");

CREATE UNIQUE INDEX "FeedPostHashtag_postId_hashtagId_key" ON "FeedPostHashtag"("postId", "hashtagId");
CREATE INDEX "FeedPostHashtag_hashtagId_createdAt_idx" ON "FeedPostHashtag"("hashtagId", "createdAt");
CREATE INDEX "FeedPostHashtag_taggedByUserId_createdAt_idx" ON "FeedPostHashtag"("taggedByUserId", "createdAt");

CREATE UNIQUE INDEX "FeedCommentHashtag_commentId_hashtagId_key" ON "FeedCommentHashtag"("commentId", "hashtagId");
CREATE INDEX "FeedCommentHashtag_hashtagId_createdAt_idx" ON "FeedCommentHashtag"("hashtagId", "createdAt");
CREATE INDEX "FeedCommentHashtag_taggedByUserId_createdAt_idx" ON "FeedCommentHashtag"("taggedByUserId", "createdAt");

CREATE UNIQUE INDEX "MediaAssetHashtag_mediaAssetId_hashtagId_sourceType_sourceId_key" ON "MediaAssetHashtag"("mediaAssetId", "hashtagId", "sourceType", "sourceId");
CREATE INDEX "MediaAssetHashtag_hashtagId_createdAt_idx" ON "MediaAssetHashtag"("hashtagId", "createdAt");
CREATE INDEX "MediaAssetHashtag_taggedByUserId_createdAt_idx" ON "MediaAssetHashtag"("taggedByUserId", "createdAt");
CREATE INDEX "MediaAssetHashtag_sourceType_sourceId_idx" ON "MediaAssetHashtag"("sourceType", "sourceId");

CREATE UNIQUE INDEX "UserHashtagSignal_userId_hashtagId_sourceType_sourceId_signal_key" ON "UserHashtagSignal"("userId", "hashtagId", "sourceType", "sourceId", "signal");
CREATE INDEX "UserHashtagSignal_userId_isNegative_updatedAt_idx" ON "UserHashtagSignal"("userId", "isNegative", "updatedAt");
CREATE INDEX "UserHashtagSignal_hashtagId_signal_updatedAt_idx" ON "UserHashtagSignal"("hashtagId", "signal", "updatedAt");
CREATE INDEX "UserHashtagSignal_sourceType_sourceId_idx" ON "UserHashtagSignal"("sourceType", "sourceId");

ALTER TABLE "Hashtag" ADD CONSTRAINT "Hashtag_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeedPostHashtag" ADD CONSTRAINT "FeedPostHashtag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedPostHashtag" ADD CONSTRAINT "FeedPostHashtag_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "Hashtag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedPostHashtag" ADD CONSTRAINT "FeedPostHashtag_taggedByUserId_fkey" FOREIGN KEY ("taggedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedCommentHashtag" ADD CONSTRAINT "FeedCommentHashtag_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedCommentHashtag" ADD CONSTRAINT "FeedCommentHashtag_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "Hashtag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedCommentHashtag" ADD CONSTRAINT "FeedCommentHashtag_taggedByUserId_fkey" FOREIGN KEY ("taggedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAssetHashtag" ADD CONSTRAINT "MediaAssetHashtag_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAssetHashtag" ADD CONSTRAINT "MediaAssetHashtag_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "Hashtag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAssetHashtag" ADD CONSTRAINT "MediaAssetHashtag_taggedByUserId_fkey" FOREIGN KEY ("taggedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserHashtagSignal" ADD CONSTRAINT "UserHashtagSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserHashtagSignal" ADD CONSTRAINT "UserHashtagSignal_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "Hashtag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
