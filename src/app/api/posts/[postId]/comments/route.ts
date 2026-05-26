import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText, checkRateLimitPlaceholder } from "@/lib/security";

export async function POST(request: Request, context: { params: { postId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = await checkRateLimitPlaceholder(`comment:${session.user.id}`);
  if (!allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const body = (await request.json()) as { content?: string };
  if (!body.content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });

  const comment = await prisma.comment.create({
    data: {
      postId: context.params.postId,
      authorId: session.user.id,
      content: sanitizeUserText(body.content),
    },
    include: { author: true },
  });

  return NextResponse.json(comment);
}
