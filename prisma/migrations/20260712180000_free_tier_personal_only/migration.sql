ALTER TABLE "Membership"
ALTER COLUMN "storageLimitBytes" SET DEFAULT 209715200;

UPDATE "Membership"
SET "storageLimitBytes" = 209715200
WHERE "tier" = 'FREE';
