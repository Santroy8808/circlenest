import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { FeedMode } from "@/lib/feed/modes";

export const FEED_FAST_WINDOW_DAYS = 14;
const FEED_PAGE_SIZE = 50;
const FEED_ARCHIVE_PAGE_SIZE = 25;

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function parseWeights(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === "number") as [string, number][],
    );
  } catch {
    return {};
  }
}

type FeedContext = {
  hiddenPostIds: string[];
  topicWeights: Record<string, number>;
  mutedUserIds: string[];
  mutedTopicValues: string[];
  friendIds: string[];
  joinedGroupIds: string[];
  followedTopicsValues: string[];
};

async function getFeedContext(userId: string): Promise<FeedContext> {
  const [pref, mutedUsers, mutedTopics, friendships, groupMemberships, followedTopics] = await Promise.all([
    prisma.userFeedPreference.findUnique({ where: { userId } }),
    prisma.mutedUser.findMany({ where: { userId } }),
    prisma.mutedTopic.findMany({ where: { userId } }),
    prisma.friendship.findMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] } }),
    prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } }),
    prisma.followedTopic.findMany({ where: { userId }, select: { topic: true } }),
  ]);

  return {
    hiddenPostIds: parseList(pref?.hiddenPostIds),
    topicWeights: parseWeights(pref?.topicWeights),
    mutedUserIds: mutedUsers.map((entry) => entry.mutedUserId),
    mutedTopicValues: mutedTopics.map((entry) => entry.topic),
    friendIds: friendships.map((entry) => (entry.userAId === userId ? entry.userBId : entry.userAId)),
    joinedGroupIds: groupMemberships.map((entry) => entry.groupId),
    followedTopicsValues: followedTopics.map((entry) => entry.topic),
  };
}

function getFastCutoffDate(): Date {
  return new Date(Date.now() - FEED_FAST_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

function buildFeedWhere(userId: string, mode: FeedMode, context: FeedContext): Prisma.PostWhereInput {
  return {
    id: { notIn: context.hiddenPostIds },
    authorId: { notIn: context.mutedUserIds },
    topic: { notIn: context.mutedTopicValues },
    AND: [
      {
        OR: [
          { authorId: userId },
          { audience: "ALL" },
          { audience: { in: ["FRIENDS", "FAMILY"] }, authorId: { in: context.friendIds } },
          { audience: "GROUPS", groupId: { in: context.joinedGroupIds } },
        ],
      },
      ...(mode === "FRIENDS_FIRST"
        ? [{ OR: [{ authorId: userId }, { authorId: { in: context.friendIds } }] }]
        : []),
      ...(mode === "QUIET" ? [{ groupId: { not: null } }] : []),
      ...(mode === "INTEREST_BASED" ? [{ topic: { in: context.followedTopicsValues } }] : []),
    ],
  };
}

function explain(mode: FeedMode, topic: string | null): string {
  return mode === "FRIENDS_FIRST"
    ? "Posted by a close friend"
    : mode === "INTEREST_BASED"
      ? `Matches your selected interest: ${topic ?? "General"}`
      : mode === "QUIET"
        ? "From a group you joined"
        : mode === "DISCOVERY"
          ? "Discovery post from a public group"
          : "Newest post from your network";
}

function decoratePosts<T extends { topic: string | null }>(
  posts: T[],
  mode: FeedMode,
  topicWeights: Record<string, number>,
) {
  const weighted = [...posts].sort((a, b) => {
    const aw = a.topic ? topicWeights[a.topic] ?? 0 : 0;
    const bw = b.topic ? topicWeights[b.topic] ?? 0 : 0;
    return bw - aw;
  });
  return weighted.map((post) => ({
    ...post,
    explanation: explain(mode, post.topic),
  }));
}

export async function getFeedPosts(userId: string, mode: FeedMode) {
  const context = await getFeedContext(userId);
  const fastCutoff = getFastCutoffDate();
  const where = buildFeedWhere(userId, mode, context);

  const posts = await prisma.post.findMany({
    where: {
      ...where,
      createdAt: { gte: fastCutoff },
    },
    include: {
      author: { select: { username: true } },
      comments: { include: { author: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
      reactions: true,
      poll: { include: { options: { include: { _count: { select: { votes: true } } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: FEED_PAGE_SIZE,
  });

  return decoratePosts(posts, mode, context.topicWeights);
}

export async function hasArchivePosts(userId: string, mode: FeedMode): Promise<boolean> {
  const context = await getFeedContext(userId);
  const where = buildFeedWhere(userId, mode, context);
  const fastCutoff = getFastCutoffDate();

  const older = await prisma.post.findFirst({
    where: {
      ...where,
      createdAt: { lt: fastCutoff },
    },
    select: { id: true },
  });
  return Boolean(older);
}

export async function getArchiveFeedPosts(userId: string, mode: FeedMode, before?: Date, take = FEED_ARCHIVE_PAGE_SIZE) {
  const context = await getFeedContext(userId);
  const where = buildFeedWhere(userId, mode, context);
  const fastCutoff = getFastCutoffDate();
  const upperBound = before && before < fastCutoff ? before : fastCutoff;

  const rows = await prisma.post.findMany({
    where: {
      ...where,
      createdAt: { lt: upperBound },
    },
    include: {
      author: { select: { username: true } },
      comments: { include: { author: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
      reactions: true,
      poll: { include: { options: { include: { _count: { select: { votes: true } } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
  });

  const hasMore = rows.length > take;
  const slice = hasMore ? rows.slice(0, take) : rows;
  const decorated = decoratePosts(slice, mode, context.topicWeights);
  const nextBefore = decorated.length ? decorated[decorated.length - 1].createdAt.toISOString() : null;

  return {
    posts: decorated,
    hasMore,
    nextBefore,
    fastWindowDays: FEED_FAST_WINDOW_DAYS,
  };
}
