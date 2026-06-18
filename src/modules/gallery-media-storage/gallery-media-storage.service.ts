import { randomBytes } from "crypto";
import { MediaCollectionType, MediaVisibility, Prisma } from "@prisma/client";
import { getR2PublicUrl, createPresignedR2PutUrl } from "@/lib/platform/r2";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  completeUploadSchema,
  createUploadIntentSchema,
  type GalleryAssetView
} from "@/modules/gallery-media-storage/types";

const MODULE_KEY = "gallery-media-storage";
const MEDIA_DB_TIMEOUT_MS = 2500;

function withMediaDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), MEDIA_DB_TIMEOUT_MS);
    })
  ]);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function safeFileName(value: string) {
  const fallback = "photo";
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return cleaned || fallback;
}

function dateSlug(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toGalleryAssetView(asset: Prisma.MediaAssetGetPayload<{ include: { collections: { include: { collection: true } } } }>): GalleryAssetView {
  const metadata = asset.metadata as { caption?: string } | null;

  return {
    id: asset.id,
    storageKey: asset.storageKey,
    publicUrl: asset.publicUrl,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes.toString(),
    visibility: asset.visibility,
    caption: metadata?.caption,
    createdAt: asset.createdAt.toISOString(),
    collections: asset.collections.map((item) => ({
      name: item.collection.name,
      type: item.collection.type
    }))
  };
}

async function upsertCollection(ownerUserId: string, type: MediaCollectionType, name: string) {
  const slug = slugify(name);

  return prisma.mediaCollection.upsert({
    where: {
      ownerUserId_type_slug: {
        ownerUserId,
        type,
        slug
      }
    },
    update: { name },
    create: {
      ownerUserId,
      type,
      name,
      slug
    }
  });
}

async function attachAssetToCollection(mediaAssetId: string, collectionId: string) {
  await prisma.mediaCollectionAsset.upsert({
    where: {
      collectionId_mediaAssetId: {
        collectionId,
        mediaAssetId
      }
    },
    update: {},
    create: {
      collectionId,
      mediaAssetId
    }
  });
}

export async function createGalleryUploadIntent(userId: string, input: unknown) {
  const parsed = createUploadIntentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload." };
  }

  const storageKey = [
    "users",
    userId,
    "my-pics",
    dateSlug(),
    `${randomBytes(8).toString("hex")}-${safeFileName(parsed.data.fileName)}`
  ].join("/");

  try {
    const uploadUrl = await createPresignedR2PutUrl({
      storageKey,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes
    });

    return {
      ok: true as const,
      uploadUrl,
      storageKey,
      publicUrl: getR2PublicUrl(storageKey),
      expiresInSeconds: 300
    };
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not create upload intent.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Media storage is not configured." };
  }
}

export async function completeGalleryUpload(userId: string, input: unknown) {
  const parsed = completeUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload completion." };
  }

  const publicUrl = getR2PublicUrl(parsed.data.storageKey);
  const asset = await prisma.mediaAsset.create({
    data: {
      ownerUserId: userId,
      storageKey: parsed.data.storageKey,
      publicUrl,
      mimeType: parsed.data.mimeType,
      sizeBytes: BigInt(parsed.data.sizeBytes),
      originalName: parsed.data.fileName,
      visibility: parsed.data.visibility,
      metadata: {
        caption: parsed.data.caption || null
      }
    }
  });

  const systemDate = await upsertCollection(userId, MediaCollectionType.SYSTEM_DATE, dateSlug(asset.createdAt));
  await attachAssetToCollection(asset.id, systemDate.id);

  for (const tagName of parsed.data.tags) {
    const tag = await upsertCollection(userId, MediaCollectionType.TAG, tagName);
    await attachAssetToCollection(asset.id, tag.id);
  }

  await diagnostics.info(MODULE_KEY, "Gallery upload completed.", {
    userId,
    mediaAssetId: asset.id,
    storageKey: asset.storageKey
  });

  return { ok: true as const, asset };
}

export async function listMyPics(userId: string, take = 24): Promise<GalleryAssetView[]> {
  const assets = await withMediaDbTimeout(
    prisma.mediaAsset.findMany({
      where: {
        ownerUserId: userId,
        mimeType: {
          startsWith: "image/"
        }
      },
      include: {
        collections: {
          include: {
            collection: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take
    }),
    "my pics lookup"
  );

  return assets.map(toGalleryAssetView);
}

export async function safeListMyPics(userId: string, take = 24): Promise<GalleryAssetView[]> {
  try {
    return await listMyPics(userId, take);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list My Pics.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function createGalleryAlbum(userId: string, name: string) {
  const cleanName = name.trim();

  if (cleanName.length < 2) {
    return { ok: false as const, error: "Album name is too short." };
  }

  const album = await upsertCollection(userId, MediaCollectionType.ALBUM, cleanName);
  return { ok: true as const, album };
}
