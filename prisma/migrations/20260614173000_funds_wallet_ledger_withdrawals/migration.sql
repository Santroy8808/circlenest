-- Phase 5: safe funds ledgers, isolated platform/test credits, and processor-backed withdrawals.

CREATE TABLE "RealMoneyLedgerEntry" (
  "id" TEXT NOT NULL,
  "ledgerKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "sourceProvider" TEXT,
  "sourceProviderEventId" TEXT,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "withdrawalRequestId" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RealMoneyLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformCreditLedgerEntry" (
  "id" TEXT NOT NULL,
  "ledgerKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "credits" INTEGER NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformCreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestMoneyLedgerEntry" (
  "id" TEXT NOT NULL,
  "ledgerKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "sourceType" TEXT,
  "sourceId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TestMoneyLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WithdrawalRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "batchId" TEXT,
  "processorProvider" TEXT,
  "processorTransferId" TEXT,
  "failureReason" TEXT,
  "holdReason" TEXT,
  "note" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WithdrawalBatch" (
  "id" TEXT NOT NULL,
  "batchKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "processorProvider" TEXT,
  "processedById" TEXT,
  "sentToProcessorAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "processorResponseJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WithdrawalBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RealMoneyLedgerEntry_ledgerKey_key" ON "RealMoneyLedgerEntry"("ledgerKey");
CREATE INDEX "RealMoneyLedgerEntry_userId_createdAt_idx" ON "RealMoneyLedgerEntry"("userId", "createdAt");
CREATE INDEX "RealMoneyLedgerEntry_entryType_createdAt_idx" ON "RealMoneyLedgerEntry"("entryType", "createdAt");
CREATE INDEX "RealMoneyLedgerEntry_sourceProvider_sourceProviderEventId_idx" ON "RealMoneyLedgerEntry"("sourceProvider", "sourceProviderEventId");
CREATE INDEX "RealMoneyLedgerEntry_sourceType_sourceId_createdAt_idx" ON "RealMoneyLedgerEntry"("sourceType", "sourceId", "createdAt");
CREATE INDEX "RealMoneyLedgerEntry_withdrawalRequestId_createdAt_idx" ON "RealMoneyLedgerEntry"("withdrawalRequestId", "createdAt");
CREATE UNIQUE INDEX "PlatformCreditLedgerEntry_ledgerKey_key" ON "PlatformCreditLedgerEntry"("ledgerKey");
CREATE INDEX "PlatformCreditLedgerEntry_userId_createdAt_idx" ON "PlatformCreditLedgerEntry"("userId", "createdAt");
CREATE INDEX "PlatformCreditLedgerEntry_entryType_createdAt_idx" ON "PlatformCreditLedgerEntry"("entryType", "createdAt");
CREATE INDEX "PlatformCreditLedgerEntry_sourceType_sourceId_createdAt_idx" ON "PlatformCreditLedgerEntry"("sourceType", "sourceId", "createdAt");
CREATE UNIQUE INDEX "TestMoneyLedgerEntry_ledgerKey_key" ON "TestMoneyLedgerEntry"("ledgerKey");
CREATE INDEX "TestMoneyLedgerEntry_userId_createdAt_idx" ON "TestMoneyLedgerEntry"("userId", "createdAt");
CREATE INDEX "TestMoneyLedgerEntry_entryType_createdAt_idx" ON "TestMoneyLedgerEntry"("entryType", "createdAt");
CREATE INDEX "WithdrawalRequest_userId_requestedAt_idx" ON "WithdrawalRequest"("userId", "requestedAt");
CREATE INDEX "WithdrawalRequest_status_requestedAt_idx" ON "WithdrawalRequest"("status", "requestedAt");
CREATE INDEX "WithdrawalRequest_batchId_status_idx" ON "WithdrawalRequest"("batchId", "status");
CREATE INDEX "WithdrawalRequest_processorProvider_processorTransferId_idx" ON "WithdrawalRequest"("processorProvider", "processorTransferId");
CREATE UNIQUE INDEX "WithdrawalBatch_batchKey_key" ON "WithdrawalBatch"("batchKey");
CREATE INDEX "WithdrawalBatch_status_scheduledFor_idx" ON "WithdrawalBatch"("status", "scheduledFor");
CREATE INDEX "WithdrawalBatch_processorProvider_scheduledFor_idx" ON "WithdrawalBatch"("processorProvider", "scheduledFor");

ALTER TABLE "RealMoneyLedgerEntry" ADD CONSTRAINT "RealMoneyLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealMoneyLedgerEntry" ADD CONSTRAINT "RealMoneyLedgerEntry_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "WithdrawalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformCreditLedgerEntry" ADD CONSTRAINT "PlatformCreditLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestMoneyLedgerEntry" ADD CONSTRAINT "TestMoneyLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WithdrawalBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WithdrawalBatch" ADD CONSTRAINT "WithdrawalBatch_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
