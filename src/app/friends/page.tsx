import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { FriendsClient } from "@/components/friends/friends-client";

type SearchParams = {
  sort?: string | string[];
};

type FriendRow = {
  id: string;
  username: string;
  fullName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  locationLabel: string | null;
  relationshipStatus: string | null;
  lastInteractionAt: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

export default async function FriendsPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const me = session.user.id;
  const sort = normalizeSort(readParam(searchParams?.sort));

  const [links, suggestions, follows, directThreads] = await Promise.all([
    prisma.friendship.findMany({ where: { OR: [{ userAId: me }, { userBId: me }] } }),
    prisma.user.findMany({
      where: { id: { not: me } },
      select: {
        id: true,
        username: true,
        fullName: true,
        city: true,
        state: true,
        country: true,
        profile: { select: { displayName: true, avatarUrl: true, relationshipStatus: true } },
      },
      take: 24,
    }),
    prisma.userFollow.findMany({ where: { followerId: me }, select: { followingId: true } }),
    prisma.messageThread.findMany({
      where: {
        kind: "DIRECT",
        OR: [{ userAId: me }, { userBId: me }, { participants: { some: { userId: me } } }],
      },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        userA: { select: { id: true, username: true } },
        userB: { select: { id: true, username: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const followingIds = follows.map((f) => f.followingId);
  const friendIds = links.map((f) => (f.userAId === me ? f.userBId : f.userAId));
  const interactionMap = new Map<string, string>();
  for (const thread of directThreads) {
    const lastMessageAt = (thread.messages[0]?.createdAt ?? thread.updatedAt).toISOString();
    const otherId = thread.userAId === me ? thread.userBId : thread.userAId;
    const previous = interactionMap.get(otherId);
    if (!previous || Date.parse(lastMessageAt) > Date.parse(previous)) {
      interactionMap.set(otherId, lastMessageAt);
    }
  }

  const friends = sortFriends(
    await prisma.user.findMany({
      where: { id: { in: friendIds } },
      select: {
        id: true,
        username: true,
        fullName: true,
        city: true,
        state: true,
        country: true,
        profile: { select: { displayName: true, avatarUrl: true, relationshipStatus: true } },
      },
    }),
    sort,
    interactionMap,
  ).map((friend) => toFriendRow(friend, interactionMap.get(friend.id) ?? null));

  const suggestionRows = sortFriends(
    suggestions.filter((person) => !friendIds.includes(person.id) && person.id !== me),
    sort,
    interactionMap,
  ).map((friend) => toFriendRow(friend, interactionMap.get(friend.id) ?? null));

  return (
    <AppShell>
      <FriendsClient friends={friends} suggestions={suggestionRows} followingIds={followingIds} sort={sort} />
    </AppShell>
  );
}

function toFriendRow(
  friend: {
    id: string;
    username: string;
    fullName: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    profile: { displayName: string | null; avatarUrl: string | null; relationshipStatus: string | null } | null;
  },
  lastInteractionAt: string | null,
): FriendRow {
  return {
    id: friend.id,
    username: friend.username,
    fullName: friend.fullName,
    displayName: friend.profile?.displayName ?? null,
    avatarUrl: friend.profile?.avatarUrl ?? null,
    locationLabel: [friend.city, friend.state, friend.country].filter(Boolean).join(", ") || null,
    relationshipStatus: friend.profile?.relationshipStatus ?? null,
    lastInteractionAt,
    city: friend.city,
    state: friend.state,
    country: friend.country,
  };
}

function sortFriends<T extends { id: string; username: string; fullName: string | null; city?: string | null; state?: string | null; country?: string | null; profile?: { displayName: string | null; relationshipStatus: string | null } | null }>(
  rows: T[],
  sort: "alpha" | "family" | "interacted" | "location",
  interactions: Map<string, string>,
): T[] {
  const display = (row: T) => (row.profile?.displayName ?? row.fullName ?? row.username).toLowerCase();
  const location = (row: T) => [row.city, row.state, row.country].filter(Boolean).join(", ").toLowerCase();
  const familyScore = (row: T) => {
    const status = row.profile?.relationshipStatus?.toLowerCase() ?? "";
    return /family|spouse|married|wife|husband|partner|parent|child|son|daughter|mother|father|sister|brother|aunt|uncle|cousin|grand/.test(status) ? 1 : 0;
  };

  return [...rows].sort((left, right) => {
    if (sort === "family") {
      return familyScore(right) - familyScore(left) || display(left).localeCompare(display(right));
    }
    if (sort === "interacted") {
      const leftTime = interactions.get(left.id) ? Date.parse(interactions.get(left.id) as string) : 0;
      const rightTime = interactions.get(right.id) ? Date.parse(interactions.get(right.id) as string) : 0;
      return rightTime - leftTime || display(left).localeCompare(display(right));
    }
    if (sort === "location") {
      return location(left).localeCompare(location(right)) || display(left).localeCompare(display(right));
    }
    return display(left).localeCompare(display(right));
  });
}

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeSort(value: string): "alpha" | "family" | "interacted" | "location" {
  if (value === "family") return "family";
  if (value === "interacted") return "interacted";
  if (value === "location") return "location";
  return "alpha";
}
