import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText } from "@/lib/security";

export async function POST(request: Request, context: { params: { groupId: string; threadId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } } });
  if (!membership) return NextResponse.json({ error: "Join group first" }, { status: 403 });

  const body = (await request.json()) as { content?: string; parentCommentId?: string | null; mediaUrls?: string[] };
  const mediaUrls = Array.isArray(body.mediaUrls)
    ? body.mediaUrls
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
        .slice(0, 8)
    : [];
  if (!body.content?.trim() && mediaUrls.length === 0) return NextResponse.json({ error: "content required" }, { status: 400 });

  const thread = await prisma.groupForumThread.findFirst({
    where: { id: context.params.threadId, groupId: context.params.groupId },
    select: { id: true, allowReplyImages: true, status: true },
  });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.status === "ENDED") return NextResponse.json({ error: "This thread has been ended" }, { status: 409 });
  if (mediaUrls.length > 0 && !thread.allowReplyImages) {
    return NextResponse.json({ error: "Photo replies are disabled for this thread" }, { status: 403 });
  }

  if (body.parentCommentId) {
    const parent = await prisma.groupForumPost.findFirst({
      where: { id: body.parentCommentId, threadId: thread.id },
      select: { id: true },
    });
    if (!parent) return NextResponse.json({ error: "Parent post not found in this thread" }, { status: 400 });
  }

  const post = await prisma.groupForumPost.create({
    data: {
      threadId: context.params.threadId,
      authorId: session.user.id,
      content: sanitizeUserText(String(body.content ?? "").trim()),
      parentCommentId: body.parentCommentId ?? null,
      mediaUrlsJson: mediaUrls.length ? JSON.stringify(mediaUrls) : null,
    },
    include: { author: { select: { username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } } },
  });

  return NextResponse.json(post);
}

