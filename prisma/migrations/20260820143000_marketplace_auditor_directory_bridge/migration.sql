-- Publish existing auditor and organization directory profiles into the unified marketplace.
-- Profiles remain authoritative and are not deleted or modified by this bridge.
WITH fallback_owner AS (
  SELECT "id"
  FROM "User"
  WHERE "deactivatedAt" IS NULL AND "role" IN ('GOD', 'ADMIN')
  ORDER BY CASE WHEN "role" = 'GOD' THEN 0 ELSE 1 END, "createdAt" ASC
  LIMIT 1
), eligible_profiles AS (
  SELECT
    profile.*,
    COALESCE(profile."userId", (SELECT "id" FROM fallback_owner)) AS "listingOwnerId"
  FROM "AuditorProfile" profile
  WHERE profile."active" = true
    AND profile."isOfficial" = true
    AND (profile."userId" IS NOT NULL OR (SELECT "id" FROM fallback_owner) IS NOT NULL)
    AND (
      profile."userId" IS NOT NULL OR
      profile."contactEmail" IS NOT NULL OR
      profile."phone" IS NOT NULL OR
      profile."website" IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "MarketplaceListing" listing
      WHERE listing."auditorProfileId" = profile."id"
    )
)
INSERT INTO "MarketplaceListing" (
  "id",
  "slug",
  "ownerUserId",
  "publisherKind",
  "auditorProfileId",
  "kind",
  "intent",
  "status",
  "title",
  "summary",
  "description",
  "category",
  "templateVersion",
  "attributes",
  "priceType",
  "currency",
  "city",
  "contactEmail",
  "contactPhone",
  "contactWebsite",
  "showEmail",
  "showPhone",
  "showWebsite",
  "allowInAppMessages",
  "publishedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'marketplace-auditor-' || profile."id",
  'auditor-' || profile."slug",
  profile."listingOwnerId",
  'AUDITOR'::"MarketplacePublisherKind",
  profile."id",
  'AUDITOR'::"MarketplaceListingKind",
  'OFFER'::"MarketplaceIntent",
  'ACTIVE'::"MarketplaceListingStatus",
  profile."practiceName",
  LEFT(COALESCE(profile."offerings", profile."bio", 'Contact this provider for available services.'), 280),
  COALESCE(profile."bio", profile."offerings", 'Contact this provider for current services, availability, and requirements.'),
  CASE profile."directoryKind"
    WHEN 'FIELD_AUDITOR' THEN 'Field Auditors'
    WHEN 'FIELD_GROUP' THEN 'Field Groups'
    WHEN 'CLASS_V' THEN 'Class V Orgs'
    WHEN 'SH_AO' THEN 'SH/AO'
    WHEN 'FLAG' THEN 'FLAG'
  END,
  1,
  jsonb_build_object(
    'directoryKind', CASE profile."directoryKind"
      WHEN 'FIELD_AUDITOR' THEN 'field-auditor'
      WHEN 'FIELD_GROUP' THEN 'field-group'
      WHEN 'CLASS_V' THEN 'class-v'
      WHEN 'SH_AO' THEN 'sh-ao'
      WHEN 'FLAG' THEN 'flag'
    END,
    'services', jsonb_build_array(COALESCE(profile."offerings", 'Contact for current services')),
    'travelAvailable', profile."willingToTravel",
    'remoteAvailable', false,
    'qualificationsAttested', profile."isOfficial",
    'practiceOrOrganization', profile."practiceName",
    'sourceProfileSync', true
  ),
  'CONTACT'::"MarketplacePriceType",
  'USD',
  profile."location",
  profile."contactEmail",
  profile."phone",
  profile."website",
  profile."contactEmail" IS NOT NULL,
  profile."phone" IS NOT NULL,
  profile."website" IS NOT NULL,
  profile."userId" IS NOT NULL,
  CURRENT_TIMESTAMP,
  profile."createdAt",
  CURRENT_TIMESTAMP
FROM eligible_profiles profile
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "MarketplaceListingFacet" ("id", "listingId", "key", "valueText", "createdAt")
SELECT
  'marketplace-auditor-kind-' || listing."id",
  listing."id",
  'directoryKind',
  listing."attributes" ->> 'directoryKind',
  CURRENT_TIMESTAMP
FROM "MarketplaceListing" listing
WHERE listing."kind" = 'AUDITOR'
  AND listing."attributes" ->> 'sourceProfileSync' = 'true'
  AND NOT EXISTS (
    SELECT 1 FROM "MarketplaceListingFacet" facet
    WHERE facet."listingId" = listing."id" AND facet."key" = 'directoryKind'
  );

INSERT INTO "MarketplaceListingEvent" ("id", "listingId", "actorUserId", "type", "metadata", "createdAt")
SELECT
  'marketplace-auditor-event-' || listing."id",
  listing."id",
  listing."ownerUserId",
  'PUBLISHED'::"MarketplaceListingEventType",
  jsonb_build_object('source', 'auditor-directory-bridge'),
  CURRENT_TIMESTAMP
FROM "MarketplaceListing" listing
WHERE listing."kind" = 'AUDITOR'
  AND listing."attributes" ->> 'sourceProfileSync' = 'true'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "MarketplaceFeeLedgerEntry" (
  "id", "operationId", "listingId", "userId", "action", "status", "amountCents", "currency", "metadata", "createdAt", "updatedAt"
)
SELECT
  'marketplace-auditor-fee-' || listing."id",
  'marketplace-auditor-import-' || listing."id",
  listing."id",
  listing."ownerUserId",
  'PUBLISH'::"MarketplaceFeeAction",
  'WAIVED'::"MarketplaceFeeStatus",
  0,
  listing."currency",
  jsonb_build_object('source', 'auditor-directory-bridge', 'reason', 'existing-directory-profile'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "MarketplaceListing" listing
WHERE listing."kind" = 'AUDITOR'
  AND listing."attributes" ->> 'sourceProfileSync' = 'true'
ON CONFLICT ("operationId") DO NOTHING;
