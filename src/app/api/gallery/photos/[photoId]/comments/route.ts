import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { sanitizeUserText } from "@/lib/security";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

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
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;
  const photo = await canViewPhoto(session.user.id, context.params.photoId);
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  if (photo.commentsLocked && photo.album.userId !== session.user.id) {
    return NextResponse.json({ error: "Comments are locked for this photo" }, { status: 403 });
  }
  const body = (await request.json()) as { content?: string; parentCommentId?: string | null };
  const content = sanitizeUserText(String(body.content ?? "").trim());
  if (!content) return NextResponse.json({ error: "Comment required" }, { status: 400 });
  if (body.parentCommentId) {
    const parent = await prisma.photoComment.findFirst({
      where: { id: body.parentCommentId, photoId: photo.id },
      select: { id: true },
    });
    if (!parent) return NextResponse.json({ error: "Parent comment not found in this photo" }, { status: 400 });
  }

  const created = await prisma.photoComment.create({
    data: {
      photoId: photo.id,
      authorId: session.user.id,
      content,
      parentCommentId: body.parentCommentId ?? null,
    },
    include: { author: { select: { username: true, fullName: true } } },
  });
  return NextResponse.json(created);
}
