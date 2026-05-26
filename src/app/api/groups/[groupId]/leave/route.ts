import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(_request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = await prisma.group.findUnique({ where: { id: context.params.groupId } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (group.ownerId === session.user.id) return NextResponse.json({ error: "Creator cannot leave own group" }, { status: 400 });

  await prisma.groupMember.deleteMany({ where: { groupId: context.params.groupId, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}

