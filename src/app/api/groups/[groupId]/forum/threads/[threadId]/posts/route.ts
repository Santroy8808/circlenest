import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText } from "@/lib/security";

export async function POST(request: Request, context: { params: { groupId: string; threadId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } } });
  if (!membership) return NextResponse.json({ error: "Join group first" }, { status: 403 });

  const body = (await request.json()) as { content?: string };
  if (!body.content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });

  const post = await prisma.groupForumPost.create({
    data: {
      threadId: context.params.threadId,
      authorId: session.user.id,
      content: sanitizeUserText(body.content),
    },
  });

  return NextResponse.json(post);
}

