import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(_request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = await prisma.group.findUnique({
    where: { id: context.params.groupId },
    select: { id: true, joinMode: true, ownerId: true },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  if (group.joinMode === "OPEN") {
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } },
      create: { groupId: context.params.groupId, userId: session.user.id, role: "MEMBER" },
      update: {},
    });
    return NextResponse.json({ ok: true, status: "JOINED" });
  }

  const request = await prisma.groupJoinRequest.upsert({
    where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } },
    create: { groupId: context.params.groupId, userId: session.user.id, status: "PENDING" },
    update: { status: "PENDING", reviewedAt: null, reviewedById: null },
    select: { id: true, status: true },
  });

  return NextResponse.json({ ok: true, status: "REQUESTED", requestId: request.id });
}

