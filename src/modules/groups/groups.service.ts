import { prisma } from "@/lib/db/prisma";
import { ensureGroupStorageRoot } from "@/lib/security/upload-storage";

type CreateGroupInput = {
  name?: string;
  description?: string;
  visibility?: "PUBLIC" | "PRIVATE";
  joinMode?: "OPEN" | "REQUEST";
};

export async function createGroupForUser(userId: string, body: CreateGroupInput) {
  if (!body.name?.trim()) return { ok: false as const, status: 400, error: "Group name required" };

  const group = await prisma.group.create({
    data: {
      name: body.name.trim(),
      description: body.description?.trim() || null,
      visibility: body.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
      joinMode: body.joinMode === "REQUEST" ? "REQUEST" : "OPEN",
      ownerId: userId,
    },
  });

  await prisma.groupMember.create({
    data: { groupId: group.id, userId, role: "CREATOR" },
  });

  void ensureGroupStorageRoot(group.id).catch((error) => {
    console.error("Failed to initialize group storage root", error);
  });

  return { ok: true as const, group };
}
