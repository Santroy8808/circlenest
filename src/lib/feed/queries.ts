import { prisma } from "@/lib/db/prisma";
import type { FeedMode } from "@/lib/feed/modes";

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function parseWeights(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === "number") as [string, number][]);
  } catch {
    return {};
  }
}

export async function getFeedPosts(userId: string, mode: FeedMode) {
  const [pref, mutedUsers, mutedTopics, friendships] = await Promise.all([
    prisma.userFeedPreference.findUnique({ where: { userId } }),
    prisma.mutedUser.findMany({ where: { userId } }),
    prisma.mutedTopic.findMany({ where: { userId } }),
    prisma.friendship.findMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] } }),
  ]);

  const hiddenPostIds = parseList(pref?.hiddenPostIds);
  const topicWeights = parseWeights(pref?.topicWeights);
  const mutedUserIds = mutedUsers.map((m) => m.mutedUserId);
  const mutedTopicValues = mutedTopics.map((m) => m.topic);
  const friendIds = friendships.map((f) => (f.userAId === userId ? f.userBId : f.userAId));

  const posts = await prisma.post.findMany({
    where: {
      id: { notIn: hiddenPostIds },
      authorId: { notIn: mutedUserIds },
      topic: { notIn: mutedTopicValues },
      ...(mode === "FRIENDS_FIRST" ? { authorId: { in: friendIds } } : {}),
      ...(mode === "QUIET" ? { groupId: { not: null } } : {}),
      ...(mode === "INTEREST_BASED"
        ? {
            topic: {
              in: (await prisma.followedTopic.findMany({ where: { userId } })).map((t) => t.topic),
            },
          }
        : {}),
    },
    include: {
      author: { select: { username: true } },
      comments: { include: { author: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
      reactions: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const weighted = posts.sort((a, b) => {
    const aw = a.topic ? topicWeights[a.topic] ?? 0 : 0;
    const bw = b.topic ? topicWeights[b.topic] ?? 0 : 0;
    return bw - aw;
  });

  return weighted.map((p) => ({
    ...p,
    explanation:
      mode === "FRIENDS_FIRST"
        ? "Posted by a close friend"
        : mode === "INTEREST_BASED"
          ? `Matches your selected interest: ${p.topic ?? "General"}`
          : mode === "QUIET"
            ? "From a group you joined"
            : mode === "DISCOVERY"
              ? "Discovery post from a public group"
              : "Newest post from your network",
  }));
}
