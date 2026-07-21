import { FeedVisibility, Prisma, SocialRelationshipType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { publicStreamVisibilityFilter } from "@/modules/feed-stream/feed-visibility";

export type FeedPostPolicyAction = "view" | "interact" | "update" | "delete";

export type FeedViewerPolicy = {
  viewerUserId: string | null;
  isModerator: boolean;
  actorWhere: Prisma.UserWhereInput;
  viewWhere: Prisma.FeedPostWhereInput;
  interactionWhere: Prisma.FeedPostWhereInput;
};

const DENY_ALL_POSTS: Prisma.FeedPostWhereInput = { id: { in: [] } };
const DENY_ALL_ACTORS: Prisma.UserWhereInput = { id: { in: [] } };
const ACTIVE_STREAM_POSTS: Prisma.FeedPostWhereInput = {
  adminHoldAt: null,
  streamArchivedAt: null,
  streamDeletedAt: null
};

/**
 * A profile Stream is keyed by the owning user, never by a display identity.
 * This shared predicate keeps Home and profile queries on the same author/target
 * identity contract so a newly-created personal post is immediately visible on
 * its author's profile.
 */
export function profileFeedPrincipalWhere(profileUserId: string): Prisma.FeedPostWhereInput {
  return {
    OR: [
      {
        authorUserId: profileUserId,
        targetProfileUserId: null
      },
      {
        targetProfileUserId: profileUserId
      }
    ]
  };
}

function visibleActorWhere(viewerUserId: string): Prisma.UserWhereInput {
  return {
    OR: [
      { id: viewerUserId },
      {
        AND: [
          { deactivatedAt: null },
          {
            socialRelationshipsFrom: {
              none: {
                toUserId: viewerUserId,
                type: SocialRelationshipType.BLOCK
              }
            }
          },
          {
            socialRelationshipsTo: {
              none: {
                fromUserId: viewerUserId,
                type: {
                  in: [SocialRelationshipType.BLOCK, SocialRelationshipType.MUTE]
                }
              }
            }
          }
        ]
      }
    ]
  };
}

function visiblePostPrincipalsWhere(actorWhere: Prisma.UserWhereInput): Prisma.FeedPostWhereInput {
  return {
    AND: [
      {
        author: {
          is: actorWhere
        }
      },
      {
        OR: [
          { targetProfileUserId: null },
          {
            targetProfileUser: {
              is: actorWhere
            }
          }
        ]
      }
    ]
  };
}

export function friendAuthoredPostWhere(viewerUserId: string): Prisma.FeedPostWhereInput {
  return {
    author: {
      is: {
        socialRelationshipsFrom: {
          some: {
            toUserId: viewerUserId,
            type: SocialRelationshipType.FRIEND
          }
        },
        socialRelationshipsTo: {
          some: {
            fromUserId: viewerUserId,
            type: SocialRelationshipType.FRIEND
          }
        }
      }
    }
  };
}

export async function resolveFeedViewerPolicy(viewerUserId?: string | null): Promise<FeedViewerPolicy> {
  if (!viewerUserId) {
    return {
      viewerUserId: null,
      isModerator: false,
      actorWhere: DENY_ALL_ACTORS,
      viewWhere: DENY_ALL_POSTS,
      interactionWhere: DENY_ALL_POSTS
    };
  }

  const viewer = await prisma.user.findFirst({
    where: {
      id: viewerUserId,
      deactivatedAt: null
    },
    select: {
      role: true
    }
  });

  if (!viewer) {
    return {
      viewerUserId: null,
      isModerator: false,
      actorWhere: DENY_ALL_ACTORS,
      viewWhere: DENY_ALL_POSTS,
      interactionWhere: DENY_ALL_POSTS
    };
  }

  const isModerator = viewer.role === UserRole.ADMIN || viewer.role === UserRole.GOD;

  if (isModerator) {
    return {
      viewerUserId,
      isModerator: true,
      actorWhere: {},
      viewWhere: {},
      interactionWhere: {}
    };
  }

  const actorWhere = visibleActorWhere(viewerUserId);
  const visiblePrincipals = visiblePostPrincipalsWhere(actorWhere);
  const viewWhere: Prisma.FeedPostWhereInput = {
    AND: [
      ACTIVE_STREAM_POSTS,
      {
        OR: [
          { authorUserId: viewerUserId },
          { targetProfileUserId: viewerUserId },
          {
            AND: [
              visiblePrincipals,
              {
                visibility: publicStreamVisibilityFilter()
              }
            ]
          },
          {
            AND: [
              visiblePrincipals,
              friendAuthoredPostWhere(viewerUserId),
              {
                visibility: FeedVisibility.FRIENDS
              }
            ]
          }
        ]
      }
    ]
  };

  return {
    viewerUserId,
    isModerator: false,
    actorWhere,
    viewWhere,
    interactionWhere: {
      AND: [viewWhere, visiblePrincipals]
    }
  };
}

export function feedPostWhereForAction(
  policy: FeedViewerPolicy,
  action: FeedPostPolicyAction
): Prisma.FeedPostWhereInput {
  if (action === "view") return policy.viewWhere;
  if (action === "interact") return policy.interactionWhere;

  if (action === "update") {
    if (policy.isModerator) return {};
    if (!policy.viewerUserId) return DENY_ALL_POSTS;

    return {
      AND: [policy.viewWhere, { authorUserId: policy.viewerUserId }]
    };
  }

  if (action === "delete") {
    if (policy.isModerator) return {};
    if (!policy.viewerUserId) return DENY_ALL_POSTS;

    return {
      AND: [
        policy.viewWhere,
        {
          OR: [
            { authorUserId: policy.viewerUserId },
            { targetProfileUserId: policy.viewerUserId }
          ]
        }
      ]
    };
  }

  return DENY_ALL_POSTS;
}

export function scopeFeedPostWhere(
  policy: FeedViewerPolicy,
  action: FeedPostPolicyAction,
  where: Prisma.FeedPostWhereInput
): Prisma.FeedPostWhereInput {
  return {
    AND: [feedPostWhereForAction(policy, action), where]
  };
}
