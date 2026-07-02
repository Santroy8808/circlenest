ALTER TABLE "FamilyRelationshipRequest" ADD COLUMN "notificationId" TEXT;
ALTER TABLE "FriendRelationshipRequest" ADD COLUMN "notificationId" TEXT;

CREATE INDEX "FamilyRelationshipRequest_notificationId_idx" ON "FamilyRelationshipRequest"("notificationId");
CREATE INDEX "FriendRelationshipRequest_notificationId_idx" ON "FriendRelationshipRequest"("notificationId");
