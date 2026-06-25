DO $$
BEGIN
  CREATE TYPE "FriendRelationshipRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "FriendRelationshipRequest" (
  "id" TEXT NOT NULL,
  "requesterUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "status" "FriendRelationshipRequestStatus" NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "alertId" TEXT,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FriendRelationshipRequest_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "FriendRelationshipRequest"
    ADD CONSTRAINT "FriendRelationshipRequest_requesterUserId_fkey"
    FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "FriendRelationshipRequest"
    ADD CONSTRAINT "FriendRelationshipRequest_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "FriendRelationshipRequest_requesterUserId_status_createdAt_idx" ON "FriendRelationshipRequest"("requesterUserId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "FriendRelationshipRequest_targetUserId_status_createdAt_idx" ON "FriendRelationshipRequest"("targetUserId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "FriendRelationshipRequest_alertId_idx" ON "FriendRelationshipRequest"("alertId");
