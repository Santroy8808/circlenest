import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } } });
  if (!membership) return NextResponse.json({ error: "Join group first" }, { status: 403 });

  const body = (await request.json()) as { caption?: string; url?: string; albumId?: string; tags?: string };
  if (!body.url?.trim()) return NextResponse.json({ error: "url required" }, { status: 400 });

  if (body.albumId) {
    const album = await prisma.groupPhotoAlbum.findFirst({ where: { id: body.albumId, groupId: context.params.groupId } });
    if (!album) return NextResponse.json({ error: "Album not found in this group" }, { status: 404 });
  }

  const normalizedTags = body.tags
    ? body.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12)
    : [];

  const photo = await prisma.groupPhoto.create({
    data: {
      groupId: context.params.groupId,
      albumId: body.albumId || null,
      uploaderId: session.user.id,
      caption: body.caption?.trim() || null,
      tags: normalizedTags.length ? JSON.stringify(normalizedTags) : null,
      url: body.url.trim(),
    },
  });

  return NextResponse.json(photo);
}
