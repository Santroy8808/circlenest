import { randomBytes } from "crypto";
import { MediaCollectionType, MediaVisibility, Prisma } from "@prisma/client";
import { deleteR2Object, getR2PublicUrl, createPresignedR2PutUrl } from "@/lib/platform/r2";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  completeUploadSchema,
  createGalleryAssetCommentSchema,
  createUploadIntentSchema,
  deleteGalleryAssetsSchema,
  DEFAULT_GALLERY_TAGS,
  updateGalleryAssetTagsSchema,
  updateGalleryAssetSettingsSchema,
  type GalleryAssetCommentView,
  type GalleryAssetViewer,
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

function cleanTagName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

function uniqueCleanTagNames(tags: string[]) {
  const bySlug = new Map<string, string>();

  tags.forEach((tag) => {
    const clean = cleanTagName(tag);
    const slug = slugify(clean);

    if (clean && slug && !bySlug.has(slug)) {
      bySlug.set(slug, clean);
    }
  });

  return [...bySlug.values()];
}

function safeFileName(value: string) {
  const fallback = "photo";
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return cleaned || fallback;
}

function dateSlug(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

type UploadSource = "GALLERY" | "STREAM_POST" | "STREAM_REPLY";

function sourceFolder(source: UploadSource) {
  return source === "GALLERY" ? "my-pics" : "stream-images";
}

function sourceTags(source: UploadSource) {
  if (source === "STREAM_POST") return ["Stream Images", "Stream Post Images"];
  if (source === "STREAM_REPLY") return ["Stream Images", "Stream Reply Images"];
  return [];
}

type GalleryAssetMetadata = {
  caption?: string | null;
  commentsEnabled?: boolean;
  source?: UploadSource;
};

function toGalleryAssetView(asset: Prisma.MediaAssetGetPayload<{ include: { collections: { include: { collection: true } } } }>): GalleryAssetView {
  const metadata = asset.metadata as GalleryAssetMetadata | null;
  const collections = asset.collections.map((item) => ({
    name: item.collection.name,
    type: item.collection.type
  }));

  return {
    id: asset.id,
    storageKey: asset.storageKey,
    publicUrl: asset.publicUrl,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes.toString(),
    visibility: asset.visibility,
    caption: metadata?.caption,
    commentsEnabled: Boolean(metadata?.commentsEnabled),
    createdAt: asset.createdAt.toISOString(),
    collections,
    tags: collections.filter((item) => item.type === MediaCollectionType.TAG).map((item) => item.name)
  };
}

function toGalleryAssetCommentView(
  comment: Prisma.GalleryAssetCommentGetPayload<{
    include: { author: { include: { profile: true } } };
  }>
): GalleryAssetCommentView {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: {
      id: comment.author.id,
      displayName: comment.author.profile?.displayName ?? comment.author.username,
      username: comment.author.username,
      avatarUrl: comment.author.profile?.avatarUrl
    }
  };
}

function canViewAsset(userId: string, asset: { ownerUserId: string; visibility: MediaVisibility }) {
  return asset.ownerUserId === userId || asset.visibility === MediaVisibility.MEMBERS || asset.visibility === MediaVisibility.PUBLIC;
}

function canCommentOnAsset(userId: string, asset: { ownerUserId: string; visibility: MediaVisibility; metadata: Prisma.JsonValue | null }) {
  const metadata = asset.metadata as GalleryAssetMetadata | null;
  return canViewAsset(userId, asset) && asset.visibility !== MediaVisibility.PRIVATE && Boolean(metadata?.commentsEnabled);
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

function galleryAssetInclude() {
  return {
    collections: {
      include: {
        collection: true
      }
    }
  };
}

export async function createGalleryUploadIntent(userId: string, input: unknown) {
  const parsed = createUploadIntentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload." };
  }

  const storageKey = [
    "users",
    userId,
    sourceFolder(parsed.data.source),
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

  const expectedPrefix = `users/${userId}/${sourceFolder(parsed.data.source)}/`;

  if (!parsed.data.storageKey.startsWith(expectedPrefix)) {
    return { ok: false as const, error: "Invalid upload target." };
  }

  const publicUrl = getR2PublicUrl(parsed.data.storageKey);
  const metadata = {
    caption: parsed.data.caption || null,
    commentsEnabled: parsed.data.visibility !== MediaVisibility.PRIVATE && parsed.data.commentsEnabled,
    source: parsed.data.source
  };
  const asset = await prisma.mediaAsset.upsert({
    where: {
      storageKey: parsed.data.storageKey
    },
    update: {
      publicUrl,
      mimeType: parsed.data.mimeType,
      sizeBytes: BigInt(parsed.data.sizeBytes),
      originalName: parsed.data.fileName,
      visibility: parsed.data.visibility,
      metadata
    },
    create: {
      ownerUserId: userId,
      storageKey: parsed.data.storageKey,
      publicUrl,
      mimeType: parsed.data.mimeType,
      sizeBytes: BigInt(parsed.data.sizeBytes),
      originalName: parsed.data.fileName,
      visibility: parsed.data.visibility,
      metadata
    }
  });

  const systemDate = await upsertCollection(userId, MediaCollectionType.SYSTEM_DATE, dateSlug(asset.createdAt));
  await attachAssetToCollection(asset.id, systemDate.id);

  const tagNames = uniqueCleanTagNames([...sourceTags(parsed.data.source), ...parsed.data.tags]);

  for (const tagName of tagNames) {
    const tag = await upsertCollection(userId, MediaCollectionType.TAG, tagName);
    await attachAssetToCollection(asset.id, tag.id);
  }

  await diagnostics.info(MODULE_KEY, "Gallery upload completed.", {
    userId,
    mediaAssetId: asset.id,
    storageKey: asset.storageKey
  });

  const trackedAsset = await prisma.mediaAsset.findUnique({
    where: { id: asset.id },
    include: galleryAssetInclude()
  });

  return { ok: true as const, asset: trackedAsset ? toGalleryAssetView(trackedAsset) : null };
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
      include: galleryAssetInclude(),
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

export async function getMyPic(userId: string, mediaAssetId: string): Promise<GalleryAssetView | null> {
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaAssetId,
      ownerUserId: userId,
      mimeType: {
        startsWith: "image/"
      }
    },
    include: galleryAssetInclude()
  });

  return asset ? toGalleryAssetView(asset) : null;
}

export async function getMyPicViewer(userId: string, mediaAssetId: string): Promise<GalleryAssetViewer | null> {
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaAssetId,
      ownerUserId: userId,
      mimeType: {
        startsWith: "image/"
      }
    },
    include: galleryAssetInclude()
  });

  if (!asset) return null;

  const [previous, next, comments] = await Promise.all([
    prisma.mediaAsset.findFirst({
      where: {
        ownerUserId: userId,
        mimeType: {
          startsWith: "image/"
        },
        createdAt: {
          gt: asset.createdAt
        }
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        id: true,
        originalName: true
      }
    }),
    prisma.mediaAsset.findFirst({
      where: {
        ownerUserId: userId,
        mimeType: {
          startsWith: "image/"
        },
        createdAt: {
          lt: asset.createdAt
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        originalName: true
      }
    }),
    prisma.galleryAssetComment.findMany({
      where: {
        mediaAssetId: asset.id,
        deletedAt: null
      },
      include: {
        author: {
          include: {
            profile: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      },
      take: 100
    })
  ]);

  return {
    asset: toGalleryAssetView(asset),
    comments: comments.map(toGalleryAssetCommentView),
    previous,
    next
  };
}

export async function updateGalleryAssetSettings(userId: string, input: unknown) {
  const parsed = updateGalleryAssetSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid photo settings." };
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: parsed.data.mediaAssetId,
      ownerUserId: userId,
      mimeType: {
        startsWith: "image/"
      }
    }
  });

  if (!asset) {
    return { ok: false as const, error: "Photo not found." };
  }

  const metadata = (asset.metadata as GalleryAssetMetadata | null) ?? {};
  const commentsEnabled = parsed.data.visibility !== MediaVisibility.PRIVATE && parsed.data.commentsEnabled;

  await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: {
      visibility: parsed.data.visibility,
      metadata: {
        ...metadata,
        commentsEnabled
      }
    }
  });

  return { ok: true as const };
}

export async function updateGalleryAssetTags(userId: string, input: unknown) {
  const parsed = updateGalleryAssetTagsSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid gallery tags." };
  }

  const tags = uniqueCleanTagNames(parsed.data.tags);

  if (tags.length === 0) {
    return { ok: false as const, error: "Choose at least one tag." };
  }

  const mediaAssetIds = [...new Set(parsed.data.mediaAssetIds)];
  const assets = await prisma.mediaAsset.findMany({
    where: {
      id: {
        in: mediaAssetIds
      },
      ownerUserId: userId,
      mimeType: {
        startsWith: "image/"
      }
    },
    select: {
      id: true
    }
  });

  if (assets.length !== mediaAssetIds.length) {
    return { ok: false as const, error: "One or more selected photos were not found." };
  }

  const assetIds = assets.map((asset) => asset.id);
  const collectionIds: string[] = [];

  for (const tagName of tags) {
    const tag = await upsertCollection(userId, MediaCollectionType.TAG, tagName);
    collectionIds.push(tag.id);
  }

  if (parsed.data.mode === "replace") {
    await prisma.mediaCollectionAsset.deleteMany({
      where: {
        mediaAssetId: {
          in: assetIds
        },
        collection: {
          ownerUserId: userId,
          type: MediaCollectionType.TAG
        }
      }
    });
  }

  for (const mediaAssetId of assetIds) {
    for (const collectionId of collectionIds) {
      await attachAssetToCollection(mediaAssetId, collectionId);
    }
  }

  const updatedAssets = await prisma.mediaAsset.findMany({
    where: {
      id: {
        in: assetIds
      }
    },
    include: galleryAssetInclude(),
    orderBy: {
      createdAt: "desc"
    }
  });

  await diagnostics.info(MODULE_KEY, "Gallery tags updated.", {
    userId,
    mediaAssetIds: assetIds,
    tags,
    mode: parsed.data.mode
  });

  return {
    ok: true as const,
    assets: updatedAssets.map(toGalleryAssetView)
  };
}

export async function deleteGalleryAssets(userId: string, input: unknown) {
  const parsed = deleteGalleryAssetsSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid gallery delete request." };
  }

  const mediaAssetIds = [...new Set(parsed.data.mediaAssetIds)];
  const assets = await prisma.mediaAsset.findMany({
    where: {
      id: {
        in: mediaAssetIds
      },
      ownerUserId: userId,
      mimeType: {
        startsWith: "image/"
      }
    },
    select: {
      id: true,
      storageKey: true
    }
  });

  if (assets.length !== mediaAssetIds.length) {
    return { ok: false as const, error: "One or more selected photos were not found." };
  }

  const deleted = await prisma.mediaAsset.deleteMany({
    where: {
      id: {
        in: assets.map((asset) => asset.id)
      },
      ownerUserId: userId
    }
  });

  await Promise.all(
    assets.map(async (asset) => {
      try {
        await deleteR2Object(asset.storageKey);
      } catch (error) {
        await diagnostics.error(MODULE_KEY, "Gallery object deletion failed after database delete.", {
          userId,
          mediaAssetId: asset.id,
          storageKey: asset.storageKey,
          error: error instanceof Error ? error.message : "unknown"
        });
      }
    })
  );

  await diagnostics.info(MODULE_KEY, "Gallery assets deleted.", {
    userId,
    mediaAssetIds: assets.map((asset) => asset.id),
    count: deleted.count
  });

  return {
    ok: true as const,
    deletedCount: deleted.count,
    deletedMediaAssetIds: assets.map((asset) => asset.id)
  };
}

export async function createGalleryAssetComment(userId: string, input: unknown) {
  const parsed = createGalleryAssetCommentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: parsed.data.mediaAssetId,
      mimeType: {
        startsWith: "image/"
      }
    },
    select: {
      id: true,
      ownerUserId: true,
      visibility: true,
      metadata: true
    }
  });

  if (!asset || !canViewAsset(userId, asset)) {
    return { ok: false as const, error: "Photo not found." };
  }

  if (!canCommentOnAsset(userId, asset)) {
    return { ok: false as const, error: "Comments are not enabled for this photo." };
  }

  const comment = await prisma.galleryAssetComment.create({
    data: {
      mediaAssetId: asset.id,
      authorUserId: userId,
      body: parsed.data.body
    },
    include: {
      author: {
        include: {
          profile: true
        }
      }
    }
  });

  if (asset.ownerUserId !== userId) {
    await prisma.notification.create({
      data: {
        userId: asset.ownerUserId,
        title: "New photo comment",
        body: "Someone commented on one of your photos.",
        href: `/profile/gallery/${asset.id}`
      }
    });
  }

  return { ok: true as const, comment: toGalleryAssetCommentView(comment) };
}

export async function createGalleryAlbum(userId: string, name: string) {
  const cleanName = name.trim();

  if (cleanName.length < 2) {
    return { ok: false as const, error: "Album name is too short." };
  }

  const album = await upsertCollection(userId, MediaCollectionType.ALBUM, cleanName);
  return { ok: true as const, album };
}

export function galleryDefaultTags() {
  return [...DEFAULT_GALLERY_TAGS];
}
