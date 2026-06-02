import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { canModerateGroup } from "@/lib/auth/scoped-moderation";

export async function DELETE(_request: Request, context: { params: { groupId: string; memberUserId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = await prisma.group.findUnique({ where: { id: context.params.groupId } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const allowed = await canModerateGroup(session.user.id, context.params.groupId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (context.params.memberUserId === group.ownerId && session.user.id !== group.ownerId && !(await isAdminUser(session.user.id))) {
    return NextResponse.json({ error: "Cannot remove group owner" }, { status: 400 });
  }

  await prisma.groupMember.deleteMany({
    where: { groupId: context.params.groupId, userId: context.params.memberUserId },
  });

  return NextResponse.json({ ok: true });
}
