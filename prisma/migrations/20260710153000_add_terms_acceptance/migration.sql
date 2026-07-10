-- CreateEnum
CREATE TYPE "TermsEmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "termsEffectiveDate" TIMESTAMP(3) NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfPath" TEXT NOT NULL,
    "pdfSha256" TEXT NOT NULL,
    "emailDeliveryStatus" "TermsEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "emailSentAt" TIMESTAMP(3),
    "emailMessageId" TEXT,
    "emailError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TermsAcceptance_userId_acceptedAt_idx" ON "TermsAcceptance"("userId", "acceptedAt");

-- CreateIndex
CREATE INDEX "TermsAcceptance_termsVersion_acceptedAt_idx" ON "TermsAcceptance"("termsVersion", "acceptedAt");

-- CreateIndex
CREATE INDEX "TermsAcceptance_emailDeliveryStatus_createdAt_idx" ON "TermsAcceptance"("emailDeliveryStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "TermsAcceptance"
  ADD CONSTRAINT "TermsAcceptance_signer_check" CHECK (length(btrim("signerName")) > 0 AND length(btrim("signerEmail")) > 0 AND length(btrim("accountEmail")) > 0),
  ADD CONSTRAINT "TermsAcceptance_terms_check" CHECK (length(btrim("termsVersion")) > 0 AND length(btrim("pdfPath")) > 0 AND "pdfSha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "TermsAcceptance_delivery_check" CHECK (
    ("emailDeliveryStatus" = 'SENT' AND "emailSentAt" IS NOT NULL)
    OR ("emailDeliveryStatus" <> 'SENT')
  );
