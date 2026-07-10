-- Reconcile databases created through the historic migration chain with databases
-- that were originally created from the Prisma schema. Every operation is
-- conditional so this migration is safe for both known database shapes.

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
    JOIN pg_namespace schema_record ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = current_schema()
      AND table_record.relname = 'FeedPost'
      AND constraint_record.conname = 'FeedPost_targetProfileUserId_fkey'
  ) THEN
    ALTER TABLE "FeedPost"
      ADD CONSTRAINT "FeedPost_targetProfileUserId_fkey"
      FOREIGN KEY ("targetProfileUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- RenameIndex
DO $$
BEGIN
  IF to_regclass(format('%I.%I', current_schema(), 'AuditorSuccessStory_auditorProfileId_removedByAuditorAt_cre_idx')) IS NULL
     AND to_regclass(format('%I.%I', current_schema(), 'AuditorSuccessStory_auditorProfileId_removedByAuditorAt_created')) IS NOT NULL THEN
    ALTER INDEX "AuditorSuccessStory_auditorProfileId_removedByAuditorAt_created"
      RENAME TO "AuditorSuccessStory_auditorProfileId_removedByAuditorAt_cre_idx";
  END IF;
END
$$;

-- RenameIndex
DO $$
BEGIN
  IF to_regclass(format('%I.%I', current_schema(), 'MediaAssetHashtag_mediaAssetId_hashtagId_sourceType_sourceI_key')) IS NULL
     AND to_regclass(format('%I.%I', current_schema(), 'MediaAssetHashtag_mediaAssetId_hashtagId_sourceType_sourceId_ke')) IS NOT NULL THEN
    ALTER INDEX "MediaAssetHashtag_mediaAssetId_hashtagId_sourceType_sourceId_ke"
      RENAME TO "MediaAssetHashtag_mediaAssetId_hashtagId_sourceType_sourceI_key";
  END IF;
END
$$;

-- RenameIndex
DO $$
BEGIN
  IF to_regclass(format('%I.%I', current_schema(), 'UserHashtagSignal_userId_hashtagId_sourceType_sourceId_sign_key')) IS NULL
     AND to_regclass(format('%I.%I', current_schema(), 'UserHashtagSignal_userId_hashtagId_sourceType_sourceId_signal_k')) IS NOT NULL THEN
    ALTER INDEX "UserHashtagSignal_userId_hashtagId_sourceType_sourceId_signal_k"
      RENAME TO "UserHashtagSignal_userId_hashtagId_sourceType_sourceId_sign_key";
  END IF;
END
$$;
