import { randomBytes } from "crypto";
import { FeedReactionType, MediaAssetStatus, MediaCollectionType, MediaVisibility, Prisma } from "@prisma/client";
import { createPresignedR2PutUrl, deleteR2Object, getR2PublicUrl, verifyR2Object } from "@/lib/platform/r2";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { canAccessMedia, mediaAssetDeliveryPath } from "@/modules/media/media-authorization";
import {
  completeUploadSchema,
  createGalleryAssetCommentSchema,
  createUploadIntentSchema,
  deleteGalleryAssetsSchema,
  DEFAULT_GALLERY_TAGS,
  reactToGalleryAssetCommentSchema,
  reactToGalleryAssetSchema,
  updateGalleryAssetTagsSchema,
  updateGalleryAssetSettingsSchema,
  type GalleryAssetCommentView,
  type GalleryReactionReactorsView,
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

type UploadSource = "GALLERY" | "STREAM_POST" | "STREAM_REPLY" | "AD_CREATIVE";
const SYSTEM_GALLERY_TAGS = new Set(["stream images", "stream post images", "stream reply images", "ad", "ad images", "ad creative"]);

function sourceFolder(source: UploadSource) {
  if (source === "AD_CREATIVE") return "ad-creatives";
  return source === "GALLERY" ? "my-pics" : "stream-images";
}

function sourceTags(source: UploadSource) {
  if (source === "STREAM_POST") return ["Stream Images", "Stream Post Images"];
  if (source === "STREAM_REPLY") return ["Stream Images", "Stream Reply Images"];
  if (source === "AD_CREATIVE") return ["Ad Images", "Ad Creative"];
  return [];
}

type GalleryAssetMetadata = {
  caption?: string | null;
  commentsEnabled?: boolean;
  source?: UploadSource;
  thumbnailStorageKey?: string | null;
  thumbnailUrl?: string | null;
};

type GalleryReactionRecord = {
  type: FeedReactionType;
  user: {
    id: string;
    username: string;
    profile: {
      displayName: string | null;
      avatarUrl: string | null;
    } | null;
  };
};

function galleryReactionInclude() {
  return {
    include: {
      user: {
        include: {
          profile: true
        }
      }
    }
  };
}

function summarizeReactions(reactions: GalleryReactionRecord[]) {
  const counts: Partial<Record<FeedReactionType, number>> = {};
  const reactors: GalleryReactionReactorsView = {};

  reactions.forEach((reaction) => {
    if (reaction.type === FeedReactionType.DISLIKE) return;

    counts[reaction.type] = (counts[reaction.type] ?? 0) + 1;
    reactors[reaction.type] = [
      ...(reactors[reaction.type] ?? []),
      {
        id: reaction.user.id,
        displayName: reaction.user.profile?.displayName ?? reaction.user.username,
        username: reaction.user.username,
        avatarUrl: reaction.user.profile?.avatarUrl
      }
    ];
  });

  return { counts, reactors };
}

function toGalleryAssetView(
  asset: Prisma.MediaAssetGetPayload<{
    include: {
      collections: { include: { collection: true } };
      galleryComments: { select: { body: true } };
      galleryReactions: ReturnType<typeof galleryReactionInclude>;
    };
  }>
): GalleryAssetView {
  const metadata = asset.metadata as GalleryAssetMetadata | null;
  const authorizedDeliveryUrl = mediaAssetDeliveryPath(asset.id);
  const publiclyDeliverable = asset.visibility === MediaVisibility.PUBLIC;
  const publicUrl = publiclyDeliverable ? asset.publicUrl ?? getR2PublicUrl(asset.storageKey) : authorizedDeliveryUrl;
  const thumbnailUrl = publiclyDeliverable
    ? metadata?.thumbnailUrl ?? (metadata?.thumbnailStorageKey ? getR2PublicUrl(metadata.thumbnailStorageKey) : null)
    : authorizedDeliveryUrl;
  const collections = asset.collections.map((item) => ({
    name: item.collection.name,
    type: item.collection.type
  }));
  const reactionSummary = summarizeReactions(asset.galleryReactions);

  return {
    id: asset.id,
    storageKey: asset.storageKey,
    publicUrl,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes.toString(),
    visibility: asset.visibility,
    caption: metadata?.caption,
    commentsEnabled: Boolean(metadata?.commentsEnabled),
    createdAt: asset.createdAt.toISOString(),
    source: metadata?.source ?? null,
    thumbnailUrl,
    commentSearchText: asset.galleryComments.map((comment) => comment.body).join(" "),
    reactions: reactionSummary.counts,
    reactionReactors: reactionSummary.reactors,
    collections,
    tags: collections.filter((item) => item.type === MediaCollectionType.TAG).map((item) => item.name)
  };
}

function isSystemGalleryAsset(asset: GalleryAssetView) {
  if (asset.source && asset.source !== "GALLERY") return true;
  return asset.tags.some((tag) => SYSTEM_GALLERY_TAGS.has(tag.trim().toLowerCase()));
}

function toGalleryAssetCommentView(
  comment: Prisma.GalleryAssetCommentGetPayload<{
    include: { author: { include: { profile: true } }; reactions: ReturnType<typeof galleryReactionInclude> };
  }>
): GalleryAssetCommentView {
  const reactionSummary = summarizeReactions(comment.reactions);

  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: {
      id: comment.author.id,
      displayName: comment.author.profile?.displayName ?? comment.author.username,
      username: comment.author.username,
      avatarUrl: comment.author.profile?.avatarUrl
    },
    reactions: reactionSummary.counts,
    reactionReactors: reactionSummary.reactors
  };
}

function canViewAsset(userId: string, asset: { ownerUserId: string; visibility: MediaVisibility }) {
  return canAccessMedia({
    viewerUserId: userId,
    asset
  });
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
    },
    galleryComments: {
      where: {
        deletedAt: null
      },
      orderBy: {
        createdAt: "desc" as const
      },
      select: {
        body: true
      },
      take: 50
    },
    galleryReactions: galleryReactionInclude()
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
      sizeBytes: parsed.data.sizeBytes,
      access: parsed.data.visibility === MediaVisibility.PUBLIC ? "public" : "private"
    });

    return {
      ok: true as const,
      uploadUrl,
      storageKey,
      publicUrl: parsed.data.visibility === MediaVisibility.PUBLIC ? getR2PublicUrl(storageKey) : null,
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

  if (parsed.data.thumbnailStorageKey && !parsed.data.thumbnailStorageKey.startsWith(expectedPrefix)) {
    return { ok: false as const, error: "Invalid thumbnail upload target." };
  }

  const uploadedObject = await verifyR2Object({
    storageKey: parsed.data.storageKey,
    expectedMimeType: parsed.data.mimeType,
    expectedSizeBytes: parsed.data.sizeBytes,
    access: parsed.data.visibility === MediaVisibility.PUBLIC ? "public" : "private",
    label: "Photo upload"
  });

  if (!uploadedObject.ok) {
    return { ok: false as const, error: uploadedObject.error };
  }

  if (parsed.data.thumbnailStorageKey) {
    const uploadedThumbnail = await verifyR2Object({
      storageKey: parsed.data.thumbnailStorageKey,
      expectedMimeType: "image/jpeg",
      access: parsed.data.visibility === MediaVisibility.PUBLIC ? "public" : "private",
      label: "Photo thumbnail upload"
    });

    if (!uploadedThumbnail.ok) {
      return { ok: false as const, error: uploadedThumbnail.error };
    }
  }

  const publiclyDeliverable = parsed.data.visibility === MediaVisibility.PUBLIC;
  const publicUrl = publiclyDeliverable ? getR2PublicUrl(parsed.data.storageKey) : null;
  const thumbnailUrl = publiclyDeliverable && parsed.data.thumbnailStorageKey ? getR2PublicUrl(parsed.data.thumbnailStorageKey) : null;
  const systemSource = parsed.data.source !== "GALLERY";
  const metadata = {
    caption: parsed.data.caption || null,
    commentsEnabled: parsed.data.visibility !== MediaVisibility.PRIVATE && parsed.data.commentsEnabled,
    hiddenFromGalleryByDefault: systemSource,
    retentionPolicy: systemSource
      ? {
          compressAfterDays: 14,
          purgeUnviewedAfterDays: 14
        }
      : null,
    source: parsed.data.source,
    thumbnailStorageKey: parsed.data.thumbnailStorageKey ?? null,
    thumbnailUrl
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
      status: MediaAssetStatus.READY,
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
      status: MediaAssetStatus.READY,
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

export async function listMyPics(userId: string, take = 24, options: { includeSystem?: boolean } = {}): Promise<GalleryAssetView[]> {
  const queryTake = options.includeSystem ? take : Math.max(take * 3, take);
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
      take: queryTake
    }),
    "my pics lookup"
  );

  const views = assets.map(toGalleryAssetView);
  return options.includeSystem ? views : views.filter((asset) => !isSystemGalleryAsset(asset)).slice(0, take);
}

export async function safeListMyPics(userId: string, take = 24, options: { includeSystem?: boolean } = {}): Promise<GalleryAssetView[]> {
  try {
    return await listMyPics(userId, take, options);
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
        },
        reactions: galleryReactionInclude()
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
  const tagSlugs = tags.map(slugify);

  if (parsed.data.mode !== "remove") {
    for (const tagName of tags) {
      const tag = await upsertCollection(userId, MediaCollectionType.TAG, tagName);
      collectionIds.push(tag.id);
    }
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
  } else if (parsed.data.mode === "remove") {
    await prisma.mediaCollectionAsset.deleteMany({
      where: {
        mediaAssetId: {
          in: assetIds
        },
        collection: {
          ownerUserId: userId,
          type: MediaCollectionType.TAG,
          slug: {
            in: tagSlugs
          }
        }
      }
    });
  }

  if (parsed.data.mode !== "remove") {
    for (const mediaAssetId of assetIds) {
      for (const collectionId of collectionIds) {
        await attachAssetToCollection(mediaAssetId, collectionId);
      }
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
      storageKey: true,
      metadata: true,
      visibility: true
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
      const metadata = asset.metadata as GalleryAssetMetadata | null;
      const storageKeys = [asset.storageKey, metadata?.thumbnailStorageKey].filter((key): key is string => Boolean(key));

      try {
        await Promise.all(
          storageKeys.map((storageKey) =>
            deleteR2Object(storageKey, asset.visibility === MediaVisibility.PUBLIC ? "public" : "private")
          )
        );
      } catch (error) {
        await diagnostics.error(MODULE_KEY, "Gallery object deletion failed after database delete.", {
          userId,
          mediaAssetId: asset.id,
          storageKeys,
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
      },
      reactions: galleryReactionInclude()
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

export async function reactToGalleryAsset(userId: string, input: unknown) {
  const parsed = reactToGalleryAssetSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid reaction." };
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
      visibility: true
    }
  });

  if (!asset || !canViewAsset(userId, asset)) {
    return { ok: false as const, error: "Photo not found." };
  }

  const reaction = await prisma.galleryAssetReaction.upsert({
    where: {
      mediaAssetId_userId: {
        mediaAssetId: asset.id,
        userId
      }
    },
    update: {
      type: parsed.data.type
    },
    create: {
      mediaAssetId: asset.id,
      userId,
      type: parsed.data.type
    }
  });

  return { ok: true as const, reaction };
}

export async function reactToGalleryAssetComment(userId: string, input: unknown) {
  const parsed = reactToGalleryAssetCommentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid reaction." };
  }

  const comment = await prisma.galleryAssetComment.findFirst({
    where: {
      id: parsed.data.commentId,
      deletedAt: null
    },
    include: {
      mediaAsset: {
        select: {
          id: true,
          ownerUserId: true,
          visibility: true
        }
      }
    }
  });

  if (!comment || !canViewAsset(userId, comment.mediaAsset)) {
    return { ok: false as const, error: "Comment not found." };
  }

  const reaction = await prisma.galleryAssetCommentReaction.upsert({
    where: {
      commentId_userId: {
        commentId: comment.id,
        userId
      }
    },
    update: {
      type: parsed.data.type
    },
    create: {
      commentId: comment.id,
      userId,
      type: parsed.data.type
    }
  });

  return { ok: true as const, reaction };
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
