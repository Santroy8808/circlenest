import { FeedReactionType, FeedVisibility, MediaAssetStatus, MembershipTier, Prisma, SocialRelationshipType } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { withMediaAssetReferenceValidation } from "@/lib/platform/media-asset-reference-fence";
import { normalizeOperationalMembershipTier } from "@/modules/membership-policy/policy";
import {
  attachFeedCommentHashtags,
  attachFeedPostHashtags,
  recordCommentReactionSignals,
  recordPostCommentSignal,
  recordPostReactionSignals,
  recordPostShareSignal
} from "@/modules/feed-stream/hashtag-signals.service";
import {
  type FeedPostPolicyAction,
  type FeedViewerPolicy,
  profileFeedPrincipalWhere,
  resolveFeedViewerPolicy,
  scopeFeedPostWhere,
  streamModeWhere
} from "@/modules/feed-stream/feed-viewer-policy";
import { publicStreamVisibilityFilter } from "@/modules/feed-stream/feed-visibility";
import {
  assertFeedChildWriteAllowed,
  assertFeedCommentWriteAllowed,
  assertNewFeedPostWriteAllowed
} from "@/modules/feed-stream/feed-write-fence";
import { getMembershipAccessForUser } from "@/modules/membership-policy/contributor-upgrade.service";
import { hasMembershipCapability } from "@/modules/membership-policy/membership-access";
import {
  DEFAULT_FEED_COMMENT_PAGE_LIMIT,
  type FeedPage,
  type FeedPageRequest,
  feedDescendingCursorWhere,
  parseFeedPageRequest,
  takeFeedPage
} from "@/modules/feed-stream/feed-pagination";
import { markFeedPostsViewed } from "@/modules/feed-stream/feed-retention.service";
import {
  createFeedCommentSchema,
  createFeedPostSchema,
  type FeedCommentView,
  type FeedReactionReactorsView,
  type FeedPostView,
  reactToFeedCommentSchema,
  reactToFeedPostSchema
} from "@/modules/feed-stream/types";
import {
  notifyFeedCommentCreated,
  notifyFeedCommentReaction,
  notifyFeedPostReaction
} from "@/modules/notifications-alerts/notifications-alerts.service";
import {
  assertConductTargetsAllowed,
  ConductInteractionRestrictedError,
  resolveMentionedUserIds
} from "@/modules/conduct-reporting/restrictions.service";

const MODULE_KEY = "feed-stream";
const FEED_DB_TIMEOUT_MS = 2500;
const FEED_PINNED_ANNOUNCEMENT_LIMIT = 5;
const FEED_THREAD_REPLY_PREVIEW_LIMIT = 3;

function withFeedDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), FEED_DB_TIMEOUT_MS);
    })
  ]);
}

type ReactionIdentity = {
  type: FeedReactionType;
  userId?: string | null;
  user?: { id: string } | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

function reactionTime(reaction: ReactionIdentity) {
  const value = reaction.updatedAt ?? reaction.createdAt;
  return value ? new Date(value).getTime() : 0;
}

function latestReactionPerUser<T extends ReactionIdentity>(reactions: T[]) {
  const byUser = new Map<string, T>();

  for (const reaction of reactions) {
    const userId = reaction.userId ?? reaction.user?.id;
    if (!userId) continue;

    const current = byUser.get(userId);
    if (!current || reactionTime(reaction) >= reactionTime(current)) {
      byUser.set(userId, reaction);
    }
  }

  return Array.from(byUser.values());
}

function countReactions<T extends ReactionIdentity>(reactions: T[]) {
  return latestReactionPerUser(reactions).reduce<Partial<Record<FeedReactionType, number>>>((acc, reaction) => {
    if (reaction.type === FeedReactionType.DISLIKE) return acc;
    acc[reaction.type] = (acc[reaction.type] ?? 0) + 1;
    return acc;
  }, {});
}

function reactionReactors<T extends ReactionIdentity & { user?: FeedReactionUser | null }>(reactions: T[]) {
  return latestReactionPerUser(reactions).reduce<FeedReactionReactorsView>((acc, reaction) => {
    if (reaction.type === FeedReactionType.DISLIKE) return acc;
    if (!reaction.user) return acc;
    acc[reaction.type] = [...(acc[reaction.type] ?? []), toFeedAuthorView(reaction.user)];
    return acc;
  }, {});
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

function toFeedAuthorView(user: {
  id: string;
  username: string;
  profile: { displayName: string | null; avatarUrl?: string | null } | null;
  membership?: { tier: MembershipTier } | null;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: profileName(user),
    tier: normalizeOperationalMembershipTier(user.membership?.tier),
    avatarUrl: user.profile?.avatarUrl
  } as const;
}

type FeedMediaAssetRecord = {
  id: string;
  mimeType: string;
  originalName: string | null;
};

function toFeedMediaView(mediaAsset: FeedMediaAssetRecord | null) {
  if (!mediaAsset) return null;

  const protectedUrl = `/api/media/assets/${mediaAsset.id}`;

  return {
    id: mediaAsset.id,
    publicUrl: protectedUrl,
    thumbnailUrl: protectedUrl,
    mimeType: mediaAsset.mimeType,
    originalName: mediaAsset.originalName
  };
}

type FeedReactionUser = {
  id: string;
  username: string;
  profile: { displayName: string | null; avatarUrl?: string | null } | null;
  membership?: { tier: MembershipTier } | null;
};

type FeedReactionRecord = {
  type: FeedReactionType;
  userId?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  user?: FeedReactionUser | null;
};

type FeedCommentRecord = {
  id: string;
  body: string;
  createdAt: Date;
  author: {
    id: string;
    username: string;
    profile: { displayName: string | null; avatarUrl?: string | null } | null;
    membership?: { tier: MembershipTier } | null;
  };
  mediaAsset: FeedMediaAssetRecord | null;
  reactions: FeedReactionRecord[];
  _count?: { replies: number };
  replies?: FeedCommentRecord[];
};

type FeedPostRecord = {
  id: string;
  body: string;
  visibility: FeedVisibility;
  isAdminAnnouncement: boolean;
  pinnedUntil: Date | null;
  lastViewedAt?: Date | null;
  streamCompressedAt?: Date | null;
  streamArchivedAt?: Date | null;
  streamDeletedAt?: Date | null;
  adminHoldAt?: Date | null;
  adminHoldReason?: string | null;
  adminHoldThread?: boolean;
  createdAt: Date;
  mediaAsset: FeedMediaAssetRecord | null;
  author: FeedCommentRecord["author"];
  reactions: FeedReactionRecord[];
  comments: FeedCommentRecord[];
};

export type FeedPostPage = FeedPage<FeedPostView> & {
  pinnedItems: FeedPostView[];
};

export type FeedStreamMode = "public" | "friends";

export class FeedFilterAccessError extends Error {}

export type FeedPostThreadPage = {
  post: FeedPostView | null;
  nextCursor: FeedPage<FeedCommentView>["nextCursor"];
  hasMore: boolean;
};

function feedReactionInclude(policy: FeedViewerPolicy) {
  return {
    where: {
      user: {
        is: policy.actorWhere
      }
    },
    include: {
      user: {
        include: {
          profile: true,
          membership: true
        }
      }
    }
  };
}

function feedCommentBaseInclude(policy: FeedViewerPolicy): Prisma.FeedCommentInclude {
  return {
    author: {
      include: {
        profile: true,
        membership: true
      }
    },
    mediaAsset: {
      select: {
        id: true,
        mimeType: true,
        originalName: true
      }
    },
    reactions: feedReactionInclude(policy),
    _count: {
      select: {
        replies: {
          where: {
            deletedAt: null,
            author: {
              is: policy.actorWhere
            }
          }
        }
      }
    }
  };
}

function feedCommentInclude(policy: FeedViewerPolicy, replyPreviewLimit = 0): Prisma.FeedCommentInclude {
  const baseInclude = feedCommentBaseInclude(policy);
  if (replyPreviewLimit <= 0) return baseInclude;

  return {
    ...baseInclude,
    replies: {
      where: {
        deletedAt: null,
        author: {
          is: policy.actorWhere
        }
      },
      include: feedCommentBaseInclude(policy),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: replyPreviewLimit
    }
  };
}

function toFeedCommentView(comment: FeedCommentRecord): FeedCommentView {
  const replies = comment.replies?.map((reply) => toFeedCommentView(reply));

  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: toFeedAuthorView(comment.author),
    media: toFeedMediaView(comment.mediaAsset),
    reactions: countReactions(comment.reactions),
    reactionReactors: reactionReactors(comment.reactions),
    replyCount: comment._count?.replies ?? replies?.length ?? 0,
    replies
  };
}

function toFeedPostView(post: FeedPostRecord): FeedPostView {
  return {
    id: post.id,
    body: post.body,
    visibility: post.visibility,
    isAdminAnnouncement: post.isAdminAnnouncement,
    pinnedUntil: post.pinnedUntil?.toISOString() ?? null,
    lastViewedAt: post.lastViewedAt?.toISOString() ?? null,
    streamCompressedAt: post.streamCompressedAt?.toISOString() ?? null,
    streamArchivedAt: post.streamArchivedAt?.toISOString() ?? null,
    streamDeletedAt: post.streamDeletedAt?.toISOString() ?? null,
    adminHoldAt: post.adminHoldAt?.toISOString() ?? null,
    adminHoldReason: post.adminHoldReason ?? null,
    adminHoldThread: post.adminHoldThread ?? true,
    createdAt: post.createdAt.toISOString(),
    media: toFeedMediaView(post.mediaAsset),
    author: toFeedAuthorView(post.author),
    reactions: countReactions(post.reactions),
    reactionReactors: reactionReactors(post.reactions),
    comments: post.comments.map((comment) => toFeedCommentView(comment))
  };
}

function feedPostInclude(policy: FeedViewerPolicy) {
  return {
    author: {
      include: {
        profile: true,
        membership: true
      }
    },
    mediaAsset: {
      select: {
        id: true,
        mimeType: true,
        originalName: true
      }
    },
    reactions: feedReactionInclude(policy),
    comments: {
      where: {
        parentCommentId: null,
        deletedAt: null,
        author: {
          is: policy.actorWhere
        }
      },
      include: {
        author: {
          include: {
            profile: true,
            membership: true
          }
        },
        mediaAsset: {
          select: {
            id: true,
            mimeType: true,
            originalName: true
          }
        },
        reactions: feedReactionInclude(policy),
        _count: {
          select: {
            replies: {
              where: {
                deletedAt: null,
                author: {
                  is: policy.actorWhere
                }
              }
            }
          }
        }
      },
      orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
      take: 3
    }
  };
}

function fetchFeedPostPreview(postId: string, policy: FeedViewerPolicy) {
  return prisma.feedPost.findFirst({
    where: scopeFeedPostWhere(policy, "view", { id: postId }),
    include: feedPostInclude(policy)
  });
}

async function fetchFeedPostPage(
  input: FeedPageRequest | undefined,
  policy: FeedViewerPolicy,
  mode: FeedStreamMode
) {
  const page = parseFeedPageRequest(input);
  if (!policy.viewerUserId) return { pinned: [], normal: [], page };

  const pinnedPromise = page.cursor || mode !== "public"
    ? Promise.resolve([])
    : prisma.feedPost.findMany({
        where: scopeFeedPostWhere(policy, "view", {
          targetProfileUserId: null,
          isAdminAnnouncement: true,
          visibility: publicStreamVisibilityFilter(),
          dismissals: {
            none: {
              userId: policy.viewerUserId
            }
          }
        }),
        include: feedPostInclude(policy),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: FEED_PINNED_ANNOUNCEMENT_LIMIT
      });
  const normalPromise = prisma.feedPost.findMany({
    where: scopeFeedPostWhere(policy, "view", {
      targetProfileUserId: null,
      isAdminAnnouncement: false,
      ...streamModeWhere(policy.viewerUserId, mode),
      ...feedDescendingCursorWhere(page.cursor)
    }),
    include: feedPostInclude(policy),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: page.limit + 1
  });
  const [pinned, normal] = await Promise.all([pinnedPromise, normalPromise]);

  return { pinned, normal, page };
}

async function fetchProfileFeedPostPage(
  profileUserId: string,
  input: FeedPageRequest | undefined,
  policy: FeedViewerPolicy
) {
  const page = parseFeedPageRequest(input);
  const cursorWhere = feedDescendingCursorWhere(page.cursor);

  const posts = await prisma.feedPost.findMany({
    where: scopeFeedPostWhere(policy, "view", {
      AND: [
        profileFeedPrincipalWhere(profileUserId),
        cursorWhere
      ]
    }),
    include: feedPostInclude(policy),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: page.limit + 1
  });

  return { posts, page };
}

async function fetchFeedPostThreadPage(
  postId: string,
  input: FeedPageRequest | undefined,
  policy: FeedViewerPolicy
) {
  const page = parseFeedPageRequest(input, DEFAULT_FEED_COMMENT_PAGE_LIMIT);

  const post = await prisma.feedPost.findFirst({
    where: scopeFeedPostWhere(policy, "view", { id: postId }),
    include: {
      author: {
        include: {
          profile: true,
          membership: true
        }
      },
      mediaAsset: {
        select: {
          id: true,
          mimeType: true,
          originalName: true
        }
      },
      reactions: feedReactionInclude(policy),
      comments: {
        where: {
          AND: [
            {
              parentCommentId: null,
              deletedAt: null,
              author: {
                is: policy.actorWhere
              }
            },
            feedDescendingCursorWhere(page.cursor)
          ]
        },
        include: feedCommentInclude(policy, FEED_THREAD_REPLY_PREVIEW_LIMIT),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.limit + 1
      }
    }
  });

  return { post, page };
}

async function fetchFeedCommentPage(
  postId: string,
  parentCommentId: string | null,
  input: FeedPageRequest | undefined,
  policy: FeedViewerPolicy
) {
  const page = parseFeedPageRequest(input, DEFAULT_FEED_COMMENT_PAGE_LIMIT);

  const comments = await prisma.feedComment.findMany({
    where: {
      AND: [
        {
          postId,
          parentCommentId,
          deletedAt: null,
          author: {
            is: policy.actorWhere
          },
          post: {
            is: scopeFeedPostWhere(policy, "view", { id: postId })
          }
        },
        feedDescendingCursorWhere(page.cursor)
      ]
    },
    include: feedCommentInclude(policy),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: page.limit + 1
  });

  return { comments, page };
}

async function verifyOwnedMediaAsset(userId: string, mediaAssetId?: string) {
  if (!mediaAssetId) {
    return { ok: true as const };
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaAssetId,
      ownerUserId: userId,
      status: MediaAssetStatus.READY,
      mimeType: { in: ["image/jpeg", "image/png", "image/webp", "image/gif"] }
    },
    select: {
      id: true
    }
  });

  if (!asset) {
    return { ok: false as const, error: "That image could not be attached." };
  }

  return { ok: true as const };
}

async function canCreateProfileTargetedPost(
  authorUserId: string,
  targetProfileUserId: string | null | undefined,
  policy: FeedViewerPolicy
) {
  if (!targetProfileUserId) return { ok: true as const };
  if (authorUserId === targetProfileUserId) return { ok: true as const };

  const relationshipTypes = [SocialRelationshipType.FRIEND, SocialRelationshipType.FAMILY];
  const [target, relationships] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: targetProfileUserId,
        deactivatedAt: null,
        AND: [policy.actorWhere]
      },
      select: {
        profile: {
          select: {
            allowProfilePosts: true
          }
        }
      }
    }),
    prisma.socialRelationship.findMany({
      where: {
        OR: [
          { fromUserId: authorUserId, toUserId: targetProfileUserId },
          { fromUserId: targetProfileUserId, toUserId: authorUserId }
        ]
      },
      select: {
        fromUserId: true,
        toUserId: true,
        type: true
      }
    })
  ]);

  if (!target?.profile) {
    return { ok: false as const, error: "That profile was not found." };
  }

  if (!target.profile.allowProfilePosts) {
    return { ok: false as const, error: "This profile is not accepting profile posts." };
  }

  const hasInteractionExclusion = relationships.some(
    (relationship) =>
      relationship.type === SocialRelationshipType.BLOCK || relationship.type === SocialRelationshipType.MUTE
  );

  if (hasInteractionExclusion) {
    return { ok: false as const, error: "That profile is not available for direct posts." };
  }

  const hasAcceptedSymmetricRelationship = relationshipTypes.some(
    (type) =>
      relationships.some(
        (relationship) =>
          relationship.type === type &&
          relationship.fromUserId === authorUserId &&
          relationship.toUserId === targetProfileUserId
      ) &&
      relationships.some(
        (relationship) =>
          relationship.type === type &&
          relationship.fromUserId === targetProfileUserId &&
          relationship.toUserId === authorUserId
      )
  );

  if (!hasAcceptedSymmetricRelationship) {
    return { ok: false as const, error: "Only friends and family can post directly to this profile." };
  }

  return { ok: true as const };
}

export async function listFeedPostsPage(
  input: FeedPageRequest = {},
  viewerUserId?: string,
  mode: FeedStreamMode = "public"
): Promise<FeedPostPage> {
  if (mode !== "public") {
    if (!viewerUserId) throw new FeedFilterAccessError("Contributor access is required to filter the Stream.");
    const access = await getMembershipAccessForUser(viewerUserId);
    if (!hasMembershipCapability(access, "stream.filters")) {
      throw new FeedFilterAccessError("Contributor access is required to filter the Stream.");
    }
  }
  const policy = await resolveFeedViewerPolicy(viewerUserId);
  const result = await withFeedDbTimeout(fetchFeedPostPage(input, policy, mode), "feed lookup");
  const normalPage = takeFeedPage(result.normal as unknown as FeedPostRecord[], result.page.limit);
  await markFeedPostsViewed([...result.pinned, ...normalPage.items].map((post) => post.id));

  return {
    pinnedItems: (result.pinned as unknown as FeedPostRecord[]).map(toFeedPostView),
    items: normalPage.items.map(toFeedPostView),
    nextCursor: normalPage.nextCursor,
    hasMore: normalPage.hasMore
  };
}

export async function listFeedPosts(take = 20, viewerUserId?: string) {
  const page = await listFeedPostsPage({ limit: take }, viewerUserId);
  const requestedTake = Number.isFinite(take) ? Math.max(Math.trunc(take), 0) : 20;
  return [...page.pinnedItems, ...page.items].slice(0, requestedTake);
}

export async function safeListFeedPosts(take = 20, viewerUserId?: string) {
  try {
    return await listFeedPosts(take, viewerUserId);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list feed posts.", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function listProfileFeedPostsPage(
  profileUserId: string,
  input: FeedPageRequest = {},
  viewerUserId?: string
) {
  const policy = await resolveFeedViewerPolicy(viewerUserId);
  const result = await withFeedDbTimeout(
    fetchProfileFeedPostPage(profileUserId, input, policy),
    "profile feed lookup"
  );
  const page = takeFeedPage(result.posts as unknown as FeedPostRecord[], result.page.limit);
  await markFeedPostsViewed(page.items.map((post) => post.id));

  return {
    items: page.items.map(toFeedPostView),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore
  };
}

export async function listProfileFeedPosts(profileUserId: string, take = 20, viewerUserId?: string) {
  const page = await listProfileFeedPostsPage(profileUserId, { limit: take }, viewerUserId);
  return page.items;
}

export async function safeListProfileFeedPosts(profileUserId: string, take = 20, viewerUserId?: string) {
  try {
    return await listProfileFeedPosts(profileUserId, take, viewerUserId);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list profile feed posts.", {
      profileUserId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function authorizeFeedPostAction(userId: string, postId: string, action: FeedPostPolicyAction) {
  const policy = await resolveFeedViewerPolicy(userId);

  if (!policy.viewerUserId) {
    return { ok: false as const, error: "You are not authorized to access this post." };
  }

  const post = await prisma.feedPost.findFirst({
    where: scopeFeedPostWhere(policy, action, { id: postId }),
    select: { id: true }
  });

  return post
    ? { ok: true as const, postId: post.id }
    : { ok: false as const, error: "Post not found or not available to you." };
}

export async function deleteFeedPost(userId: string, postId: string) {
  const policy = await resolveFeedViewerPolicy(userId);

  if (!policy.viewerUserId) {
    return { ok: false as const, error: "You are not authorized to delete this post." };
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const allowed = await assertFeedChildWriteAllowed(tx, { postId, actorUserId: userId });
    if (!allowed) return { count: 0 };
    return tx.feedPost.updateMany({
      where: scopeFeedPostWhere(policy, "delete", { id: postId, streamDeletedAt: null }),
      data: {
        streamDeletedAt: new Date()
      }
    });
  });

  if (deleted.count === 0) {
    return { ok: false as const, error: "Post not found or you cannot delete it." };
  }

  await diagnostics.info(MODULE_KEY, "Feed post deleted.", { userId, postId });
  return { ok: true as const };
}

export async function deleteFeedComment(userId: string, commentId: string) {
  const policy = await resolveFeedViewerPolicy(userId);

  if (!policy.viewerUserId) {
    return { ok: false as const, error: "You are not authorized to delete this comment." };
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const allowed = await assertFeedCommentWriteAllowed(tx, { commentId, actorUserId: userId });
    if (!allowed) return { count: 0 };
    return tx.feedComment.updateMany({
      where: {
        id: commentId,
        deletedAt: null,
        OR: [
          { authorUserId: userId },
          {
            post: {
              is: scopeFeedPostWhere(policy, "delete", {})
            }
          }
        ]
      },
      data: {
        deletedAt: new Date()
      }
    });
  });

  if (deleted.count === 0) {
    return { ok: false as const, error: "Comment not found or you cannot delete it." };
  }

  await diagnostics.info(MODULE_KEY, "Feed comment deleted.", { userId, commentId });
  return { ok: true as const };
}

export async function dismissFeedPost(userId: string, postId: string) {
  const policy = await resolveFeedViewerPolicy(userId);
  const post = await prisma.feedPost.findFirst({
    where: scopeFeedPostWhere(policy, "view", { id: postId }),
    select: {
      id: true,
      isAdminAnnouncement: true
    }
  });

  if (!post) {
    return { ok: false as const, error: "Post not found." };
  }

  if (!post.isAdminAnnouncement) {
    return { ok: false as const, error: "Only pinned announcements can be dismissed permanently." };
  }

  const dismissed = await prisma.$transaction(async (tx) => {
    const allowed = await assertFeedChildWriteAllowed(tx, { postId, actorUserId: userId });
    if (!allowed) return false;
    await tx.feedPostDismissal.upsert({
      where: {
        postId_userId: {
          postId,
          userId
        }
      },
      update: {},
      create: {
        postId,
        userId
      }
    });
    return true;
  });

  if (!dismissed) return { ok: false as const, error: "Post not found." };

  await diagnostics.info(MODULE_KEY, "Pinned feed announcement dismissed.", { userId, postId });
  return { ok: true as const };
}

export async function getFeedPostThreadPage(
  postId: string,
  input: FeedPageRequest = {},
  viewerUserId?: string
): Promise<FeedPostThreadPage> {
  const policy = await resolveFeedViewerPolicy(viewerUserId);
  const result = await withFeedDbTimeout(
    fetchFeedPostThreadPage(postId, input, policy),
    "feed thread lookup"
  );

  if (!result.post) {
    return { post: null, nextCursor: null, hasMore: false };
  }

  const post = result.post as unknown as FeedPostRecord;
  const comments = takeFeedPage(post.comments, result.page.limit);
  post.comments = [...comments.items].reverse();
  await markFeedPostsViewed([post.id]);

  return {
    post: toFeedPostView(post),
    nextCursor: comments.nextCursor,
    hasMore: comments.hasMore
  };
}

export async function getFeedPostThread(postId: string, viewerUserId?: string) {
  const page = await getFeedPostThreadPage(postId, {}, viewerUserId);
  return page.post;
}

export async function safeGetFeedPostThread(postId: string, viewerUserId?: string) {
  try {
    return await getFeedPostThread(postId, viewerUserId);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load feed thread.", {
      error: error instanceof Error ? error.message : "unknown",
      postId
    });
    return null;
  }
}

export async function listFeedCommentsPage(
  postId: string,
  parentCommentId: string | null,
  input: FeedPageRequest = {},
  viewerUserId?: string
): Promise<FeedPage<FeedCommentView>> {
  const policy = await resolveFeedViewerPolicy(viewerUserId);
  const result = await withFeedDbTimeout(
    fetchFeedCommentPage(postId, parentCommentId, input, policy),
    "feed comment lookup"
  );
  const page = takeFeedPage(result.comments as unknown as FeedCommentRecord[], result.page.limit);

  return {
    items: [...page.items].reverse().map(toFeedCommentView),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore
  };
}

export async function createFeedPost(authorUserId: string, input: unknown) {
  const parsed = createFeedPostSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid post." };
  }

  const policy = await resolveFeedViewerPolicy(authorUserId);

  if (!policy.viewerUserId) {
    return { ok: false as const, error: "You are not authorized to create a post." };
  }

  const [mediaCheck, profileTargetCheck] = await Promise.all([
    verifyOwnedMediaAsset(authorUserId, parsed.data.mediaAssetId || undefined),
    canCreateProfileTargetedPost(authorUserId, parsed.data.targetProfileUserId || undefined, policy)
  ]);

  if (!mediaCheck.ok) {
    return mediaCheck;
  }

  if (!profileTargetCheck.ok) {
    return profileTargetCheck;
  }

  try {
    const mentionedUserIds = await resolveMentionedUserIds(parsed.data.body);
    await assertConductTargetsAllowed(authorUserId, [
      ...mentionedUserIds,
      ...(parsed.data.targetProfileUserId ? [parsed.data.targetProfileUserId] : [])
    ]);
  } catch (error) {
    if (error instanceof ConductInteractionRestrictedError) return { ok: false as const, error: error.message };
    throw error;
  }

  const creation = await withMediaAssetReferenceValidation(() => prisma.$transaction(async (tx) => {
    await assertNewFeedPostWriteAllowed(tx, {
      actorUserId: authorUserId,
      additionalUserIds: parsed.data.targetProfileUserId ? [parsed.data.targetProfileUserId] : [],
      mediaAssetIds: parsed.data.mediaAssetId ? [parsed.data.mediaAssetId] : []
    });
    const createdPost = await tx.feedPost.create({
      data: {
        authorUserId,
        body: parsed.data.body.trim(),
        visibility: FeedVisibility.PUBLIC,
        mediaAssetId: parsed.data.mediaAssetId || undefined,
        targetProfileUserId: parsed.data.targetProfileUserId || undefined
      }
    });

    await assertFeedChildWriteAllowed(tx, {
      postId: createdPost.id,
      actorUserId: authorUserId,
      mediaAssetIds: createdPost.mediaAssetId ? [createdPost.mediaAssetId] : []
    });

    await attachFeedPostHashtags(tx, {
      actorUserId: authorUserId,
      body: createdPost.body,
      mediaAssetId: createdPost.mediaAssetId,
      postId: createdPost.id
    });

    return createdPost;
  }));
  if (!creation.ok) return creation;
  const post = creation.value;

  const postView = await fetchFeedPostPreview(post.id, policy);

  await diagnostics.info(MODULE_KEY, "Feed post created.", { authorUserId, postId: post.id });
  return { ok: true as const, post: postView ? toFeedPostView(postView as unknown as FeedPostRecord) : null };
}

export async function createFeedComment(authorUserId: string, input: unknown) {
  const parsed = createFeedCommentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  const [policy, mediaCheck] = await Promise.all([
    resolveFeedViewerPolicy(authorUserId),
    verifyOwnedMediaAsset(authorUserId, parsed.data.mediaAssetId || undefined)
  ]);

  if (!policy.viewerUserId) {
    return { ok: false as const, error: "You are not authorized to comment on this post." };
  }

  if (!mediaCheck.ok) {
    return mediaCheck;
  }

  const [postAccess, parentComment] = await Promise.all([
    prisma.feedPost.findFirst({
      where: scopeFeedPostWhere(policy, "interact", { id: parsed.data.postId }),
      select: {
        id: true,
        authorUserId: true
      }
    }),
    parsed.data.parentCommentId
      ? prisma.feedComment.findFirst({
          where: {
            id: parsed.data.parentCommentId,
            postId: parsed.data.postId,
            deletedAt: null,
            author: {
              is: policy.actorWhere
            },
            post: {
              is: scopeFeedPostWhere(policy, "interact", { id: parsed.data.postId })
            }
          },
          select: {
            id: true,
            authorUserId: true
          }
        })
      : Promise.resolve(null)
  ]);

  if (!postAccess) {
    return { ok: false as const, error: "Post not found or not available to you." };
  }

  if (parsed.data.parentCommentId && !parentComment) {
    return { ok: false as const, error: "The comment you are replying to is not available to you." };
  }

  try {
    const mentionedUserIds = await resolveMentionedUserIds(parsed.data.body);
    await assertConductTargetsAllowed(authorUserId, [
      postAccess.authorUserId,
      ...(parentComment ? [parentComment.authorUserId] : []),
      ...mentionedUserIds
    ]);
  } catch (error) {
    if (error instanceof ConductInteractionRestrictedError) return { ok: false as const, error: error.message };
    throw error;
  }

  const creation = await withMediaAssetReferenceValidation(() => prisma.$transaction(async (tx) => {
    const allowed = await assertFeedChildWriteAllowed(tx, {
      postId: parsed.data.postId,
      actorUserId: authorUserId,
      commentId: parsed.data.parentCommentId || undefined,
      mediaAssetIds: parsed.data.mediaAssetId ? [parsed.data.mediaAssetId] : []
    });
    if (!allowed) return null;

    const createdComment = await tx.feedComment.create({
      data: {
        authorUserId,
        postId: parsed.data.postId,
        parentCommentId: parsed.data.parentCommentId || undefined,
        body: parsed.data.body.trim(),
        mediaAssetId: parsed.data.mediaAssetId || undefined
      }
    });

    await attachFeedCommentHashtags(tx, {
      actorUserId: authorUserId,
      body: createdComment.body,
      commentId: createdComment.id,
      mediaAssetId: createdComment.mediaAssetId,
      postId: createdComment.postId
    });

    const notificationResult = await notifyFeedCommentCreated(authorUserId, createdComment.id, tx);
    if (!notificationResult.ok) throw new Error(notificationResult.error);

    return createdComment;
  }));
  if (!creation.ok) return creation;
  const comment = creation.value;
  if (!comment) {
    return { ok: false as const, error: "Post or parent comment is no longer available." };
  }
  await recordPostCommentSignal(authorUserId, comment.postId);

  const postView = await fetchFeedPostPreview(comment.postId, policy);

  await diagnostics.info(MODULE_KEY, "Feed comment created.", {
    authorUserId,
    postId: comment.postId,
    commentId: comment.id
  });
  return { ok: true as const, comment, post: postView ? toFeedPostView(postView as unknown as FeedPostRecord) : null };
}

export async function reactToFeedPost(userId: string, input: unknown) {
  const parsed = reactToFeedPostSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid reaction." };
  }

  const policy = await resolveFeedViewerPolicy(userId);

  if (!policy.viewerUserId) {
    return { ok: false as const, error: "You are not authorized to react to this post." };
  }

  const authorizedReaction = await prisma.$transaction(async (tx) => {
    const allowed = await assertFeedChildWriteAllowed(tx, {
      postId: parsed.data.postId,
      actorUserId: userId
    });
    if (!allowed) return null;

    const post = await tx.feedPost.findFirst({
      where: scopeFeedPostWhere(policy, "interact", { id: parsed.data.postId }),
      select: { authorUserId: true }
    });

    if (!post) return null;

    const existingReaction = await tx.feedPostReaction.findUnique({
      where: { postId_userId: { postId: parsed.data.postId, userId } }
    });

    if (existingReaction?.type === parsed.data.type) {
      await tx.feedPostReaction.delete({ where: { id: existingReaction.id } });
      return { post, reaction: null, removed: true };
    }

    const reaction = await tx.feedPostReaction.upsert({
      where: {
        postId_userId: {
          postId: parsed.data.postId,
          userId
        }
      },
      update: { type: parsed.data.type },
      create: {
        postId: parsed.data.postId,
        userId,
        type: parsed.data.type
      }
    });

    const notificationResult = await notifyFeedPostReaction(userId, parsed.data.postId, tx);
    if (!notificationResult.ok) throw new Error(notificationResult.error);

    return { post, reaction, removed: false };
  });

  if (!authorizedReaction) {
    return { ok: false as const, error: "Post not found or not available to you." };
  }

  const { reaction, removed } = authorizedReaction;

  if (!removed) await recordPostReactionSignals(userId, parsed.data.postId, parsed.data.type);

  return { ok: true as const, reaction };
}

export async function shareFeedPost(userId: string, postId: string) {
  const policy = await resolveFeedViewerPolicy(userId);

  if (!policy.viewerUserId) {
    return { ok: false as const, error: "You are not authorized to share this post." };
  }

  const post = await prisma.feedPost.findFirst({
    where: scopeFeedPostWhere(policy, "interact", { id: postId }),
    select: { id: true }
  });

  if (!post) {
    return { ok: false as const, error: "Post not found or not available to you." };
  }

  await recordPostShareSignal(userId, post.id);
  return { ok: true as const, href: `/posts/${post.id}` };
}

export async function reactToFeedComment(userId: string, input: unknown) {
  const parsed = reactToFeedCommentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid reaction." };
  }

  const policy = await resolveFeedViewerPolicy(userId);

  if (!policy.viewerUserId) {
    return { ok: false as const, error: "You are not authorized to react to this comment." };
  }

  const authorizedReaction = await prisma.$transaction(async (tx) => {
    const allowed = await assertFeedCommentWriteAllowed(tx, {
      commentId: parsed.data.commentId,
      actorUserId: userId
    });
    if (!allowed) return null;

    const comment = await tx.feedComment.findFirst({
      where: {
        id: parsed.data.commentId,
        deletedAt: null,
        author: {
          is: policy.actorWhere
        },
        post: {
          is: scopeFeedPostWhere(policy, "interact", {})
        }
      },
      select: { authorUserId: true, postId: true }
    });

    if (!comment) return null;

    const existingReaction = await tx.feedCommentReaction.findUnique({
      where: { commentId_userId: { commentId: parsed.data.commentId, userId } }
    });

    if (existingReaction?.type === parsed.data.type) {
      await tx.feedCommentReaction.delete({ where: { id: existingReaction.id } });
      return { comment, reaction: null, removed: true };
    }

    const reaction = await tx.feedCommentReaction.upsert({
      where: {
        commentId_userId: {
          commentId: parsed.data.commentId,
          userId
        }
      },
      update: { type: parsed.data.type },
      create: {
        commentId: parsed.data.commentId,
        userId,
        type: parsed.data.type
      }
    });

    const notificationResult = await notifyFeedCommentReaction(userId, parsed.data.commentId, tx);
    if (!notificationResult.ok) throw new Error(notificationResult.error);

    return { comment, reaction, removed: false };
  });

  if (!authorizedReaction) {
    return { ok: false as const, error: "Comment not found or not available to you." };
  }

  const { reaction, removed } = authorizedReaction;

  if (!removed) await recordCommentReactionSignals(userId, parsed.data.commentId, parsed.data.type);

  return { ok: true as const, reaction };
}
