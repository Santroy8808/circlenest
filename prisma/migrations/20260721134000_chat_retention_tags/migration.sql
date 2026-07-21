ALTER TABLE "ChatThread"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'STANDARD';

ALTER TABLE "EncryptedChatThread"
  ADD COLUMN "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'STANDARD';

UPDATE "ChatThread" AS thread
SET "retentionClass" = 'VITAL'
WHERE EXISTS (
  SELECT 1
  FROM "ChatParticipant" AS participant
  JOIN "User" AS account ON account."id" = participant."userId"
  WHERE participant."threadId" = thread."id"
    AND account."role" IN ('ADMIN', 'GOD')
);

UPDATE "EncryptedChatThread" AS thread
SET "retentionClass" = 'VITAL'
WHERE EXISTS (
  SELECT 1
  FROM "EncryptedChatParticipant" AS participant
  JOIN "User" AS account ON account."id" = participant."userId"
  WHERE participant."threadId" = thread."id"
    AND account."role" IN ('ADMIN', 'GOD')
);

CREATE INDEX "ChatThread_retentionClass_idx" ON "ChatThread"("retentionClass");
CREATE INDEX "EncryptedChatThread_retentionClass_idx" ON "EncryptedChatThread"("retentionClass");
