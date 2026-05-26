import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } } });
  if (!membership) return NextResponse.json({ error: "Join group first" }, { status: 403 });

  const body = (await request.json()) as { title?: string; url?: string };
  if (!body.title?.trim() || !body.url?.trim()) return NextResponse.json({ error: "title and url required" }, { status: 400 });

  const doc = await prisma.groupDocument.create({
    data: {
      groupId: context.params.groupId,
      uploaderId: session.user.id,
      title: body.title.trim(),
      url: body.url.trim(),
    },
  });

  return NextResponse.json(doc);
}

