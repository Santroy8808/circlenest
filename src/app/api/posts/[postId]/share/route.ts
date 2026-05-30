import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(_request: Request, context: { params: { postId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const original = await prisma.post.findUnique({ where: { id: context.params.postId } });
  if (!original) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (!original.allowReshare) return NextResponse.json({ error: "Resharing is disabled for this post" }, { status: 403 });

  const repost = await prisma.post.create({
    data: {
      authorId: session.user.id,
      content: `Repost: ${original.content}`,
      imageUrl: original.imageUrl,
      topic: original.topic,
      parentPostId: original.id,
      type: "SHARE",
    },
  });

  return NextResponse.json(repost);
}
