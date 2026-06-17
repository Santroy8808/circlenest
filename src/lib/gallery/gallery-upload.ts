import { prisma } from "@/lib/db/prisma";
import { createStreamPost } from "@/modules/stream/stream.write.service";

type GalleryVisibility = "PUBLIC" | "FRIENDS" | "FAMILY" | "FRIENDS_FAMILY" | "GROUPS" | "PRIVATE";

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

export function normalizeGalleryVisibility(raw: unknown): GalleryVisibility {
  if (raw === "PRIVATE") return "PRIVATE";
  if (raw === "FRIENDS_FAMILY") return "FRIENDS_FAMILY";
  if (raw === "FRIENDS") return "FRIENDS";
  if (raw === "FAMILY") return "FAMILY";
  if (raw === "GROUPS") return "GROUPS";
  return "PUBLIC";
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

export async function resolveGalleryAlbum(userId: string, albumId?: string | null) {
  const requestedAlbumId = typeof albumId === "string" ? albumId.trim() : "";
  if (requestedAlbumId) {
    const existing = await prisma.photoAlbum.findFirst({
      where: { id: requestedAlbumId, userId },
      select: { id: true, title: true },
    });
    if (!existing) return null;
    return existing;
  }

  const fallback = await prisma.photoAlbum.findFirst({
    where: { userId, title: "My Pics" },
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });
  if (fallback) return fallback;

  return prisma.photoAlbum.create({
    data: { userId, title: "My Pics" },
    select: { id: true, title: true },
  });
}

export async function createGalleryPhotoRecords({
  userId,
  albumId,
  urls,
  notifyFriendsAndFamily,
  visibility,
  caption,
  tagNames,
}: {
  userId: string;
  albumId?: string | null;
  urls: string[];
  notifyFriendsAndFamily?: boolean;
  visibility?: GalleryVisibility;
  caption?: string | null;
  tagNames?: string[];
}) {
  const safeUrls = Array.from(new Set(urls.filter((value) => typeof value === "string" && value.length > 0)));
  if (!safeUrls.length) {
    return { album: null, photos: [] as Array<any> };
  }

  const album = await resolveGalleryAlbum(userId, albumId);
  if (!album) return { album: null, photos: [] as Array<any> };

  const normalizedVisibility = normalizeGalleryVisibility(visibility);
  const normalizedTagNames = normalizeTagNames(tagNames);
  const tagIds = await resolveTagIds(userId, normalizedTagNames);

  const created = await Promise.all(
    safeUrls.map(async (url) => {
      const photo = await prisma.photo.create({
        data: {
          albumId: album.id,
          url,
          caption: caption?.trim() || null,
          tags: normalizedTagNames.length ? JSON.stringify(normalizedTagNames) : null,
          visibility: normalizedVisibility,
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
          author: { select: { username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
      photoTags: { include: { tag: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (notifyFriendsAndFamily) {
    const content = `Shared ${hydratedPhotos.length} new photo${hydratedPhotos.length === 1 ? "" : "s"}.`;
    await createStreamPost(userId, {
      content,
      imageUrl: hydratedPhotos[0]?.url,
      mediaUrlsJson: JSON.stringify(hydratedPhotos.map((photo) => photo.url)),
      topic: `gallery_upload|${album.id}|${encodeURIComponent(album.title)}`,
    });
  }

  return { album, photos: hydratedPhotos };
}
