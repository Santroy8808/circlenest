import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { canModerateGroup } from "@/lib/auth/scoped-moderation";
import { canAddGroupMember } from "@/modules/groups/groups.service";

async function getNextGroupSortOrder(userId: string) {
  const aggregate = await prisma.groupMember.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  return (aggregate._max.sortOrder ?? -1) + 1;
}

export async function PATCH(request: Request, context: { params: { groupId: string; requestId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = await prisma.group.findUnique({
    where: { id: context.params.groupId },
    select: { id: true },
  });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (!(await canModerateGroup(session.user.id, context.params.groupId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { action?: "APPROVE" | "DENY" };
  const action = body.action === "APPROVE" ? "APPROVE" : "DENY";

  const target = await prisma.groupJoinRequest.findFirst({
    where: { id: context.params.requestId, groupId: context.params.groupId },
    select: { id: true, userId: true },
  });
  if (!target) return NextResponse.json({ error: "Join request not found" }, { status: 404 });

  if (action === "APPROVE") {
    const capacity = await canAddGroupMember(context.params.groupId, target.userId);
    if (!capacity.ok) return NextResponse.json({ error: capacity.error }, { status: capacity.status });

    await prisma.$transaction([
      prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: context.params.groupId, userId: target.userId } },
        create: {
          groupId: context.params.groupId,
          userId: target.userId,
          role: "MEMBER",
          sortOrder: await getNextGroupSortOrder(target.userId),
        },
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


