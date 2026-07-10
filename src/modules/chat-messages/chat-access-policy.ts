import { ChatThreadType, Prisma, SocialRelationshipType } from "@prisma/client";
import { prisma } from "@/lib/platform/db";

export type ChatAccessMode = "read" | "interact";

export type ChatAccessContext = {
  userId: string | null;
  blockedUserIds: string[];
  visibleUserWhere: Prisma.UserWhereInput;
};

const DENY_ALL_THREADS: Prisma.ChatThreadWhereInput = { id: { in: [] } };
const DENY_ALL_USERS: Prisma.UserWhereInput = { id: { in: [] } };

export async function resolveChatAccessContext(userId?: string | null): Promise<ChatAccessContext> {
  if (!userId) {
    return {
      userId: null,
      blockedUserIds: [],
      visibleUserWhere: DENY_ALL_USERS
    };
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      deactivatedAt: null
    },
    select: {
      id: true,
      socialRelationshipsFrom: {
        where: { type: SocialRelationshipType.BLOCK },
        select: { toUserId: true }
      },
      socialRelationshipsTo: {
        where: { type: SocialRelationshipType.BLOCK },
        select: { fromUserId: true }
      }
    }
  });

  if (!user) {
    return {
      userId: null,
      blockedUserIds: [],
      visibleUserWhere: DENY_ALL_USERS
    };
  }

  const blockedUserIds = Array.from(
    new Set([
      ...user.socialRelationshipsFrom.map((relationship) => relationship.toUserId),
      ...user.socialRelationshipsTo.map((relationship) => relationship.fromUserId)
    ])
  ).filter((blockedUserId) => blockedUserId !== user.id);

  return {
    userId: user.id,
    blockedUserIds,
    visibleUserWhere: {
      id: blockedUserIds.length > 0 ? { notIn: blockedUserIds } : undefined,
      deactivatedAt: null
    }
  };
}

export function chatThreadWhereForAccess(
  context: ChatAccessContext,
  mode: ChatAccessMode
): Prisma.ChatThreadWhereInput {
  if (!context.userId) return DENY_ALL_THREADS;

  const participantWhere: Prisma.ChatThreadWhereInput = {
    participants: {
      some: {
        userId: context.userId,
        archivedAt: null
      }
    }
  };

  if (context.blockedUserIds.length === 0) return participantWhere;

  const noBlockedParticipants: Prisma.ChatThreadWhereInput = {
    participants: {
      none: {
        userId: { in: context.blockedUserIds }
      }
    }
  };

  if (mode === "interact") {
    return {
      AND: [participantWhere, noBlockedParticipants]
    };
  }

  return {
    AND: [
      participantWhere,
      {
        OR: [
          { type: { not: ChatThreadType.DIRECT } },
          noBlockedParticipants
        ]
      }
    ]
  };
}

export function scopeChatThreadWhere(
  context: ChatAccessContext,
  mode: ChatAccessMode,
  where: Prisma.ChatThreadWhereInput
): Prisma.ChatThreadWhereInput {
  return {
    AND: [chatThreadWhereForAccess(context, mode), where]
  };
}

export function visibleChatParticipantWhere(context: ChatAccessContext): Prisma.ChatParticipantWhereInput {
  return {
    user: {
      is: context.visibleUserWhere
    }
  };
}

export function visibleChatMessageWhere(
  context: ChatAccessContext,
  where: Prisma.ChatMessageWhereInput = {}
): Prisma.ChatMessageWhereInput {
  return {
    AND: [
      { deletedAt: null },
      {
        sender: {
          is: context.visibleUserWhere
        }
      },
      where
    ]
  };
}

export async function hasBlockedRelationshipWithin(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length < 2) return false;

  const block = await prisma.socialRelationship.findFirst({
    where: {
      type: SocialRelationshipType.BLOCK,
      fromUserId: { in: uniqueUserIds },
      toUserId: { in: uniqueUserIds }
    },
    select: { id: true }
  });

  return Boolean(block);
}
