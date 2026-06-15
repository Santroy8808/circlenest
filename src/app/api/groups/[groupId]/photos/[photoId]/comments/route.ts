import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText } from "@/lib/security";

export async function POST(request: Request, context: { params: { groupId: string; photoId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } },
    select: { id: true },
  });
  if (!membership) return NextResponse.json({ error: "Join group first" }, { status: 403 });

  const photo = await prisma.groupPhoto.findFirst({
    where: { id: context.params.photoId, groupId: context.params.groupId },
    select: { id: true },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const body = (await request.json()) as { content?: string; parentCommentId?: string | null; mediaUrls?: string[] };
  const content = sanitizeUserText(String(body.content ?? "").trim());
  const mediaUrls = Array.isArray(body.mediaUrls)
    ? body.mediaUrls.map((value) => String(value).trim()).filter(Boolean).slice(0, 8)
    : [];

  if (!content && mediaUrls.length === 0) {
    return NextResponse.json({ error: "Add text or media to comment" }, { status: 400 });
  }

  if (body.parentCommentId) {
    const parent = await prisma.groupPhotoComment.findFirst({
      where: { id: body.parentCommentId, photoId: photo.id },
      select: { id: true },
    });
    if (!parent) return NextResponse.json({ error: "Parent comment not found in this photo" }, { status: 400 });
  }

  const created = await prisma.groupPhotoComment.create({
    data: {
      photoId: photo.id,
      authorId: session.user.id,
      parentCommentId: body.parentCommentId ?? null,
      content,
      mediaUrlsJson: mediaUrls.length ? JSON.stringify(mediaUrls) : null,
    },
    include: { author: { select: { username: true, fullName: true } } },
  });

  return NextResponse.json(created);
}
