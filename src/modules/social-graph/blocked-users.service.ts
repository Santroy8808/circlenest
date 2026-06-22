import { SocialRelationshipType } from "@prisma/client";
import { prisma } from "@/lib/platform/db";

export type BlockedUserView = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  blockedAt: string;
};

export async function listBlockedUsers(viewerUserId: string): Promise<BlockedUserView[]> {
  const relationships = await prisma.socialRelationship.findMany({
    where: {
      fromUserId: viewerUserId,
      type: SocialRelationshipType.BLOCK
    },
    orderBy: { createdAt: "desc" },
    include: {
      toUser: {
        select: {
          id: true,
          username: true,
          profile: {
            select: {
              displayName: true,
              avatarUrl: true
            }
          }
        }
      }
    }
  });

  return relationships.map((relationship) => ({
    id: relationship.toUser.id,
    displayName: relationship.toUser.profile?.displayName ?? relationship.toUser.username,
    username: relationship.toUser.username,
    avatarUrl: relationship.toUser.profile?.avatarUrl ?? null,
    blockedAt: relationship.createdAt.toISOString()
  }));
}
