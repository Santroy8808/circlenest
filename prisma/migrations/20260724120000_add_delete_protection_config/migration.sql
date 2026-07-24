-- CreateTable
CREATE TABLE "DeleteProtectionConfig" (
    "id" TEXT NOT NULL,
    "deletePasswordHash" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeleteProtectionConfig_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DeleteProtectionConfig" ADD CONSTRAINT "DeleteProtectionConfig_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
