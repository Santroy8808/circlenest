import { prisma } from "@/lib/db/prisma";

export const GROUP_ASSET_LIMIT_BYTES = 40 * 1024 * 1024;

export async function canManageGroupAssets(userId: string, groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      ownerId: true,
      members: {
        where: { userId },
        select: { role: true, isProvider: true },
        take: 1,
      },
    },
  });

  if (!group) return { ok: false as const, status: 404, error: "Group not found" };
  if (group.ownerId === userId) return { ok: true as const };

  const membership = group.members[0];
  if (!membership) return { ok: false as const, status: 403, error: "Join group first" };
  if (membership.role === "MODERATOR" || membership.role === "CREATOR" || membership.isProvider) {
    return { ok: true as const };
  }

  return { ok: false as const, status: 403, error: "Only group creators, moderators, or providers can upload assets." };
}

export async function getGroupAssetUsageBytes(groupId: string) {
  const [documents, photos] = await Promise.all([
    prisma.groupDocument.aggregate({ where: { groupId }, _sum: { sizeBytes: true } }),
    prisma.groupPhoto.aggregate({ where: { groupId }, _sum: { sizeBytes: true } }),
  ]);

  return (documents._sum.sizeBytes ?? 0) + (photos._sum.sizeBytes ?? 0);
}

export async function canGroupStoreBytes(groupId: string, incomingBytes: number) {
  const usedBytes = await getGroupAssetUsageBytes(groupId);
  const nextBytes = usedBytes + Math.max(0, incomingBytes);
  return {
    ok: nextBytes <= GROUP_ASSET_LIMIT_BYTES,
    usedBytes,
    nextBytes,
    remainingBytes: Math.max(0, GROUP_ASSET_LIMIT_BYTES - usedBytes),
    limitBytes: GROUP_ASSET_LIMIT_BYTES,
  };
}
