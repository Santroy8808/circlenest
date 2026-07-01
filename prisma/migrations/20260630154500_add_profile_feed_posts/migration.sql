ALTER TABLE "Profile"
  ADD COLUMN IF NOT EXISTS "allowProfilePosts" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "FeedPost"
  ADD COLUMN IF NOT EXISTS "targetProfileUserId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FeedPost_targetProfileUserId_fkey'
  ) THEN
    ALTER TABLE "FeedPost"
      ADD CONSTRAINT "FeedPost_targetProfileUserId_fkey"
      FOREIGN KEY ("targetProfileUserId")
      REFERENCES "User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "FeedPost_targetProfileUserId_createdAt_idx"
  ON "FeedPost"("targetProfileUserId", "createdAt");
