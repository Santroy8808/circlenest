-- CreateEnum
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "BillingJournalEntryType" AS ENUM ('INVOICE_ISSUED', 'PAYMENT_RECEIVED');

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "userId" TEXT,
    "invoiceNumber" TEXT,
    "status" "BillingInvoiceStatus" NOT NULL,
    "currency" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "amountDueCents" INTEGER NOT NULL,
    "amountPaidCents" INTEGER NOT NULL,
    "hostedInvoiceUrl" TEXT,
    "invoicePdfUrl" TEXT,
    "customerEmail" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "stripeCreatedAt" TIMESTAMP(3) NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "receiptEmailSentAt" TIMESTAMP(3),
    "receiptEmailError" TEXT,
    "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingJournalEntry" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "userId" TEXT,
    "entryType" "BillingJournalEntryType" NOT NULL,
    "debitAccount" TEXT NOT NULL,
    "creditAccount" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "retentionClass" "RecordRetentionClass" NOT NULL DEFAULT 'VITAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_stripeInvoiceId_key" ON "BillingInvoice"("stripeInvoiceId");
CREATE INDEX "BillingInvoice_userId_stripeCreatedAt_idx" ON "BillingInvoice"("userId", "stripeCreatedAt");
CREATE INDEX "BillingInvoice_status_stripeCreatedAt_idx" ON "BillingInvoice"("status", "stripeCreatedAt");
CREATE INDEX "BillingInvoice_livemode_stripeCreatedAt_idx" ON "BillingInvoice"("livemode", "stripeCreatedAt");
CREATE INDEX "BillingInvoice_stripeSubscriptionId_stripeCreatedAt_idx" ON "BillingInvoice"("stripeSubscriptionId", "stripeCreatedAt");
CREATE UNIQUE INDEX "BillingJournalEntry_operationId_key" ON "BillingJournalEntry"("operationId");
CREATE INDEX "BillingJournalEntry_invoiceId_occurredAt_idx" ON "BillingJournalEntry"("invoiceId", "occurredAt");
CREATE INDEX "BillingJournalEntry_userId_occurredAt_idx" ON "BillingJournalEntry"("userId", "occurredAt");
CREATE INDEX "BillingJournalEntry_livemode_occurredAt_idx" ON "BillingJournalEntry"("livemode", "occurredAt");
CREATE INDEX "BillingJournalEntry_debitAccount_occurredAt_idx" ON "BillingJournalEntry"("debitAccount", "occurredAt");
CREATE INDEX "BillingJournalEntry_creditAccount_occurredAt_idx" ON "BillingJournalEntry"("creditAccount", "occurredAt");

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingJournalEntry" ADD CONSTRAINT "BillingJournalEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingJournalEntry" ADD CONSTRAINT "BillingJournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
