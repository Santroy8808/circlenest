import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText } from "@/lib/security";
import { deliverPushNotification } from "@/lib/notifications/push";

export async function POST(request: Request, context: { params: { username: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owner = await prisma.user.findUnique({
    where: { username: context.params.username },
    select: { id: true, username: true },
  });
  if (!owner) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (owner.id === session.user.id) return NextResponse.json({ error: "Use normal post flow for your own stream." }, { status: 400 });

  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { userId: session.user.id, blockedUserId: owner.id },
        { userId: owner.id, blockedUserId: session.user.id },
      ],
    },
    select: { id: true },
  });
  if (blocked) return NextResponse.json({ error: "Posting blocked by user settings." }, { status: 403 });

  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: session.user.id, userBId: owner.id },
        { userAId: owner.id, userBId: session.user.id },
      ],
    },
    select: { id: true },
  });
  if (!friendship) return NextResponse.json({ error: "Only friends/family can post on this stream." }, { status: 403 });

  const rules = await prisma.userFeedPreference.findUnique({
    where: { userId: owner.id },
    select: {
      allowFriendFamilyStreamPosts: true,
      requireApprovalForFriendFamilyStreamPosts: true,
    },
  });
  if (rules && rules.allowFriendFamilyStreamPosts === false) {
    return NextResponse.json({ error: "This user does not allow friend/family stream posts." }, { status: 403 });
  }

  const body = (await request.json()) as { content?: string };
  const content = String(body.content ?? "").trim();
  if (!content) return NextResponse.json({ error: "Content is required" }, { status: 400 });

  const pending = Boolean(rules?.requireApprovalForFriendFamilyStreamPosts);
  const post = await prisma.post.create({
    data: {
      authorId: session.user.id,
      streamOwnerId: owner.id,
      approvalStatus: pending ? "PENDING" : "APPROVED",
      content: sanitizeUserText(content),
      audience: "ALL",
      type: "TEXT",
    },
    select: { id: true, approvalStatus: true },
  });

  await prisma.notification.create({
    data: {
      userId: owner.id,
      type: pending ? "STREAM_POST_PENDING" : "STREAM_POST",
      body: pending
        ? "A friend/family stream post is waiting for your approval."
        : "A friend/family member posted on your stream.",
      targetUrl: pending ? `/profile/${owner.username}` : `/posts/${post.id}`,
    },
  });
  await deliverPushNotification(
    owner.id,
    {
      title: pending ? "Stream post pending" : "New stream post",
      body: pending
        ? "A friend/family stream post is waiting for your approval."
        : "A friend/family member posted on your stream.",
      url: pending ? `/profile/${owner.username}` : `/posts/${post.id}`,
    },
    "notification",
  );

  return NextResponse.json({ ok: true, pending, postId: post.id });
}
