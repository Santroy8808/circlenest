import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText, checkRateLimitPlaceholder } from "@/lib/security";
import { deliverPushNotification } from "@/lib/notifications/push";

function isSafeUploadUrl(value: string) {
  return value.startsWith("/api/media/") || value.startsWith("/uploads/");
}

export async function POST(request: Request, context: { params: { fundraiserId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = await checkRateLimitPlaceholder(`fundraiser-comment:${session.user.id}`);
  if (!allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const fundraiser = await prisma.fundraiser.findUnique({
    where: { id: context.params.fundraiserId },
    select: { id: true, creatorId: true, title: true },
  });
  if (!fundraiser) return NextResponse.json({ error: "Fund raiser not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { content?: string; parentCommentId?: string | null; mediaUrls?: string[] };
  const content = sanitizeUserText(String(body.content ?? "").trim());
  const mediaUrls = Array.isArray(body.mediaUrls)
    ? body.mediaUrls
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0 && isSafeUploadUrl(value))
        .slice(0, 8)
    : [];

  if (!content && mediaUrls.length === 0) {
    return NextResponse.json({ error: "Add text or media to comment" }, { status: 400 });
  }

  let parentAuthorId: string | null = null;
  if (body.parentCommentId) {
    const parent = await prisma.fundraiserComment.findFirst({
      where: { id: body.parentCommentId, fundraiserId: fundraiser.id },
      select: { id: true, authorId: true },
    });
    if (!parent) return NextResponse.json({ error: "Parent comment not found in this fund raiser" }, { status: 400 });
    parentAuthorId = parent.authorId;
  }

  const comment = await prisma.fundraiserComment.create({
    data: {
      fundraiserId: fundraiser.id,
      authorId: session.user.id,
      parentCommentId: body.parentCommentId ?? null,
      content,
      mediaUrlsJson: mediaUrls.length ? JSON.stringify(mediaUrls) : null,
    },
    include: {
      author: { select: { id: true, username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } },
    },
  });

  if (fundraiser.creatorId !== session.user.id) {
    await prisma.notification.create({
      data: {
        userId: fundraiser.creatorId,
        type: "FUNDRAISER_COMMENT",
        body: `@${comment.author.username} commented on ${fundraiser.title}`,
        targetUrl: `/fundraisers/${fundraiser.id}`,
      },
    });
    await deliverPushNotification(
      fundraiser.creatorId,
      {
        title: "New notification",
        body: `@${comment.author.username} commented on ${fundraiser.title}`,
        url: `/fundraisers/${fundraiser.id}`,
      },
      "notification",
    );
  }

  if (parentAuthorId && parentAuthorId !== session.user.id && parentAuthorId !== fundraiser.creatorId) {
    await prisma.notification.create({
      data: {
        userId: parentAuthorId,
        type: "FUNDRAISER_REPLY",
        body: `@${comment.author.username} replied to your comment`,
        targetUrl: `/fundraisers/${fundraiser.id}`,
      },
    });
    await deliverPushNotification(
      parentAuthorId,
      {
        title: "New notification",
        body: `@${comment.author.username} replied to your comment`,
        url: `/fundraisers/${fundraiser.id}`,
      },
      "notification",
    );
  }

  return NextResponse.json(comment, { status: 201 });
}
