-- CreateTable
CREATE TABLE "UserResume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headline" TEXT,
    "executiveSummary" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "website" TEXT,
    "coreSkills" JSONB,
    "experience" JSONB,
    "education" JSONB,
    "credentials" JSONB,
    "achievements" JSONB,
    "additionalNotes" TEXT,
    "includeScientology" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'MEMBERS',
    "uploadedResumeUrl" TEXT,
    "uploadedResumeName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserResume_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserResume_userId_key" ON "UserResume"("userId");

-- AddForeignKey
ALTER TABLE "UserResume" ADD CONSTRAINT "UserResume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
