ALTER TABLE "User"
ADD COLUMN "isBetaTester" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "FreeAccountInviteCode"
ADD COLUMN "betaNoticeEmailedAt" TIMESTAMP(3),
ADD COLUMN "isBetaTester" BOOLEAN NOT NULL DEFAULT true;

UPDATE "User" AS account
SET "isBetaTester" = true
WHERE EXISTS (
  SELECT 1
  FROM "FreeAccountInviteCode" AS invite
  WHERE invite."usedByUserId" = account.id
);

UPDATE "FreeAccountInviteCode"
SET "betaNoticeEmailedAt" = "emailedAt"
WHERE "emailedAt" IS NOT NULL
  AND lower("recipientEmail") IN (
    'joanna@codybuilderssupply.com',
    'jeandprod@gmail.com',
    'suziecz@protonmail.com',
    'sayhellotosallyk@gmail.com',
    'julianne.dearmon@gmail.com',
    'ls556996@gmail.com',
    'gammaworld1@gmail.com',
    'yamiray13@gmail.com',
    'mike@santroy.com'
  );
