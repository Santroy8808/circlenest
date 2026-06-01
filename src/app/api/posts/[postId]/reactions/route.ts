import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request, context: { params: { postId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { type?: string };
  const type = body.type?.toUpperCase() || "LIKE";

  const post = await prisma.post.findUnique({
    where: { id: context.params.postId },
    select: { id: true, authorId: true },
  });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  await prisma.reaction.deleteMany({ where: { postId: post.id, userId: session.user.id } });
  const reaction = await prisma.reaction.create({ data: { postId: post.id, userId: session.user.id, type } });

  if (post.authorId !== session.user.id) {
    await prisma.notification.create({
      data: {
        userId: post.authorId,
        type: "POST_REACTION",
        body: `@${session.user.name ?? "member"} reacted (${type}) to your post`,
        targetUrl: `/posts/${post.id}`,
      },
    });
  }

  return NextResponse.json(reaction);
}
