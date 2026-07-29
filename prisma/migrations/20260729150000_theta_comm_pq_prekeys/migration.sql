-- CreateTable
CREATE TABLE "ThetaCommKyberPreKey" (
    "id" TEXT NOT NULL,
    "userDeviceId" TEXT NOT NULL,
    "keyId" INTEGER NOT NULL,
    "publicKey" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThetaCommKyberPreKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThetaCommKyberPreKey_userDeviceId_consumedAt_createdAt_idx"
ON "ThetaCommKyberPreKey"("userDeviceId", "consumedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ThetaCommKyberPreKey_userDeviceId_keyId_key"
ON "ThetaCommKyberPreKey"("userDeviceId", "keyId");

-- AddForeignKey
ALTER TABLE "ThetaCommKyberPreKey"
ADD CONSTRAINT "ThetaCommKyberPreKey_userDeviceId_fkey"
FOREIGN KEY ("userDeviceId") REFERENCES "UserDevice"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
