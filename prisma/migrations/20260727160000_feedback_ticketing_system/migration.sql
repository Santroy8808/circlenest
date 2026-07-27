ALTER TYPE "UploadIntentPurpose" ADD VALUE IF NOT EXISTS 'FEEDBACK_SCREENSHOT';

ALTER TYPE "FeedbackTicketKind" ADD VALUE IF NOT EXISTS 'BUG';
ALTER TYPE "FeedbackTicketKind" ADD VALUE IF NOT EXISTS 'USABILITY';
ALTER TYPE "FeedbackTicketKind" ADD VALUE IF NOT EXISTS 'CONTENT';
ALTER TYPE "FeedbackTicketKind" ADD VALUE IF NOT EXISTS 'ACCOUNT_ACCESS';
ALTER TYPE "FeedbackTicketKind" ADD VALUE IF NOT EXISTS 'SAFETY_MODERATION';
ALTER TYPE "FeedbackTicketKind" ADD VALUE IF NOT EXISTS 'BILLING';
ALTER TYPE "FeedbackTicketKind" ADD VALUE IF NOT EXISTS 'OTHER';

CREATE TYPE "FeedbackTicketMessageType" AS ENUM ('NORMAL', 'INTERNAL');

ALTER TABLE "FeedbackTicket"
  ADD COLUMN "submissionKey" TEXT,
  ADD COLUMN "sourceRoute" TEXT,
  ADD COLUMN "sourceEntityType" TEXT,
  ADD COLUMN "sourceEntityId" TEXT,
  ADD COLUMN "pageContext" JSONB,
  ADD COLUMN "clientContext" JSONB,
  ADD COLUMN "screenshotMediaAssetId" TEXT,
  ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "FeedbackTicketEvent"
  ADD COLUMN "oldValue" JSONB,
  ADD COLUMN "newValue" JSONB;

CREATE TABLE "FeedbackTicketMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "senderUserId" TEXT,
  "type" "FeedbackTicketMessageType" NOT NULL DEFAULT 'NORMAL',
  "body" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedbackTicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedbackTicketReadState" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "normalReadAt" TIMESTAMP(3),
  "internalReadAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedbackTicketReadState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeedbackTicket_submissionKey_key" ON "FeedbackTicket"("submissionKey");
CREATE UNIQUE INDEX "FeedbackTicket_screenshotMediaAssetId_key" ON "FeedbackTicket"("screenshotMediaAssetId");
CREATE INDEX "FeedbackTicket_status_lastActivityAt_idx" ON "FeedbackTicket"("status", "lastActivityAt");
CREATE INDEX "FeedbackTicketEvent_ticketId_action_createdAt_idx" ON "FeedbackTicketEvent"("ticketId", "action", "createdAt");
CREATE UNIQUE INDEX "FeedbackTicketMessage_idempotencyKey_key" ON "FeedbackTicketMessage"("idempotencyKey");
CREATE INDEX "FeedbackTicketMessage_ticketId_createdAt_idx" ON "FeedbackTicketMessage"("ticketId", "createdAt");
CREATE INDEX "FeedbackTicketMessage_ticketId_type_createdAt_idx" ON "FeedbackTicketMessage"("ticketId", "type", "createdAt");
CREATE INDEX "FeedbackTicketMessage_senderUserId_createdAt_idx" ON "FeedbackTicketMessage"("senderUserId", "createdAt");
CREATE UNIQUE INDEX "FeedbackTicketReadState_ticketId_userId_key" ON "FeedbackTicketReadState"("ticketId", "userId");
CREATE INDEX "FeedbackTicketReadState_userId_updatedAt_idx" ON "FeedbackTicketReadState"("userId", "updatedAt");

ALTER TABLE "FeedbackTicket"
  ADD CONSTRAINT "FeedbackTicket_screenshotMediaAssetId_fkey"
  FOREIGN KEY ("screenshotMediaAssetId") REFERENCES "MediaAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FeedbackTicketMessage"
  ADD CONSTRAINT "FeedbackTicketMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "FeedbackTicket"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeedbackTicketMessage"
  ADD CONSTRAINT "FeedbackTicketMessage_senderUserId_fkey"
  FOREIGN KEY ("senderUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FeedbackTicketReadState"
  ADD CONSTRAINT "FeedbackTicketReadState_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "FeedbackTicket"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedbackTicketReadState"
  ADD CONSTRAINT "FeedbackTicketReadState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "FeedbackTicket"
SET "lastActivityAt" = "updatedAt";
