import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { tryReleaseUserUploadAsset } from "@/lib/media/storage-quota";

async function assertOwnedPhoto(userId: string, photoId: string) {
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, album: { userId } },
    include: { album: true },
  });
  return photo;
}

export async function PATCH(request: Request, context: { params: { photoId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const owned = await assertOwnedPhoto(session.user.id, context.params.photoId);
  if (!owned) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const body = (await request.json()) as {
    caption?: string;
    tagNames?: string[];
    albumId?: string;
    visibility?: "PUBLIC" | "FRIENDS" | "FAMILY" | "FRIENDS_FAMILY" | "GROUPS" | "PRIVATE";
  };
  let nextAlbumId: string | undefined;
  if (body.albumId) {
    const album = await prisma.photoAlbum.findFirst({ where: { id: body.albumId, userId: session.user.id } });
    if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
    nextAlbumId = album.id;
  }
  const tagNames = Array.isArray(body.tagNames)
    ? Array.from(new Set(body.tagNames.map((value) => String(value).trim()).filter(Boolean).slice(0, 30)))
    : undefined;
  const visibility =
    body.visibility === "PUBLIC" ||
    body.visibility === "FRIENDS" ||
    body.visibility === "FAMILY" ||
    body.visibility === "FRIENDS_FAMILY" ||
    body.visibility === "GROUPS" ||
    body.visibility === "PRIVATE"
      ? body.visibility
      : undefined;

  const updatedCore = await prisma.photo.update({
    where: { id: owned.id },
    data: {
      caption: body.caption !== undefined ? (body.caption.trim() || null) : undefined,
      tags: tagNames !== undefined ? (tagNames.length ? JSON.stringify(tagNames) : null) : undefined,
      albumId: nextAlbumId,
      visibility,
    },
  });

  if (tagNames !== undefined) {
    await prisma.photoTag.deleteMany({ where: { photoId: updatedCore.id } });
    if (tagNames.length) {
      const tagRecords = await Promise.all(
        tagNames.map((name) =>
          prisma.userMediaTag.upsert({
            where: { userId_name: { userId: session.user.id, name } },
            update: {},
            create: { userId: session.user.id, name },
            select: { id: true },
          }),
        ),
      );
      await prisma.photoTag.createMany({
        data: tagRecords.map((tag) => ({ photoId: updatedCore.id, tagId: tag.id })),
      });
    }
  }

  const updated = await prisma.photo.findUnique({
    where: { id: updatedCore.id },
    include: {
      comments: {
        include: { author: { select: { username: true, fullName: true } } },
        orderBy: { createdAt: "asc" },
      },
      photoTags: { include: { tag: true } },
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: { params: { photoId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const owned = await assertOwnedPhoto(session.user.id, context.params.photoId);
  if (!owned) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  await prisma.photo.delete({ where: { id: owned.id } });
  await tryReleaseUserUploadAsset(session.user.id, owned.url);
  return NextResponse.json({ ok: true });
}
