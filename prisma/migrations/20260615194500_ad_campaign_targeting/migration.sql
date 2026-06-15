ALTER TABLE "Profile"
ADD COLUMN "genderIdentity" TEXT,
ADD COLUMN "birthYear" INTEGER;

ALTER TABLE "AdCampaign"
ADD COLUMN "targetCountriesJson" TEXT,
ADD COLUMN "targetStatesJson" TEXT,
ADD COLUMN "targetCitiesJson" TEXT,
ADD COLUMN "targetGendersJson" TEXT,
ADD COLUMN "targetScientologyClassificationsJson" TEXT,
ADD COLUMN "targetMinAge" INTEGER,
ADD COLUMN "targetMaxAge" INTEGER;
