-- Official church and auditor directory profiles are searchable directory records,
-- not marketplace listings. Preserve the bridge rows for audit/history, but retire
-- them from every active listing surface.
UPDATE "MarketplaceListing"
SET
  "status" = 'ARCHIVED'::"MarketplaceListingStatus",
  "attributes" = COALESCE("attributes", '{}'::jsonb) || jsonb_build_object(
    'directoryOnly', true,
    'marketplaceBridgeRetiredAt', CURRENT_TIMESTAMP
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "kind" = 'AUDITOR'::"MarketplaceListingKind"
  AND "attributes" ->> 'sourceProfileSync' = 'true';
