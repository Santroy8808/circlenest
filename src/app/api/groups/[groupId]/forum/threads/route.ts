import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText } from "@/lib/security";

export async function POST(request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } } });
  if (!membership) return NextResponse.json({ error: "Join group first" }, { status: 403 });

  const body = (await request.json()) as { title?: string; content?: string; allowReplyImages?: boolean };
  if (!body.title?.trim() || !body.content?.trim()) return NextResponse.json({ error: "title and content required" }, { status: 400 });

  const thread = await prisma.groupForumThread.create({
    data: {
      groupId: context.params.groupId,
      authorId: session.user.id,
      title: sanitizeUserText(body.title),
      allowReplyImages: Boolean(body.allowReplyImages),
      posts: { create: [{ authorId: session.user.id, content: sanitizeUserText(body.content) }] },
    },
    include: { posts: true },
  });

  return NextResponse.json(thread);
}

