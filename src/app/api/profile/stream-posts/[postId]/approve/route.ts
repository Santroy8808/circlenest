import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { deliverPushNotification } from "@/lib/notifications/push";

export async function POST(_request: Request, context: { params: { postId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const post = await prisma.post.findUnique({
    where: { id: context.params.postId },
    select: { id: true, streamOwnerId: true, approvalStatus: true, authorId: true },
  });
  if (!post || !post.streamOwnerId) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (post.streamOwnerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (post.approvalStatus === "APPROVED") return NextResponse.json({ ok: true });

  await prisma.post.update({
    where: { id: post.id },
    data: { approvalStatus: "APPROVED" },
  });

  await prisma.notification.create({
    data: {
      userId: post.authorId,
      type: "STREAM_POST_APPROVED",
      body: "Your post on a friend/family stream was approved.",
      targetUrl: `/posts/${post.id}`,
    },
  });
  await deliverPushNotification(
    post.authorId,
    {
      title: "Stream post approved",
      body: "Your post on a friend/family stream was approved.",
      url: `/posts/${post.id}`,
    },
    "notification",
  );

  return NextResponse.json({ ok: true });
}
