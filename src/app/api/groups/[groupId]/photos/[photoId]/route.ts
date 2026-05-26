import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(request: Request, context: { params: { groupId: string; photoId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Join group first" }, { status: 403 });

  const body = (await request.json()) as { albumId?: string | null };

  if (body.albumId) {
    const album = await prisma.groupPhotoAlbum.findFirst({
      where: { id: body.albumId, groupId: context.params.groupId },
    });
    if (!album) return NextResponse.json({ error: "Album not found in this group" }, { status: 404 });
  }

  const photo = await prisma.groupPhoto.findFirst({
    where: { id: context.params.photoId, groupId: context.params.groupId },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const updated = await prisma.groupPhoto.update({
    where: { id: photo.id },
    data: { albumId: body.albumId ?? null },
  });

  return NextResponse.json(updated);
}
