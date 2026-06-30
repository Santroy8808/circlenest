import { FeedReactionType, FeedVisibility, MembershipTier, Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  attachFeedCommentHashtags,
  attachFeedPostHashtags,
  recordCommentReactionSignals,
  recordPostCommentSignal,
  recordPostReactionSignals
} from "@/modules/feed-stream/hashtag-signals.service";
import {
  createFeedCommentSchema,
  createFeedPostSchema,
  type FeedCommentView,
  type FeedReactionReactorsView,
  type FeedPostView,
  reactToFeedCommentSchema,
  reactToFeedPostSchema
} from "@/modules/feed-stream/types";

const MODULE_KEY = "feed-stream";
const FEED_DB_TIMEOUT_MS = 2500;
const FEED_THREAD_REPLY_DEPTH = 8;

function withFeedDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), FEED_DB_TIMEOUT_MS);
    })
  ]);
}

function countReactions<T extends { type: FeedReactionType }>(reactions: T[]) {
  return reactions.reduce<Partial<Record<FeedReactionType, number>>>((acc, reaction) => {
    if (reaction.type === FeedReactionType.DISLIKE) return acc;
    acc[reaction.type] = (acc[reaction.type] ?? 0) + 1;
    return acc;
  }, {});
}

function reactionReactors<T extends { type: FeedReactionType; user?: FeedReactionUser | null }>(reactions: T[]) {
  return reactions.reduce<FeedReactionReactorsView>((acc, reaction) => {
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
    tier: user.membership?.tier ?? MembershipTier.FREE,
    avatarUrl: user.profile?.avatarUrl
  } as const;
}

function toFeedMediaView(mediaAsset: {
  id: string;
  publicUrl: string | null;
  mimeType: string;
  originalName: string | null;
} | null) {
  if (!mediaAsset) return null;

  return {
    id: mediaAsset.id,
    publicUrl: `/api/media/assets/${mediaAsset.id}`,
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
  mediaAsset: {
    id: string;
    publicUrl: string | null;
    mimeType: string;
    originalName: string | null;
  } | null;
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
  createdAt: Date;
  mediaAsset: {
    id: string;
    publicUrl: string | null;
    mimeType: string;
    originalName: string | null;
  } | null;
  author: FeedCommentRecord["author"];
  reactions: FeedReactionRecord[];
  comments: FeedCommentRecord[];
};

function feedReactionInclude() {
  return {
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

function feedThreadCommentInclude(depth: number): Prisma.FeedCommentInclude {
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
        publicUrl: true,
        mimeType: true,
        originalName: true
      }
    },
    reactions: feedReactionInclude(),
    _count: {
      select: {
        replies: {
          where: { deletedAt: null }
        }
      }
    },
    ...(depth > 0
      ? {
          replies: {
            where: { deletedAt: null },
            include: feedThreadCommentInclude(depth - 1),
            orderBy: { createdAt: "asc" as const }
          }
        }
      : {})
  };
}

function toFeedCommentView(comment: FeedCommentRecord): FeedCommentView {
  const replies = comment.replies?.map(toFeedCommentView);

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
    createdAt: post.createdAt.toISOString(),
    media: toFeedMediaView(post.mediaAsset),
    author: toFeedAuthorView(post.author),
    reactions: countReactions(post.reactions),
    reactionReactors: reactionReactors(post.reactions),
    comments: post.comments.map(toFeedCommentView)
  };
}

function feedPostInclude() {
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
        publicUrl: true,
        mimeType: true,
        originalName: true
      }
    },
    reactions: feedReactionInclude(),
    comments: {
      where: {
        parentCommentId: null,
        deletedAt: null
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
            publicUrl: true,
            mimeType: true,
            originalName: true
          }
        },
        reactions: feedReactionInclude(),
        _count: {
          select: {
            replies: {
              where: { deletedAt: null }
            }
          }
        }
      },
      orderBy: { createdAt: "asc" as const },
      take: 3
    }
  };
}

async function fetchFeedPosts(take: number, viewerUserId?: string) {
  const pinned = viewerUserId
    ? await prisma.feedPost.findMany({
        where: {
          visibility: {
            in: [FeedVisibility.MEMBERS, FeedVisibility.FRIENDS]
          },
          isAdminAnnouncement: true,
          dismissals: {
            none: {
              userId: viewerUserId
            }
          }
        },
        include: feedPostInclude(),
        orderBy: { createdAt: "desc" },
        take: 5
      })
    : [];
  const normalTake = Math.max(take - pinned.length, 0);
  const normal = await prisma.feedPost.findMany({
    where: {
      visibility: {
        in: [FeedVisibility.MEMBERS, FeedVisibility.FRIENDS]
      },
      isAdminAnnouncement: false
    },
    include: feedPostInclude(),
    orderBy: { createdAt: "desc" },
    take: normalTake
  });

  return [...pinned, ...normal];
}

function fetchFeedPostThread(postId: string) {
  return prisma.feedPost.findFirst({
    where: {
      id: postId,
      visibility: {
        in: [FeedVisibility.MEMBERS, FeedVisibility.FRIENDS]
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
          publicUrl: true,
          mimeType: true,
          originalName: true
        }
      },
      reactions: feedReactionInclude(),
      comments: {
        where: {
          parentCommentId: null,
          deletedAt: null
        },
        include: feedThreadCommentInclude(FEED_THREAD_REPLY_DEPTH),
        orderBy: { createdAt: "asc" }
      }
    }
  });
}

async function verifyOwnedMediaAsset(userId: string, mediaAssetId?: string) {
  if (!mediaAssetId) {
    return { ok: true as const };
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaAssetId,
      ownerUserId: userId,
      mimeType: {
        startsWith: "image/"
      }
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

export async function listFeedPosts(take = 20, viewerUserId?: string) {
  const posts = await withFeedDbTimeout(fetchFeedPosts(take, viewerUserId), "feed lookup");
  return posts.map(toFeedPostView);
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

export async function dismissFeedPost(userId: string, postId: string) {
  const post = await prisma.feedPost.findUnique({
    where: { id: postId },
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

  await prisma.feedPostDismissal.upsert({
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

  await diagnostics.info(MODULE_KEY, "Pinned feed announcement dismissed.", { userId, postId });
  return { ok: true as const };
}

export async function getFeedPostThread(postId: string) {
  const post = await withFeedDbTimeout(fetchFeedPostThread(postId), "feed thread lookup");
  return post ? toFeedPostView(post as unknown as FeedPostRecord) : null;
}

export async function safeGetFeedPostThread(postId: string) {
  try {
    return await getFeedPostThread(postId);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load feed thread.", {
      error: error instanceof Error ? error.message : "unknown",
      postId
    });
    return null;
  }
}

export async function createFeedPost(authorUserId: string, input: unknown) {
  const parsed = createFeedPostSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid post." };
  }

  const mediaCheck = await verifyOwnedMediaAsset(authorUserId, parsed.data.mediaAssetId || undefined);

  if (!mediaCheck.ok) {
    return mediaCheck;
  }

  const post = await prisma.$transaction(async (tx) => {
    const createdPost = await tx.feedPost.create({
      data: {
        authorUserId,
        body: parsed.data.body.trim(),
        visibility: parsed.data.visibility,
        mediaAssetId: parsed.data.mediaAssetId || undefined
      }
    });

    await attachFeedPostHashtags(tx, {
      actorUserId: authorUserId,
      body: createdPost.body,
      mediaAssetId: createdPost.mediaAssetId,
      postId: createdPost.id
    });

    return createdPost;
  });

  await diagnostics.info(MODULE_KEY, "Feed post created.", { authorUserId, postId: post.id });
  return { ok: true as const, post };
}

export async function createFeedComment(authorUserId: string, input: unknown) {
  const parsed = createFeedCommentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  const mediaCheck = await verifyOwnedMediaAsset(authorUserId, parsed.data.mediaAssetId || undefined);

  if (!mediaCheck.ok) {
    return mediaCheck;
  }

  const comment = await prisma.$transaction(async (tx) => {
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
      mediaAssetId: createdComment.mediaAssetId
    });

    return createdComment;
  });
  await recordPostCommentSignal(authorUserId, comment.postId);
  const [commentAuthor, post, parentComment] = await Promise.all([
    prisma.user.findUnique({
      where: { id: authorUserId },
      include: { profile: true }
    }),
    prisma.feedPost.findUnique({
      where: { id: comment.postId },
      select: { authorUserId: true, body: true }
    }),
    comment.parentCommentId
      ? prisma.feedComment.findUnique({
          where: { id: comment.parentCommentId },
          select: { authorUserId: true, body: true }
        })
      : Promise.resolve(null)
  ]);
  const commenterName = commentAuthor ? profileName(commentAuthor) : "Someone";
  const notifications = new Map<string, { title: string; body: string; href: string }>();

  if (post?.authorUserId && post.authorUserId !== authorUserId) {
    notifications.set(post.authorUserId, {
      title: `${commenterName} replied to your stream post`,
      body: comment.body.slice(0, 180),
      href: `/posts/${comment.postId}`
    });
  }

  if (parentComment?.authorUserId && parentComment.authorUserId !== authorUserId && parentComment.authorUserId !== post?.authorUserId) {
    notifications.set(parentComment.authorUserId, {
      title: `${commenterName} replied to your comment`,
      body: comment.body.slice(0, 180),
      href: `/posts/${comment.postId}`
    });
  }

  if (notifications.size > 0) {
    await prisma.notification.createMany({
      data: Array.from(notifications, ([userId, notification]) => ({
        userId,
        ...notification
      }))
    });
  }

  await diagnostics.info(MODULE_KEY, "Feed comment created.", {
    authorUserId,
    postId: comment.postId,
    commentId: comment.id
  });
  return { ok: true as const, comment };
}

export async function reactToFeedPost(userId: string, input: unknown) {
  const parsed = reactToFeedPostSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid reaction." };
  }

  const reaction = await prisma.feedPostReaction.upsert({
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
  const [reactor, post] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
    prisma.feedPost.findUnique({ where: { id: parsed.data.postId }, select: { authorUserId: true } })
  ]);

  await recordPostReactionSignals(userId, parsed.data.postId, parsed.data.type);

  if (parsed.data.type !== FeedReactionType.DISLIKE && reactor && post?.authorUserId && post.authorUserId !== userId) {
    await prisma.notification.create({
      data: {
        userId: post.authorUserId,
        title: `${profileName(reactor)} reacted to your stream post`,
        body: parsed.data.type.toLowerCase(),
        href: `/posts/${parsed.data.postId}`
      }
    });
  }

  return { ok: true as const, reaction };
}

export async function reactToFeedComment(userId: string, input: unknown) {
  const parsed = reactToFeedCommentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid reaction." };
  }

  const reaction = await prisma.feedCommentReaction.upsert({
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
  const [reactor, comment] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
    prisma.feedComment.findUnique({ where: { id: parsed.data.commentId }, select: { authorUserId: true, postId: true } })
  ]);

  await recordCommentReactionSignals(userId, parsed.data.commentId, parsed.data.type);

  if (parsed.data.type !== FeedReactionType.DISLIKE && reactor && comment?.authorUserId && comment.authorUserId !== userId) {
    await prisma.notification.create({
      data: {
        userId: comment.authorUserId,
        title: `${profileName(reactor)} reacted to your comment`,
        body: parsed.data.type.toLowerCase(),
        href: `/posts/${comment.postId}`
      }
    });
  }

  return { ok: true as const, reaction };
}
