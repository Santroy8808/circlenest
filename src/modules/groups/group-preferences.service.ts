import { prisma } from "@/lib/db/prisma";

type ReorderAction = "pin" | "unpin" | "move-up" | "move-down";

type OrderedGroupMembership = {
  id: string;
  groupId: string;
  isPinned: boolean;
  sortOrder: number;
  createdAt: Date;
};

type OrderedThreadPreference = {
  threadId: string;
  isPinned: boolean;
  sortOrder: number;
  updatedAt: Date;
};

function normalizeGroupMemberships(items: OrderedGroupMembership[]) {
  const pinned = items.filter((item) => item.isPinned);
  const others = items.filter((item) => !item.isPinned);
  return [...pinned, ...others].map((item, index) => ({ ...item, sortOrder: index }));
}

function normalizeThreadPreferences(items: OrderedThreadPreference[]) {
  const pinned = items.filter((item) => item.isPinned);
  const others = items.filter((item) => !item.isPinned);
  return [...pinned, ...others].map((item, index) => ({ ...item, sortOrder: index }));
}

function moveItemWithinBucket<T extends { isPinned: boolean }>(items: T[], currentIndex: number, direction: "up" | "down") {
  const current = items[currentIndex];
  if (!current) return items;
  const sameBucketIndexes = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.isPinned === current.isPinned)
    .map(({ index }) => index);
  const bucketPosition = sameBucketIndexes.indexOf(currentIndex);
  if (bucketPosition === -1) return items;

  const swapBucketPosition = direction === "up" ? bucketPosition - 1 : bucketPosition + 1;
  const swapIndex = sameBucketIndexes[swapBucketPosition];
  if (swapIndex === undefined) return items;

  const next = [...items];
  [next[currentIndex], next[swapIndex]] = [next[swapIndex], next[currentIndex]];
  return next;
}

export async function updateGroupMembershipPreference(userId: string, groupId: string, action: ReorderAction) {
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { id: true, groupId: true, isPinned: true, sortOrder: true, createdAt: true },
    orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const currentIndex = memberships.findIndex((item) => item.groupId === groupId);
  if (currentIndex === -1) {
    throw new Error("Group membership not found");
  }

  let next = [...memberships];
  const current = next[currentIndex];

  if (action === "pin" || action === "unpin") {
    next.splice(currentIndex, 1);
    const updated = { ...current, isPinned: action === "pin" };
    const insertAt = updated.isPinned ? 0 : next.filter((item) => item.isPinned).length;
    next.splice(insertAt, 0, updated);
  } else {
    next = moveItemWithinBucket(next, currentIndex, action === "move-up" ? "up" : "down");
  }

  const normalized = normalizeGroupMemberships(next);
  await prisma.$transaction(
    normalized.map((item) =>
      prisma.groupMember.update({
        where: { id: item.id },
        data: { isPinned: item.isPinned, sortOrder: item.sortOrder },
      }),
    ),
  );
}

export async function updateGroupThreadPreference(userId: string, groupId: string, threadId: string, action: ReorderAction) {
  const threads = await prisma.groupForumThread.findMany({
    where: { groupId },
    select: {
      id: true,
      updatedAt: true,
      userPreferences: {
        where: { userId },
        select: { isPinned: true, sortOrder: true },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const ordered: OrderedThreadPreference[] = threads
    .map((thread, index) => ({
      threadId: thread.id,
      isPinned: thread.userPreferences[0]?.isPinned ?? false,
      sortOrder: thread.userPreferences[0]?.sortOrder ?? index,
      updatedAt: thread.updatedAt,
    }))
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  const currentIndex = ordered.findIndex((item) => item.threadId === threadId);
  if (currentIndex === -1) {
    throw new Error("Thread not found");
  }

  let next = [...ordered];
  const current = next[currentIndex];

  if (action === "pin" || action === "unpin") {
    next.splice(currentIndex, 1);
    const updated = { ...current, isPinned: action === "pin" };
    const insertAt = updated.isPinned ? 0 : next.filter((item) => item.isPinned).length;
    next.splice(insertAt, 0, updated);
  } else {
    next = moveItemWithinBucket(next, currentIndex, action === "move-up" ? "up" : "down");
  }

  const normalized = normalizeThreadPreferences(next);
  await prisma.$transaction(
    normalized.map((item) =>
      prisma.groupForumThreadPreference.upsert({
        where: {
          threadId_userId: {
            threadId: item.threadId,
            userId,
          },
        },
        create: {
          threadId: item.threadId,
          userId,
          isPinned: item.isPinned,
          sortOrder: item.sortOrder,
        },
        update: {
          isPinned: item.isPinned,
          sortOrder: item.sortOrder,
        },
      }),
    ),
  );
}
