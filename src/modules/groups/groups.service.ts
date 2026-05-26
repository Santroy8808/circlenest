import { prisma } from "@/lib/db/prisma";

type CreateGroupInput = {
  name?: string;
  description?: string;
  visibility?: "PUBLIC" | "PRIVATE";
};

export async function createGroupForUser(userId: string, body: CreateGroupInput) {
  if (!body.name?.trim()) return { ok: false as const, status: 400, error: "Group name required" };

  const group = await prisma.group.create({
    data: {
      name: body.name.trim(),
      description: body.description?.trim() || null,
      visibility: body.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
      ownerId: userId,
    },
  });

  await prisma.groupMember.create({
    data: { groupId: group.id, userId, role: "CREATOR" },
  });

  return { ok: true as const, group };
}
