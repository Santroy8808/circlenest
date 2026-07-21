-- A referenced media asset must remain READY for the complete transaction that
-- creates the reference. This trigger is the database-level backstop for all
-- current and future application writers.
CREATE OR REPLACE FUNCTION "enforceReadyMediaAssetReference"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  referenced_asset_id TEXT;
  referenced_status "MediaAssetStatus";
BEGIN
  referenced_asset_id := NULLIF(to_jsonb(NEW) ->> TG_ARGV[0], '');
  IF referenced_asset_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "status"
  INTO referenced_status
  FROM "MediaAsset"
  WHERE "id" = referenced_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced media asset is not available.'
      USING
        ERRCODE = '23503',
        CONSTRAINT = 'MEDIA_ASSET_REFERENCE_FENCE';
  END IF;

  IF referenced_status IS DISTINCT FROM 'READY'::"MediaAssetStatus" THEN
    RAISE EXCEPTION 'Referenced media asset is not ready.'
      USING
        ERRCODE = '23514',
        CONSTRAINT = 'MEDIA_ASSET_REFERENCE_FENCE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "FeedPost_ready_media_reference"
BEFORE INSERT OR UPDATE OF "mediaAssetId" ON "FeedPost"
FOR EACH ROW WHEN (NEW."mediaAssetId" IS NOT NULL)
EXECUTE FUNCTION "enforceReadyMediaAssetReference"('mediaAssetId');

CREATE TRIGGER "FeedComment_ready_media_reference"
BEFORE INSERT OR UPDATE OF "mediaAssetId" ON "FeedComment"
FOR EACH ROW WHEN (NEW."mediaAssetId" IS NOT NULL)
EXECUTE FUNCTION "enforceReadyMediaAssetReference"('mediaAssetId');

CREATE TRIGGER "AdCampaign_ready_media_reference"
BEFORE INSERT OR UPDATE OF "imageMediaAssetId" ON "AdCampaign"
FOR EACH ROW WHEN (NEW."imageMediaAssetId" IS NOT NULL)
EXECUTE FUNCTION "enforceReadyMediaAssetReference"('imageMediaAssetId');

CREATE TRIGGER "AdCampaignCreative_ready_media_reference"
BEFORE INSERT OR UPDATE OF "mediaAssetId" ON "AdCampaignCreative"
FOR EACH ROW WHEN (NEW."mediaAssetId" IS NOT NULL)
EXECUTE FUNCTION "enforceReadyMediaAssetReference"('mediaAssetId');

CREATE TRIGGER "BusinessArticle_ready_media_reference"
BEFORE INSERT OR UPDATE OF "coverMediaAssetId" ON "BusinessArticle"
FOR EACH ROW WHEN (NEW."coverMediaAssetId" IS NOT NULL)
EXECUTE FUNCTION "enforceReadyMediaAssetReference"('coverMediaAssetId');

CREATE TRIGGER "ChatAttachment_ready_media_reference"
BEFORE INSERT OR UPDATE OF "mediaAssetId" ON "ChatAttachment"
FOR EACH ROW WHEN (NEW."mediaAssetId" IS NOT NULL)
EXECUTE FUNCTION "enforceReadyMediaAssetReference"('mediaAssetId');

CREATE TRIGGER "MailAttachment_ready_media_reference"
BEFORE INSERT OR UPDATE OF "mediaAssetId" ON "MailAttachment"
FOR EACH ROW WHEN (NEW."mediaAssetId" IS NOT NULL)
EXECUTE FUNCTION "enforceReadyMediaAssetReference"('mediaAssetId');

CREATE TRIGGER "GroupForumPost_ready_media_reference"
BEFORE INSERT OR UPDATE OF "mediaAssetId" ON "GroupForumPost"
FOR EACH ROW WHEN (NEW."mediaAssetId" IS NOT NULL)
EXECUTE FUNCTION "enforceReadyMediaAssetReference"('mediaAssetId');

CREATE TRIGGER "GroupAsset_ready_media_reference"
BEFORE INSERT OR UPDATE OF "mediaAssetId" ON "GroupAsset"
FOR EACH ROW WHEN (NEW."mediaAssetId" IS NOT NULL)
EXECUTE FUNCTION "enforceReadyMediaAssetReference"('mediaAssetId');

CREATE TRIGGER "MarketListingPhoto_ready_media_reference"
BEFORE INSERT OR UPDATE OF "mediaAssetId" ON "MarketListingPhoto"
FOR EACH ROW WHEN (NEW."mediaAssetId" IS NOT NULL)
EXECUTE FUNCTION "enforceReadyMediaAssetReference"('mediaAssetId');

CREATE TRIGGER "ScientologyCommendation_ready_media_reference"
BEFORE INSERT OR UPDATE OF "mediaAssetId" ON "ScientologyCommendation"
FOR EACH ROW WHEN (NEW."mediaAssetId" IS NOT NULL)
EXECUTE FUNCTION "enforceReadyMediaAssetReference"('mediaAssetId');
