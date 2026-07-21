-- The enum value was committed by the preceding migration. With legacy
-- application processes quiesced, make database-defaulted writes truthful too.
ALTER TABLE "FeedPost"
  ALTER COLUMN "visibility" SET DEFAULT 'PUBLIC';
