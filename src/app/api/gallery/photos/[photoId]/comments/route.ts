import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText } from "@/lib/security";
import { deliverPushNotification } from "@/lib/notifications/push";

async function canViewPhoto(userId: string, photoId: string) {
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: { album: { select: { userId: true } } },
  });
  return photo;
}

export async function POST(request: Request, context: { params: { photoId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const photo = await canViewPhoto(session.user.id, context.params.photoId);
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  if (photo.commentsLocked && photo.album.userId !== session.user.id) {
    return NextResponse.json({ error: "Comments are locked for this photo" }, { status: 403 });
  }
  const body = (await request.json()) as { content?: string; parentCommentId?: string | null; mediaUrls?: string[] };
  const content = sanitizeUserText(String(body.content ?? "").trim());
  const mediaUrls = Array.isArray(body.mediaUrls)
    ? body.mediaUrls
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
        .slice(0, 8)
    : [];
  if (!content && mediaUrls.length === 0) {
    return NextResponse.json({ error: "Add text or media to comment" }, { status: 400 });
  }
  let parentAuthorId: string | null = null;
  if (body.parentCommentId) {
    const parent = await prisma.photoComment.findFirst({
      where: { id: body.parentCommentId, photoId: photo.id },
      select: { id: true, authorId: true },
    });
    if (!parent) return NextResponse.json({ error: "Parent comment not found in this photo" }, { status: 400 });
    parentAuthorId = parent.authorId;
  }

  const created = await prisma.photoComment.create({
    data: {
      photoId: photo.id,
      authorId: session.user.id,
      content,
      mediaUrlsJson: mediaUrls.length ? JSON.stringify(mediaUrls) : null,
      parentCommentId: body.parentCommentId ?? null,
    },
    include: { author: { select: { username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } } },
  });

  const actor = `@${created.author.username}`;
  const notifications: Array<{ userId: string; type: string; body: string; targetUrl: string }> = [];

  if (photo.album.userId !== session.user.id) {
    notifications.push({
      userId: photo.album.userId,
      type: "PHOTO_COMMENT",
      body: `${actor} commented on your photo`,
      targetUrl: `/profile/gallery`,
    });
  }

  if (parentAuthorId && parentAuthorId !== session.user.id && parentAuthorId !== photo.album.userId) {
    notifications.push({
      userId: parentAuthorId,
      type: "PHOTO_REPLY",
      body: `${actor} replied to your photo comment`,
      targetUrl: `/profile/gallery`,
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
  return NextResponse.json(created);
}
