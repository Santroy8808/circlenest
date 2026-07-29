-- CreateEnum
CREATE TYPE "EncryptedChatThreadType" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "EncryptedChatParticipantRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "EncryptedChatMessageKind" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'GIF', 'FILE', 'VOICE', 'REACTION', 'EDIT', 'DELETE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EncryptedChatNotificationLevel" AS ENUM ('ALL', 'MENTIONS', 'NONE');

-- CreateEnum
CREATE TYPE "EncryptedChatUploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'ATTACHED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EncryptedChatEnvelopeType" AS ENUM ('PREKEY', 'SESSION');

-- CreateEnum
CREATE TYPE "ThetaCommSyncEventKind" AS ENUM ('MESSAGE', 'RECEIPT', 'CONVERSATION', 'MEMBERSHIP', 'DEVICE_REVOKED');

-- DropIndex
DROP INDEX "EncryptedChatParticipant_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "UserDevice" ADD COLUMN     "commIdentityKey" TEXT,
ADD COLUMN     "commKeyUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "commKeyVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "commRegistrationId" INTEGER,
ADD COLUMN     "commSignedPreKey" TEXT,
ADD COLUMN     "commSignedPreKeyId" INTEGER,
ADD COLUMN     "commSignedPreKeySignature" TEXT;

-- AlterTable
ALTER TABLE "EncryptedChatThread" ADD COLUMN     "avatarStorageKey" TEXT,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "directKey" TEXT,
ADD COLUMN     "membershipVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nextSequence" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "titleCiphertext" TEXT,
ADD COLUMN     "type" "EncryptedChatThreadType" NOT NULL DEFAULT 'DIRECT';

-- AlterTable
ALTER TABLE "EncryptedChatParticipant" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "lastReadSequence" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "leftAt" TIMESTAMP(3),
ADD COLUMN     "mutedUntil" TIMESTAMP(3),
ADD COLUMN     "notificationLevel" "EncryptedChatNotificationLevel" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "removedByUserId" TEXT,
ADD COLUMN     "role" "EncryptedChatParticipantRole" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "EncryptedChatMessage" ADD COLUMN     "clientCreatedAt" TIMESTAMP(3),
ADD COLUMN     "clientMessageId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "eventTargetMessageId" TEXT,
ADD COLUMN     "kind" "EncryptedChatMessageKind" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "membershipVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "protocolVersion" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "replyToMessageId" TEXT,
ADD COLUMN     "sequence" BIGINT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- Backfill required values for encrypted messages and participants created by
-- the first-generation ThetaComm client before enforcing the V2 constraints.
UPDATE "EncryptedChatParticipant"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

WITH ranked_messages AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "threadId"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS "sequence"
    FROM "EncryptedChatMessage"
)
UPDATE "EncryptedChatMessage" AS message
SET
    "clientMessageId" = 'legacy-' || message."id",
    "sequence" = ranked_messages."sequence",
    "updatedAt" = message."createdAt"
FROM ranked_messages
WHERE ranked_messages."id" = message."id";

UPDATE "EncryptedChatThread" AS thread
SET "nextSequence" = COALESCE((
    SELECT MAX(message."sequence")
    FROM "EncryptedChatMessage" AS message
    WHERE message."threadId" = thread."id"
), 0);

CREATE SEQUENCE "EncryptedChatMessage_sequence_seq";

SELECT setval(
    '"EncryptedChatMessage_sequence_seq"',
    GREATEST((SELECT COALESCE(MAX("sequence"), 0) + 1 FROM "EncryptedChatMessage"), 1),
    false
);

ALTER TABLE "EncryptedChatParticipant"
ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "EncryptedChatMessage"
ALTER COLUMN "clientMessageId" SET NOT NULL,
ALTER COLUMN "sequence" SET NOT NULL,
ALTER COLUMN "sequence" SET DEFAULT nextval('"EncryptedChatMessage_sequence_seq"'),
ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER SEQUENCE "EncryptedChatMessage_sequence_seq" OWNED BY "EncryptedChatMessage"."sequence";

-- AlterTable
ALTER TABLE "EncryptedChatEnvelope" ADD COLUMN     "envelopeType" "EncryptedChatEnvelopeType" NOT NULL DEFAULT 'SESSION',
ADD COLUMN     "updatedAt" TIMESTAMP(3);

UPDATE "EncryptedChatEnvelope"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

ALTER TABLE "EncryptedChatEnvelope"
ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "EncryptedChatUpload" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "ownerDeviceId" TEXT NOT NULL,
    "threadId" TEXT,
    "storageKey" TEXT NOT NULL,
    "thumbnailStorageKey" TEXT,
    "thumbnailExpectedSizeBytes" BIGINT,
    "thumbnailCiphertextSha256" TEXT,
    "ciphertextSha256" TEXT NOT NULL,
    "expectedSizeBytes" BIGINT NOT NULL,
    "uploadedSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "chunkSizeBytes" INTEGER NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "r2MultipartUploadId" TEXT,
    "status" "EncryptedChatUploadStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EncryptedChatUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedChatUploadPart" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "etag" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncryptedChatUploadPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedChatAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailStorageKey" TEXT,
    "encryptedSizeBytes" BIGINT NOT NULL,
    "chunkCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncryptedChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThetaCommPreKey" (
    "id" TEXT NOT NULL,
    "userDeviceId" TEXT NOT NULL,
    "keyId" INTEGER NOT NULL,
    "publicKey" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThetaCommPreKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThetaCommPushRegistration" (
    "id" TEXT NOT NULL,
    "userDeviceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'FCM',
    "token" TEXT NOT NULL,
    "appInstanceId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThetaCommPushRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThetaCommPushOutbox" (
    "id" TEXT NOT NULL,
    "userDeviceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThetaCommPushOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThetaCommTypingState" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThetaCommTypingState_pkey" PRIMARY KEY ("conversationId","userId","deviceId")
);

-- CreateTable
CREATE TABLE "ThetaCommDeviceTrust" (
    "id" TEXT NOT NULL,
    "verifierDeviceId" TEXT NOT NULL,
    "trustedDeviceId" TEXT NOT NULL,
    "identityKeyHash" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ThetaCommDeviceTrust_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThetaCommSyncEvent" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ThetaCommSyncEventKind" NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThetaCommSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedChatUpload_storageKey_key" ON "EncryptedChatUpload"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedChatUpload_thumbnailStorageKey_key" ON "EncryptedChatUpload"("thumbnailStorageKey");

-- CreateIndex
CREATE INDEX "EncryptedChatUpload_ownerUserId_status_createdAt_idx" ON "EncryptedChatUpload"("ownerUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EncryptedChatUpload_ownerDeviceId_status_createdAt_idx" ON "EncryptedChatUpload"("ownerDeviceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EncryptedChatUpload_threadId_status_createdAt_idx" ON "EncryptedChatUpload"("threadId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EncryptedChatUpload_expiresAt_status_idx" ON "EncryptedChatUpload"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedChatUploadPart_uploadId_partNumber_key" ON "EncryptedChatUploadPart"("uploadId", "partNumber");

-- CreateIndex
CREATE INDEX "EncryptedChatUploadPart_uploadId_completedAt_idx" ON "EncryptedChatUploadPart"("uploadId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedChatAttachment_uploadId_key" ON "EncryptedChatAttachment"("uploadId");

-- CreateIndex
CREATE INDEX "EncryptedChatAttachment_messageId_createdAt_idx" ON "EncryptedChatAttachment"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "EncryptedChatAttachment_storageKey_idx" ON "EncryptedChatAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "ThetaCommPreKey_userDeviceId_consumedAt_createdAt_idx" ON "ThetaCommPreKey"("userDeviceId", "consumedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ThetaCommPreKey_userDeviceId_keyId_key" ON "ThetaCommPreKey"("userDeviceId", "keyId");

-- CreateIndex
CREATE UNIQUE INDEX "ThetaCommPushRegistration_token_key" ON "ThetaCommPushRegistration"("token");

-- CreateIndex
CREATE INDEX "ThetaCommPushRegistration_userDeviceId_enabled_lastSeenAt_idx" ON "ThetaCommPushRegistration"("userDeviceId", "enabled", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ThetaCommPushOutbox_availableAt_sentAt_failedAt_idx" ON "ThetaCommPushOutbox"("availableAt", "sentAt", "failedAt");

-- CreateIndex
CREATE INDEX "ThetaCommPushOutbox_userDeviceId_createdAt_idx" ON "ThetaCommPushOutbox"("userDeviceId", "createdAt");

-- CreateIndex
CREATE INDEX "ThetaCommTypingState_conversationId_expiresAt_idx" ON "ThetaCommTypingState"("conversationId", "expiresAt");

-- CreateIndex
CREATE INDEX "ThetaCommTypingState_expiresAt_idx" ON "ThetaCommTypingState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ThetaCommDeviceTrust_verifierDeviceId_trustedDeviceId_key" ON "ThetaCommDeviceTrust"("verifierDeviceId", "trustedDeviceId");

-- CreateIndex
CREATE INDEX "ThetaCommDeviceTrust_trustedDeviceId_revokedAt_idx" ON "ThetaCommDeviceTrust"("trustedDeviceId", "revokedAt");

-- CreateIndex
CREATE INDEX "ThetaCommSyncEvent_userId_id_idx" ON "ThetaCommSyncEvent"("userId", "id");

-- CreateIndex
CREATE INDEX "ThetaCommSyncEvent_conversationId_id_idx" ON "ThetaCommSyncEvent"("conversationId", "id");

-- CreateIndex
CREATE INDEX "ThetaCommSyncEvent_createdAt_idx" ON "ThetaCommSyncEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedChatThread_directKey_key" ON "EncryptedChatThread"("directKey");

-- CreateIndex
CREATE INDEX "EncryptedChatThread_type_lastMessageAt_idx" ON "EncryptedChatThread"("type", "lastMessageAt");

-- CreateIndex
CREATE INDEX "EncryptedChatThread_createdByUserId_createdAt_idx" ON "EncryptedChatThread"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EncryptedChatParticipant_userId_leftAt_removedAt_archivedAt_idx" ON "EncryptedChatParticipant"("userId", "leftAt", "removedAt", "archivedAt");

-- CreateIndex
CREATE INDEX "EncryptedChatParticipant_threadId_role_createdAt_idx" ON "EncryptedChatParticipant"("threadId", "role", "createdAt");

-- CreateIndex
CREATE INDEX "EncryptedChatMessage_eventTargetMessageId_createdAt_idx" ON "EncryptedChatMessage"("eventTargetMessageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedChatMessage_senderDeviceId_clientMessageId_key" ON "EncryptedChatMessage"("senderDeviceId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedChatMessage_threadId_sequence_key" ON "EncryptedChatMessage"("threadId", "sequence");

-- AddForeignKey
ALTER TABLE "EncryptedChatThread" ADD CONSTRAINT "EncryptedChatThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatParticipant" ADD CONSTRAINT "EncryptedChatParticipant_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatMessage" ADD CONSTRAINT "EncryptedChatMessage_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "EncryptedChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatUpload" ADD CONSTRAINT "EncryptedChatUpload_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatUpload" ADD CONSTRAINT "EncryptedChatUpload_ownerDeviceId_fkey" FOREIGN KEY ("ownerDeviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatUpload" ADD CONSTRAINT "EncryptedChatUpload_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EncryptedChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatUploadPart" ADD CONSTRAINT "EncryptedChatUploadPart_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "EncryptedChatUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatAttachment" ADD CONSTRAINT "EncryptedChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EncryptedChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatAttachment" ADD CONSTRAINT "EncryptedChatAttachment_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "EncryptedChatUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThetaCommPreKey" ADD CONSTRAINT "ThetaCommPreKey_userDeviceId_fkey" FOREIGN KEY ("userDeviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThetaCommPushRegistration" ADD CONSTRAINT "ThetaCommPushRegistration_userDeviceId_fkey" FOREIGN KEY ("userDeviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThetaCommPushOutbox" ADD CONSTRAINT "ThetaCommPushOutbox_userDeviceId_fkey" FOREIGN KEY ("userDeviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThetaCommTypingState" ADD CONSTRAINT "ThetaCommTypingState_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "EncryptedChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThetaCommTypingState" ADD CONSTRAINT "ThetaCommTypingState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThetaCommTypingState" ADD CONSTRAINT "ThetaCommTypingState_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThetaCommDeviceTrust" ADD CONSTRAINT "ThetaCommDeviceTrust_verifierDeviceId_fkey" FOREIGN KEY ("verifierDeviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThetaCommDeviceTrust" ADD CONSTRAINT "ThetaCommDeviceTrust_trustedDeviceId_fkey" FOREIGN KEY ("trustedDeviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThetaCommSyncEvent" ADD CONSTRAINT "ThetaCommSyncEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

