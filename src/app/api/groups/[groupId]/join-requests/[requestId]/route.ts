import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(request: Request, context: { params: { groupId: string; requestId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = await prisma.group.findUnique({
    where: { id: context.params.groupId },
    select: { id: true, ownerId: true },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (group.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { action?: "APPROVE" | "DENY" };
  const action = body.action === "APPROVE" ? "APPROVE" : "DENY";

  const target = await prisma.groupJoinRequest.findFirst({
    where: { id: context.params.requestId, groupId: context.params.groupId },
    select: { id: true, userId: true },
  });
  if (!target) return NextResponse.json({ error: "Join request not found" }, { status: 404 });

  if (action === "APPROVE") {
    await prisma.$transaction([
      prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: context.params.groupId, userId: target.userId } },
        create: { groupId: context.params.groupId, userId: target.userId, role: "MEMBER" },
        update: {},
      }),
      prisma.groupJoinRequest.update({
        where: { id: target.id },
        data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: session.user.id },
      }),
    ]);
    return NextResponse.json({ ok: true, status: "APPROVED" });
  }

  await prisma.groupJoinRequest.update({
    where: { id: target.id },
    data: { status: "DENIED", reviewedAt: new Date(), reviewedById: session.user.id },
  });
  return NextResponse.json({ ok: true, status: "DENIED" });
}

