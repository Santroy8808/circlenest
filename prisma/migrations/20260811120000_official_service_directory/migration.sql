CREATE TYPE "AuditorDirectoryKind" AS ENUM ('CLASS_V', 'SH_AO', 'FLAG', 'FIELD_AUDITOR', 'FIELD_GROUP');

ALTER TABLE "AuditorProfile"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "directoryKind" "AuditorDirectoryKind" NOT NULL DEFAULT 'FIELD_AUDITOR',
  ADD COLUMN "address" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "isOfficial" BOOLEAN NOT NULL DEFAULT false;

UPDATE "AuditorProfile" AS profile
SET "slug" = "User"."username"
FROM "User"
WHERE profile."userId" = "User"."id";

ALTER TABLE "AuditorProfile" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "AuditorProfile" ALTER COLUMN "userId" DROP NOT NULL;

CREATE UNIQUE INDEX "AuditorProfile_slug_key" ON "AuditorProfile"("slug");
CREATE INDEX "AuditorProfile_active_directoryKind_updatedAt_idx" ON "AuditorProfile"("active", "directoryKind", "updatedAt");
CREATE INDEX "AuditorProfile_location_idx" ON "AuditorProfile"("location");

DROP INDEX IF EXISTS "AuditorProfile_active_createdAt_idx";
