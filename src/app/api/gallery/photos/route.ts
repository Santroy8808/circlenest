import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { createStreamPost } from "@/modules/stream/stream.write.service";

type UploadPhotoBody = {
  albumId?: string;
  caption?: string;
  tagNames?: string[];
  urls?: string[];
  notifyFriendsAndFamily?: boolean;
  visibility?: "PUBLIC" | "FRIENDS" | "FAMILY" | "FRIENDS_FAMILY" | "GROUPS" | "PRIVATE";
};

function normalizeTagNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((value) => String(value).trim())
        .filter(Boolean)
        .slice(0, 30),
    ),
  );
}

async function resolveTagIds(userId: string, tagNames: string[]): Promise<string[]> {
  if (!tagNames.length) return [];

  await Promise.all(
    tagNames.map((name) =>
      prisma.userMediaTag.upsert({
        where: { userId_name: { userId, name } },
        update: {},
        create: { userId, name },
        select: { id: true },
      }),
    ),
  );

  const tags = await prisma.userMediaTag.findMany({
    where: { userId, name: { in: tagNames } },
    select: { id: true },
  });
  return tags.map((tag) => tag.id);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as UploadPhotoBody;
  const urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === "string" && u.length > 0) : [];
  if (!urls.length) return NextResponse.json({ error: "No photos provided" }, { status: 400 });
  const tagNames = normalizeTagNames(body.tagNames);
  const visibility =
    body.visibility === "PRIVATE" ||
    body.visibility === "FRIENDS_FAMILY" ||
    body.visibility === "FRIENDS" ||
    body.visibility === "FAMILY" ||
    body.visibility === "GROUPS"
      ? body.visibility
      : "PUBLIC";

  let albumId = body.albumId;
  if (!albumId) {
    const fallback = await prisma.photoAlbum.findFirst({
      where: { userId: session.user.id, title: "stream_photos" },
      select: { id: true },
    });
    if (fallback) {
      albumId = fallback.id;
    } else {
      const created = await prisma.photoAlbum.create({ data: { userId: session.user.id, title: "stream_photos" }, select: { id: true } });
      albumId = created.id;
    }
  }

  const album = await prisma.photoAlbum.findFirst({ where: { id: albumId, userId: session.user.id } });
  if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
  const tagIds = await resolveTagIds(session.user.id, tagNames);

  const created = await Promise.all(
    urls.map(async (url) => {
      const photo = await prisma.photo.create({
        data: {
          albumId: album.id,
          url,
          caption: body.caption?.trim() || null,
          tags: tagNames.length ? JSON.stringify(tagNames) : null,
          visibility,
        },
      });
      if (tagIds.length) {
        await prisma.photoTag.createMany({
          data: tagIds.map((tagId) => ({ photoId: photo.id, tagId })),
        });
      }
      return photo;
    }),
  );

  const hydratedPhotos = await prisma.photo.findMany({
    where: { id: { in: created.map((photo) => photo.id) } },
    include: {
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
      photoTags: { include: { tag: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (body.notifyFriendsAndFamily) {
    const content = `Shared ${hydratedPhotos.length} new photo${hydratedPhotos.length === 1 ? "" : "s"}.`;
    await createStreamPost(session.user.id, {
      content,
      imageUrl: hydratedPhotos[0]?.url,
      mediaUrlsJson: JSON.stringify(hydratedPhotos.map((p) => p.url)),
      topic: `gallery_upload|${album.id}|${encodeURIComponent(album.title)}`,
    });
  }

  return NextResponse.json({ ok: true, photos: hydratedPhotos });
}
