import { prisma } from "@/lib/db/prisma";
import type { FeedMode } from "@/lib/feed/modes";
import type { FeedPost } from "@/types/feed";

function normalize(post: { id: string; content: string; createdAt: Date; author: { username: string } }, explanation: string): FeedPost {
  return {
    id: post.id,
    content: post.content,
    authorUsername: post.author.username,
    createdAt: post.createdAt,
    explanation,
  };
}

export async function getChronologicalFeed(userId: string): Promise<FeedPost[]> {
  const posts = await prisma.post.findMany({
    where: { authorId: { not: userId } },
    include: { author: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return posts.map((p) => normalize(p, "Newest post from your network"));
}

export async function getFriendsFirstFeed(userId: string): Promise<FeedPost[]> {
  const links = await prisma.friendship.findMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] } });
  const friendIds = links.map((f) => (f.userAId === userId ? f.userBId : f.userAId));
  const posts = await prisma.post.findMany({ where: { authorId: { in: friendIds } }, include: { author: true }, orderBy: { createdAt: "desc" }, take: 50 });
  return posts.map((p) => normalize(p, "Posted by a close friend"));
}

export async function getInterestBasedFeed(userId: string): Promise<FeedPost[]> {
  const topics = await prisma.followedTopic.findMany({ where: { userId } });
  const topicValues = topics.map((t) => t.topic);
  const posts = await prisma.post.findMany({ where: { topic: { in: topicValues } }, include: { author: true }, orderBy: { createdAt: "desc" }, take: 50 });
  return posts.map((p) => normalize(p, `Matches your selected interest: ${p.topic ?? "General"}`));
}

export async function getQuietFeed(userId: string): Promise<FeedPost[]> {
  const muted = await prisma.mutedTopic.findMany({ where: { userId } });
  const mutedTopics = muted.map((m) => m.topic);
  const posts = await prisma.post.findMany({ where: { topic: { notIn: mutedTopics } }, include: { author: true }, orderBy: { createdAt: "desc" }, take: 50 });
  return posts.map((p) => normalize(p, "From a group you joined"));
}

export async function getDiscoveryFeed(userId: string): Promise<FeedPost[]> {
  const posts = await prisma.post.findMany({ where: { authorId: { not: userId } }, include: { author: true }, orderBy: { createdAt: "desc" }, take: 50 });
  return posts.map((p) => normalize(p, "Discovery post from a public group"));
}

export async function getFeedForMode(userId: string, mode: FeedMode): Promise<FeedPost[]> {
  if (mode === "FRIENDS_FIRST") return getFriendsFirstFeed(userId);
  if (mode === "INTEREST_BASED") return getInterestBasedFeed(userId);
  if (mode === "QUIET") return getQuietFeed(userId);
  if (mode === "DISCOVERY") return getDiscoveryFeed(userId);
  return getChronologicalFeed(userId);
}
