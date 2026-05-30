import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(_request: Request, context: { params: { groupId: string; memberUserId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = await prisma.group.findUnique({ where: { id: context.params.groupId } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const actorMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } },
    select: { role: true },
  });
  const canModerate = group.ownerId === session.user.id || actorMembership?.role === "MODERATOR" || actorMembership?.role === "CREATOR";
  if (!canModerate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (context.params.memberUserId === group.ownerId) {
    return NextResponse.json({ error: "Cannot remove group owner" }, { status: 400 });
  }

  await prisma.groupMember.deleteMany({
    where: { groupId: context.params.groupId, userId: context.params.memberUserId },
  });

  return NextResponse.json({ ok: true });
}

