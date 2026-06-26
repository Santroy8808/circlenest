CREATE TABLE "BusinessAccount" (
    "id" TEXT NOT NULL,
    "privateUserId" TEXT NOT NULL,
    "businessUserId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessAccount_businessUserId_key" ON "BusinessAccount"("businessUserId");
CREATE UNIQUE INDEX "BusinessAccount_privateUserId_businessUserId_key" ON "BusinessAccount"("privateUserId", "businessUserId");
CREATE INDEX "BusinessAccount_privateUserId_active_idx" ON "BusinessAccount"("privateUserId", "active");

ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_privateUserId_fkey" FOREIGN KEY ("privateUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_businessUserId_fkey" FOREIGN KEY ("businessUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
