import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText, checkRateLimitPlaceholder } from "@/lib/security";

export async function POST(request: Request, context: { params: { postId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = await checkRateLimitPlaceholder(`comment:${session.user.id}`);
  if (!allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const body = (await request.json()) as { content?: string; parentCommentId?: string | null };
  if (!body.content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });

  if (body.parentCommentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: body.parentCommentId, postId: context.params.postId },
      select: { id: true },
    });
    if (!parent) return NextResponse.json({ error: "Parent comment not found in this post" }, { status: 400 });
  }
  const post = await prisma.post.findUnique({
    where: { id: context.params.postId },
    select: { authorId: true, commentsLocked: true },
  });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (post.commentsLocked && post.authorId !== session.user.id) {
    return NextResponse.json({ error: "Comments are locked for this post" }, { status: 403 });
  }

  const comment = await prisma.comment.create({
    data: {
      postId: context.params.postId,
      authorId: session.user.id,
      parentCommentId: body.parentCommentId ?? null,
      content: sanitizeUserText(body.content),
    },
    include: { author: true },
  });

  return NextResponse.json(comment);
}
