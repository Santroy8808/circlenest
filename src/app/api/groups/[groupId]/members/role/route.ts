import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { userId?: string; role?: "MODERATOR" | "MEMBER" };
  if (!body.userId || !body.role) return NextResponse.json({ error: "userId and role required" }, { status: 400 });

  const group = await prisma.group.findUnique({ where: { id: context.params.groupId } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (group.ownerId !== session.user.id) return NextResponse.json({ error: "Only creator can assign moderators" }, { status: 403 });

  await prisma.groupMember.update({
    where: { groupId_userId: { groupId: context.params.groupId, userId: body.userId } },
    data: { role: body.role },
  });

  return NextResponse.json({ ok: true });
}

