ALTER TABLE "FreeAccountInviteCode"
ADD COLUMN "orientationEmailedAt" TIMESTAMP(3);

UPDATE "FreeAccountInviteCode"
SET "orientationEmailedAt" = TIMESTAMP '2026-07-26 18:41:00'
WHERE "emailedAt" IS NOT NULL
  AND lower("recipientEmail") IN (
    'joanna@codybuilderssupply.com',
    'jeandprod@gmail.com',
    'suziecz@protonmail.com',
    'sayhellotosallyk@gmail.com',
    'julianne.dearmon@gmail.com',
    'ls556996@gmail.com',
    'gammaworld1@gmail.com',
    'yamiray13@gmail.com'
  );
