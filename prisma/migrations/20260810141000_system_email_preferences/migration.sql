CREATE TABLE "SystemEmailPreference" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "allowOptionalSystemEmails" BOOLEAN NOT NULL DEFAULT true,
    "optionalSystemEmailsUnsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemEmailPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemEmailPreference_email_key" ON "SystemEmailPreference"("email");

CREATE INDEX "SystemEmailPreference_allowOptionalSystemEmails_createdAt_idx"
ON "SystemEmailPreference"("allowOptionalSystemEmails", "createdAt");
