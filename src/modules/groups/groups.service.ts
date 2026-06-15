import { prisma } from "@/lib/db/prisma";
import { ensureGroupStorageRoot } from "@/lib/security/upload-storage";
import { getMaxCreatedGroupMembers, resolveUserAccessPolicy } from "@/lib/policy/tier-policy";

type CreateGroupInput = {
  name?: string;
  purpose?: string;
  locationCountry?: string;
  locationState?: string;
  locationCity?: string;
  description?: string;
  visibility?: "PUBLIC" | "PRIVATE";
  joinMode?: "OPEN" | "REQUEST";
};

type GroupMembershipCapacityResult =
  | {
      ok: true;
      maxMembers: number | null;
      currentMembers: number;
    }
  | {
      ok: false;
      status: 404;
      error: string;
    };

async function getNextGroupSortOrder(userId: string) {
  const aggregate = await prisma.groupMember.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  return (aggregate._max.sortOrder ?? -1) + 1;
}

export async function createGroupForUser(userId: string, body: CreateGroupInput) {
  if (!body.name?.trim()) return { ok: false as const, status: 400, error: "Group name required" };
  if (!body.purpose?.trim()) return { ok: false as const, status: 400, error: "Group purpose required" };
  if (!body.locationCountry?.trim()) return { ok: false as const, status: 400, error: "Country required" };
  if (!body.locationState?.trim()) return { ok: false as const, status: 400, error: "State required" };
  if (!body.locationCity?.trim()) return { ok: false as const, status: 400, error: "City required" };

  const group = await prisma.group.create({
    data: {
      name: body.name.trim(),
      purpose: body.purpose.trim(),
      locationCountry: body.locationCountry.trim(),
      locationState: body.locationState.trim(),
      locationCity: body.locationCity.trim(),
      description: body.description?.trim() || null,
      visibility: body.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
      joinMode: body.joinMode === "REQUEST" ? "REQUEST" : "OPEN",
      ownerId: userId,
    },
  });

  await prisma.groupMember.create({
    data: { groupId: group.id, userId, role: "MODERATOR", sortOrder: await getNextGroupSortOrder(userId) },
  });

  void ensureGroupStorageRoot(group.id).catch((error) => {
    console.error("Failed to initialize group storage root", error);
  });

  return { ok: true as const, group };
}

export async function getGroupMembershipCapacity(groupId: string, excludedUserId?: string): Promise<GroupMembershipCapacityResult> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      owner: {
        select: {
          role: true,
          subscriptionTier: true,
        },
      },
    },
  });

  if (!group) {
    return { ok: false, status: 404, error: "Group not found" };
  }

  const policy = resolveUserAccessPolicy(group.owner);
  const maxMembers = getMaxCreatedGroupMembers(policy);
  const currentMembers = await prisma.groupMember.count({
    where: {
      groupId,
      ...(excludedUserId ? { userId: { not: excludedUserId } } : {}),
    },
  });

  return { ok: true, maxMembers, currentMembers };
}

export async function canAddGroupMember(groupId: string, excludedUserId?: string) {
  const capacity = await getGroupMembershipCapacity(groupId, excludedUserId);
  if (!capacity.ok) return capacity;
  if (capacity.maxMembers !== null && capacity.currentMembers >= capacity.maxMembers) {
    return { ok: false as const, status: 409, error: "Group is full" };
  }
  return { ok: true as const };
}
