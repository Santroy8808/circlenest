import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText, checkRateLimitPlaceholder } from "@/lib/security";
import { deliverPushNotification } from "@/lib/notifications/push";

export async function POST(request: Request, context: { params: { postId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = await checkRateLimitPlaceholder(`comment:${session.user.id}`);
  if (!allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const body = (await request.json()) as { content?: string; parentCommentId?: string | null; mediaUrls?: string[] };
  const mediaUrls = Array.isArray(body.mediaUrls)
    ? body.mediaUrls
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
        .slice(0, 8)
    : [];
  const content = sanitizeUserText(String(body.content ?? "").trim());
  if (!content && mediaUrls.length === 0) {
    return NextResponse.json({ error: "Add text or media to comment" }, { status: 400 });
  }

  let parentAuthorId: string | null = null;
  if (body.parentCommentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: body.parentCommentId, postId: context.params.postId },
      select: { id: true, authorId: true },
    });
    if (!parent) return NextResponse.json({ error: "Parent comment not found in this post" }, { status: 400 });
    parentAuthorId = parent.authorId;
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
      content,
      mediaUrlsJson: mediaUrls.length ? JSON.stringify(mediaUrls) : null,
    },
    include: { author: { select: { username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } } },
  });

  const actor = `@${comment.author.username}`;
  const notifications: Array<{ userId: string; type: string; body: string; targetUrl: string }> = [];

  if (post.authorId !== session.user.id) {
    notifications.push({
      userId: post.authorId,
      type: "POST_COMMENT",
      body: `${actor} commented on your post`,
      targetUrl: `/posts/${context.params.postId}`,
    });
  }

  if (parentAuthorId && parentAuthorId !== session.user.id && parentAuthorId !== post.authorId) {
    notifications.push({
      userId: parentAuthorId,
      type: "POST_REPLY",
      body: `${actor} replied to your comment`,
      targetUrl: `/posts/${context.params.postId}`,
    });
  }

  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
    await Promise.all(
      notifications.map((notification) =>
        deliverPushNotification(
          notification.userId,
          {
            title: "New notification",
            body: notification.body,
            url: notification.targetUrl,
          },
          "notification",
        ),
      ),
    );
  }

  return NextResponse.json(comment);
}
