import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText } from "@/lib/security";

export async function PATCH(request: Request, context: { params: { postId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { content?: string; topic?: string };
  const existing = await prisma.post.findUnique({ where: { id: context.params.postId } });
  if (!existing) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (existing.authorId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await prisma.post.update({
    where: { id: context.params.postId },
    data: {
      content: body.content ? sanitizeUserText(body.content) : existing.content,
      topic: body.topic ?? existing.topic,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: { params: { postId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.post.findUnique({ where: { id: context.params.postId } });
  if (!existing) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (existing.authorId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.post.delete({ where: { id: context.params.postId } });
  return NextResponse.json({ ok: true });
}
