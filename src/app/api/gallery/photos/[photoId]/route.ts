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
    commentsLocked?: boolean;
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
      commentsLocked: typeof body.commentsLocked === "boolean" ? body.commentsLocked : undefined,
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
        select: {
          id: true,
          content: true,
          parentCommentId: true,
          createdAt: true,
          author: { select: { username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        },
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

  // If this photo URL is still referenced by auto-generated gallery stream posts,
  // remove those references so storage cleanup can proceed.
  const posts = await prisma.post.findMany({
    where: {
      authorId: session.user.id,
      topic: { startsWith: "gallery_upload|" },
      OR: [{ imageUrl: owned.url }, { mediaUrlsJson: { contains: owned.url } }],
    },
    select: { id: true, imageUrl: true, mediaUrlsJson: true },
  });

  await Promise.all(
    posts.map(async (post) => {
      const currentMedia = (() => {
        if (!post.mediaUrlsJson) return [] as string[];
        try {
          const parsed = JSON.parse(post.mediaUrlsJson) as unknown;
          if (!Array.isArray(parsed)) return [] as string[];
          return parsed.map((value) => String(value)).filter(Boolean);
        } catch {
          return [] as string[];
        }
      })();

      const nextMedia = currentMedia.filter((url) => url !== owned.url);
      const nextImageUrl =
        post.imageUrl === owned.url
          ? (nextMedia[0] ?? null)
          : post.imageUrl;

      await prisma.post.update({
        where: { id: post.id },
        data: {
          imageUrl: nextImageUrl,
          mediaUrlsJson: nextMedia.length ? JSON.stringify(nextMedia) : null,
        },
      });
    }),
  );

  await tryReleaseUserUploadAsset(session.user.id, owned.url);
  return NextResponse.json({ ok: true });
}
