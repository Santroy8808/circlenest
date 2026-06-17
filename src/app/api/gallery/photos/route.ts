import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { createGalleryPhotoRecords } from "@/lib/gallery/gallery-upload";

type UploadPhotoBody = {
  albumId?: string;
  caption?: string;
  tagNames?: string[];
  urls?: string[];
  notifyFriendsAndFamily?: boolean;
  visibility?: "PUBLIC" | "FRIENDS" | "FAMILY" | "FRIENDS_FAMILY" | "GROUPS" | "PRIVATE";
};

type BulkOrganizeBody = {
  photoIds?: string[];
  albumId?: string;
  createAlbumTitle?: string;
  tagNames?: string[];
};

function normalizeTagNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((value) => String(value).trim()).filter(Boolean).slice(0, 30)));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as UploadPhotoBody;
  const urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === "string" && u.length > 0) : [];
  if (!urls.length) return NextResponse.json({ error: "No photos provided" }, { status: 400 });

  const result = await createGalleryPhotoRecords({
    userId: session.user.id,
    albumId: body.albumId,
    urls,
    notifyFriendsAndFamily: body.notifyFriendsAndFamily,
    visibility: body.visibility,
    caption: body.caption ?? null,
    tagNames: body.tagNames ?? [],
  });

  if (!result.album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
  return NextResponse.json({ ok: true, album: result.album, photos: result.photos });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as BulkOrganizeBody;
  const photoIds = Array.from(new Set((Array.isArray(body.photoIds) ? body.photoIds : []).map((value) => String(value).trim()).filter(Boolean)));
  if (!photoIds.length) return NextResponse.json({ error: "No photos selected." }, { status: 400 });

  const ownedPhotos = await prisma.photo.findMany({
    where: { id: { in: photoIds }, album: { userId: session.user.id } },
    include: {
      album: { select: { id: true, title: true } },
      photoTags: { include: { tag: true } },
    },
  });
  if (ownedPhotos.length !== photoIds.length) {
    return NextResponse.json({ error: "One or more photos could not be found." }, { status: 404 });
  }

  let targetAlbum = null as null | { id: string; title: string };
  const requestedAlbumId = String(body.albumId ?? "").trim();
  const requestedAlbumTitle = String(body.createAlbumTitle ?? "").trim();

  if (requestedAlbumId) {
    const existingAlbum = await prisma.photoAlbum.findFirst({
      where: { id: requestedAlbumId, userId: session.user.id },
      select: { id: true, title: true },
    });
    if (!existingAlbum) return NextResponse.json({ error: "Album not found." }, { status: 404 });
    targetAlbum = existingAlbum;
  } else if (requestedAlbumTitle) {
    const existingAlbum = await prisma.photoAlbum.findFirst({
      where: { userId: session.user.id, title: requestedAlbumTitle },
      select: { id: true, title: true },
    });
    targetAlbum =
      existingAlbum ??
      (await prisma.photoAlbum.create({
        data: { userId: session.user.id, title: requestedAlbumTitle },
        select: { id: true, title: true },
      }));
  }

  const addTagNames = normalizeTagNames(body.tagNames);
  let addTagMap = new Map<string, string>();
  if (addTagNames.length) {
    await Promise.all(
      addTagNames.map((name) =>
        prisma.userMediaTag.upsert({
          where: { userId_name: { userId: session.user.id, name } },
          update: {},
          create: { userId: session.user.id, name },
        }),
      ),
    );
    const tags = await prisma.userMediaTag.findMany({
      where: { userId: session.user.id, name: { in: addTagNames } },
      select: { id: true, name: true },
    });
    addTagMap = new Map(tags.map((tag) => [tag.name, tag.id]));
  }

  await prisma.$transaction(
    ownedPhotos.map((photo) => {
      const mergedTagNames = Array.from(new Set([...photo.photoTags.map((entry) => entry.tag.name), ...addTagNames]));
      const mergedTagIds = mergedTagNames.map((name) => addTagMap.get(name) ?? photo.photoTags.find((entry) => entry.tag.name === name)?.tag.id).filter(Boolean) as string[];
      return prisma.photo.update({
        where: { id: photo.id },
        data: {
          albumId: targetAlbum?.id ?? undefined,
          tags: mergedTagNames.length ? JSON.stringify(mergedTagNames) : null,
          photoTags: {
            deleteMany: {},
            ...(mergedTagIds.length
              ? {
                  createMany: {
                    data: mergedTagIds.map((tagId) => ({ tagId })),
                  },
                }
              : {}),
          },
        },
      });
    }),
  );

  const updatedPhotos = await prisma.photo.findMany({
    where: { id: { in: photoIds } },
    include: {
      album: { select: { id: true, title: true } },
      photoTags: { include: { tag: true } },
      comments: {
        select: {
          id: true,
          content: true,
          parentCommentId: true,
          createdAt: true,
          author: { select: { username: true, fullName: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    album: targetAlbum,
    photos: updatedPhotos,
  });
}
