-- Phase 6: payment processor configuration, secret-presence checks, and webhook health.

CREATE TABLE "PaymentProcessorConfig" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'SANDBOX',
  "displayName" TEXT NOT NULL,
  "publicKeyLabel" TEXT,
  "publicKeyFingerprint" TEXT,
  "secretEnvVarName" TEXT,
  "webhookSecretEnvVarName" TEXT,
  "secretConfigured" BOOLEAN NOT NULL DEFAULT false,
  "webhookSecretConfigured" BOOLEAN NOT NULL DEFAULT false,
  "enabledFlowsJson" TEXT,
  "platformFeeBps" INTEGER NOT NULL DEFAULT 0,
  "withdrawalBatchScheduleJson" TEXT,
  "processorAccountStatus" TEXT,
  "webhookHealthStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "metadataJson" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentProcessorConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentProcessorWebhookEvent" (
  "id" TEXT NOT NULL,
  "processorConfigId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "reviewedById" TEXT,
  "metadataJson" TEXT,

  CONSTRAINT "PaymentProcessorWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentProcessorConfig_provider_area_mode_key" ON "PaymentProcessorConfig"("provider", "area", "mode");
CREATE INDEX "PaymentProcessorConfig_area_isEnabled_mode_idx" ON "PaymentProcessorConfig"("area", "isEnabled", "mode");
CREATE INDEX "PaymentProcessorConfig_provider_webhookHealthStatus_idx" ON "PaymentProcessorConfig"("provider", "webhookHealthStatus");
CREATE UNIQUE INDEX "PaymentProcessorWebhookEvent_provider_eventId_key" ON "PaymentProcessorWebhookEvent"("provider", "eventId");
CREATE INDEX "PaymentProcessorWebhookEvent_processorConfigId_receivedAt_idx" ON "PaymentProcessorWebhookEvent"("processorConfigId", "receivedAt");
CREATE INDEX "PaymentProcessorWebhookEvent_status_receivedAt_idx" ON "PaymentProcessorWebhookEvent"("status", "receivedAt");
CREATE INDEX "PaymentProcessorWebhookEvent_eventType_receivedAt_idx" ON "PaymentProcessorWebhookEvent"("eventType", "receivedAt");

ALTER TABLE "PaymentProcessorConfig" ADD CONSTRAINT "PaymentProcessorConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentProcessorWebhookEvent" ADD CONSTRAINT "PaymentProcessorWebhookEvent_processorConfigId_fkey" FOREIGN KEY ("processorConfigId") REFERENCES "PaymentProcessorConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentProcessorWebhookEvent" ADD CONSTRAINT "PaymentProcessorWebhookEvent_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
