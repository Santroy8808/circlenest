import { prisma } from "@/lib/db/prisma";
import { postSchema } from "@/lib/validation/schemas";
import { sanitizeUserText, checkRateLimitPlaceholder } from "@/lib/security";

const STREAM_PHOTOS_ALBUM_TITLE = "stream_photos";
const STREAM_IMAGE_TAG = "Stream_Image";
type PostAudience = "ALL" | "FRIENDS" | "FAMILY" | "GROUPS";

function parseMediaUrls(imageUrl?: string | null, mediaUrlsJson?: string | null): string[] {
  const urls = new Set<string>();
  if (imageUrl?.trim()) urls.add(imageUrl.trim());
  if (mediaUrlsJson?.trim()) {
    try {
      const parsed = JSON.parse(mediaUrlsJson) as unknown;
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === "string" && entry.trim()) urls.add(entry.trim());
        }
      }
    } catch {
      // ignore malformed JSON media payloads from older clients
    }
  }
  return [...urls];
}

function audienceToPhotoVisibility(audience: PostAudience) {
  if (audience === "FRIENDS") return "FRIENDS";
  if (audience === "FAMILY") return "FAMILY";
  if (audience === "GROUPS") return "GROUPS";
  return "PUBLIC";
}

function parseGroupIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

async function ensureStreamAlbum(userId: string, visibility: string, groupId: string | null) {
  const existing = await prisma.photoAlbum.findFirst({
    where: { userId, title: STREAM_PHOTOS_ALBUM_TITLE },
    select: { id: true, shareGroupIds: true },
    orderBy: { createdAt: "asc" },
  });

  if (!existing) {
    return prisma.photoAlbum.create({
      data: {
        userId,
        title: STREAM_PHOTOS_ALBUM_TITLE,
        visibility,
        shareGroupIds: visibility === "GROUPS" && groupId ? JSON.stringify([groupId]) : null,
      },
      select: { id: true },
    });
  }

  if (visibility === "GROUPS" && groupId) {
    const current = parseGroupIds(existing.shareGroupIds);
    if (!current.includes(groupId)) {
      await prisma.photoAlbum.update({
        where: { id: existing.id },
        data: { shareGroupIds: JSON.stringify([...current, groupId]) },
      });
    }
  }

  return { id: existing.id };
}

async function syncPostMediaToStreamPhotos(userId: string, audience: PostAudience, groupId: string | null, urls: string[]) {
  if (!urls.length) return;

  const visibility = audienceToPhotoVisibility(audience);
  const [album, streamTag] = await Promise.all([
    ensureStreamAlbum(userId, visibility, groupId),
    prisma.userMediaTag.upsert({
      where: { userId_name: { userId, name: STREAM_IMAGE_TAG } },
      update: {},
      create: { userId, name: STREAM_IMAGE_TAG },
      select: { id: true },
    }),
  ]);

  const existing = await prisma.photo.findMany({
    where: { albumId: album.id, url: { in: urls } },
    select: { id: true, url: true },
  });
  const existingByUrl = new Map(existing.map((entry) => [entry.url, entry.id]));

  const createdIds: string[] = [];
  for (const url of urls) {
    if (existingByUrl.has(url)) continue;
    const created = await prisma.photo.create({
      data: {
        albumId: album.id,
        url,
        visibility,
        tags: JSON.stringify([STREAM_IMAGE_TAG]),
      },
      select: { id: true },
    });
    createdIds.push(created.id);
  }

  const allPhotoIds = [...existing.map((entry) => entry.id), ...createdIds];
  if (allPhotoIds.length) {
    const existingTagRows = await prisma.photoTag.findMany({
      where: { tagId: streamTag.id, photoId: { in: allPhotoIds } },
      select: { photoId: true },
    });
    const tagged = new Set(existingTagRows.map((entry) => entry.photoId));
    const missingRows = allPhotoIds.filter((photoId) => !tagged.has(photoId));

    if (missingRows.length) {
      await prisma.photoTag.createMany({
        data: missingRows.map((photoId) => ({ photoId, tagId: streamTag.id })),
      });
    }
  }

  await prisma.photoAlbumTag.upsert({
    where: { albumId_tagId: { albumId: album.id, tagId: streamTag.id } },
    update: {},
    create: { albumId: album.id, tagId: streamTag.id },
  });
}

export async function createStreamPost(userId: string, rawBody: unknown) {
  const allowed = await checkRateLimitPlaceholder(`post:${userId}`);
  if (!allowed) return { ok: false as const, status: 429, error: "Rate limited" };

  const parsed = postSchema.safeParse(rawBody);
  if (!parsed.success) return { ok: false as const, status: 400, error: "Invalid post" };

  const audience = parsed.data.audience ?? "ALL";
  let groupId: string | null = null;
  if (audience === "GROUPS") {
    const targetGroupId = parsed.data.groupId ?? "";
    const membership = await prisma.groupMember.findFirst({
      where: { userId, groupId: targetGroupId },
      select: { id: true },
    });
    if (!membership) {
      return { ok: false as const, status: 403, error: "You can only post to groups you joined." };
    }
    groupId = targetGroupId;
  }

  const post = await prisma.post.create({
    data: {
      authorId: userId,
      content: sanitizeUserText(parsed.data.content),
      audience,
      groupId,
      imageUrl: parsed.data.imageUrl ?? null,
      mediaUrlsJson: parsed.data.mediaUrlsJson ?? null,
      topic: parsed.data.topic ?? null,
    },
    include: { author: true, comments: true, reactions: true },
  });
  const mediaUrls = parseMediaUrls(post.imageUrl, post.mediaUrlsJson);

  // Keep stream images discoverable in Gallery under `stream_photos` without blocking post success.
  if (mediaUrls.length) {
    void syncPostMediaToStreamPhotos(userId, audience, groupId, mediaUrls).catch((error) => {
      console.error("Failed to sync stream media to stream_photos album", error);
    });
  }

  return { ok: true as const, post };
}
