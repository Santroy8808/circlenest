import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";

export async function canModerateGroup(userId: string, groupId: string) {
  if (await isAdminUser(userId)) return true;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      ownerId: true,
      members: {
        where: { userId },
        select: { role: true },
      },
    },
  });

  if (!group) return false;
  if (group.ownerId === userId) return true;

  const role = group.members[0]?.role ?? null;
  return role === "MODERATOR" || role === "CREATOR";
}

export async function canModerateEvent(userId: string, eventId: string) {
  if (await isAdminUser(userId)) return true;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      creatorId: true,
      moderators: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  if (!event) return false;
  if (event.creatorId === userId) return true;
  return event.moderators.length > 0;
}

