import { FeedReactionType, FeedVisibility } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  createFeedCommentSchema,
  createFeedPostSchema,
  type FeedPostView,
  reactToFeedCommentSchema,
  reactToFeedPostSchema
} from "@/modules/feed-stream/types";

const MODULE_KEY = "feed-stream";
const FEED_DB_TIMEOUT_MS = 2500;

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
    acc[reaction.type] = (acc[reaction.type] ?? 0) + 1;
    return acc;
  }, {});
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

function toFeedPostView(post: Awaited<ReturnType<typeof fetchFeedPosts>>[number]): FeedPostView {
  return {
    id: post.id,
    body: post.body,
    visibility: post.visibility,
    createdAt: post.createdAt.toISOString(),
    author: {
      username: post.author.username,
      displayName: profileName(post.author),
      avatarUrl: post.author.profile?.avatarUrl
    },
    reactions: countReactions(post.reactions),
    comments: post.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      author: {
        username: comment.author.username,
        displayName: profileName(comment.author),
        avatarUrl: comment.author.profile?.avatarUrl
      },
      reactions: countReactions(comment.reactions),
      replyCount: comment.replies.length
    }))
  };
}

function fetchFeedPosts(take: number) {
  return prisma.feedPost.findMany({
    where: {
      visibility: {
        in: [FeedVisibility.MEMBERS, FeedVisibility.FRIENDS]
      }
    },
    include: {
      author: {
        include: {
          profile: true
        }
      },
      reactions: true,
      comments: {
        where: {
          parentCommentId: null,
          deletedAt: null
        },
        include: {
          author: {
            include: {
              profile: true
            }
          },
          reactions: true,
          replies: {
            where: { deletedAt: null },
            select: { id: true }
          }
        },
        orderBy: { createdAt: "asc" },
        take: 3
      }
    },
    orderBy: { createdAt: "desc" },
    take
  });
}

export async function listFeedPosts(take = 20) {
  const posts = await withFeedDbTimeout(fetchFeedPosts(take), "feed lookup");
  return posts.map(toFeedPostView);
}

export async function safeListFeedPosts(take = 20) {
  try {
    return await listFeedPosts(take);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list feed posts.", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function createFeedPost(authorUserId: string, input: unknown) {
  const parsed = createFeedPostSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid post." };
  }

  const post = await prisma.feedPost.create({
    data: {
      authorUserId,
      body: parsed.data.body,
      visibility: parsed.data.visibility,
      mediaAssetId: parsed.data.mediaAssetId || undefined
    }
  });

  await diagnostics.info(MODULE_KEY, "Feed post created.", { authorUserId, postId: post.id });
  return { ok: true as const, post };
}

export async function createFeedComment(authorUserId: string, input: unknown) {
  const parsed = createFeedCommentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  const comment = await prisma.feedComment.create({
    data: {
      authorUserId,
      postId: parsed.data.postId,
      parentCommentId: parsed.data.parentCommentId || undefined,
      body: parsed.data.body,
      mediaAssetId: parsed.data.mediaAssetId || undefined
    }
  });

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

  return { ok: true as const, reaction };
}
