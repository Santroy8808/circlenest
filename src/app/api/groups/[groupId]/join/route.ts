import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(_request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } },
    create: { groupId: context.params.groupId, userId: session.user.id, role: "MEMBER" },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

