import {
  FeedReactionType,
  MediaAssetStatus,
  MediaCollectionType,
  MediaVisibility,
  Prisma,
  UploadIntentPurpose,
  UploadIntentStatus
} from "@prisma/client";
import { getR2PublicUrl, type R2ObjectAccess } from "@/lib/platform/r2";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  extractDeletePasswordFromBody,
  requireDeletePasswordValue
} from "@/lib/platform/delete-protection";
import { canAccessMedia, mediaAssetDeliveryPath } from "@/modules/media/media-authorization";
import {
  queueGalleryMediaDeletionWithinTransaction,
  SYSTEM_GALLERY_TAGS
} from "@/modules/gallery-media-storage/gallery-media-deletion.service";
import {
  moveGalleryVisibilityStorageObjects,
  type GalleryVisibilityStorageObject
} from "@/modules/gallery-media-storage/gallery-visibility-storage-move";
import {
  completeUploadIntent as verifyDurableUploadIntent,
  consumeVerifiedUploadIntent,
  createUploadIntent as createDurableUploadIntent
} from "@/modules/media/upload-intent.service";
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

function dateSlug(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

type UploadSource = "GALLERY" | "STREAM_POST" | "STREAM_REPLY" | "AD_CREATIVE" | "PROFILE_MEDIA" | "BUSINESS_MEDIA";

function sourceTags(source: UploadSource) {
  if (source === "STREAM_POST") return ["Stream Images", "Stream Post Images"];
  if (source === "STREAM_REPLY") return ["Stream Images", "Stream Reply Images"];
  if (source === "AD_CREATIVE") return ["Ad Images", "Ad Creative"];
  if (source === "PROFILE_MEDIA") return ["Profile Media"];
  if (source === "BUSINESS_MEDIA") return ["Business Media"];
  return [];
}

function purposeForSource(source: UploadSource) {
  if (source === "STREAM_POST") return UploadIntentPurpose.STREAM_POST;
  if (source === "STREAM_REPLY") return UploadIntentPurpose.STREAM_REPLY;
  if (source === "AD_CREATIVE") return UploadIntentPurpose.AD_CREATIVE;
  if (source === "PROFILE_MEDIA") return UploadIntentPurpose.PROFILE_MEDIA;
  if (source === "BUSINESS_MEDIA") return UploadIntentPurpose.BUSINESS_MEDIA;
  return UploadIntentPurpose.GALLERY;
}

function visibilityForSource(source: UploadSource, requestedVisibility: MediaVisibility) {
  return source === "STREAM_POST" || source === "STREAM_REPLY"
    ? MediaVisibility.PUBLIC
    : requestedVisibility;
}

class GalleryUploadCompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GalleryUploadCompletionError";
  }
}

type GalleryAssetMetadata = {
  caption?: string | null;
  commentsEnabled?: boolean;
  width?: number | null;
  height?: number | null;
  hiddenFromGalleryByDefault?: boolean;
  retentionPolicy?: { compressAfterDays: number; purgeUnviewedAfterDays: number } | null;
  source?: UploadSource;
  uploadIntentId?: string;
  thumbnailIntentId?: string | null;
  thumbnailStorageKey?: string | null;
  thumbnailUrl?: string | null;
};

function storageAccessForVisibility(visibility: MediaVisibility): R2ObjectAccess {
  return visibility === MediaVisibility.PUBLIC ? "public" : "private";
}

function publicUrlForVisibility(storageKey: string, visibility: MediaVisibility) {
  return visibility === MediaVisibility.PUBLIC ? getR2PublicUrl(storageKey) : null;
}

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

type GalleryAssetCommentBaseRecord = Prisma.GalleryAssetCommentGetPayload<{
  include: { author: { include: { profile: true } }; reactions: ReturnType<typeof galleryReactionInclude> };
}>;

interface GalleryAssetCommentRecord extends GalleryAssetCommentBaseRecord {
  replies?: GalleryAssetCommentRecord[];
  _count?: { replies: number };
}

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
    width: typeof metadata?.width === "number" ? metadata.width : null,
    height: typeof metadata?.height === "number" ? metadata.height : null,
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

function toGalleryAssetCommentView(comment: GalleryAssetCommentRecord): GalleryAssetCommentView {
  const reactionSummary = summarizeReactions(comment.reactions);

  return {
    id: comment.id,
    parentCommentId: comment.parentCommentId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: {
      id: comment.author.id,
      displayName: comment.author.profile?.displayName ?? comment.author.username,
      username: comment.author.username,
      avatarUrl: comment.author.profile?.avatarUrl
    },
    reactions: reactionSummary.counts,
    reactionReactors: reactionSummary.reactors,
    replyCount: comment._count?.replies ?? comment.replies?.length ?? 0,
    replies: comment.replies?.map(toGalleryAssetCommentView)
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

async function upsertCollection(
  ownerUserId: string,
  type: MediaCollectionType,
  name: string,
  database: Prisma.TransactionClient = prisma
) {
  const slug = slugify(name);

  return database.mediaCollection.upsert({
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

async function attachAssetToCollection(
  mediaAssetId: string,
  collectionId: string,
  database: Prisma.TransactionClient = prisma
) {
  await database.mediaCollectionAsset.upsert({
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

  const visibility = visibilityForSource(parsed.data.source, parsed.data.visibility);
  const result = await createDurableUploadIntent(userId, {
    purpose: purposeForSource(parsed.data.source),
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
    visibility,
    checksumSha256: parsed.data.checksumSha256
  });

  if (!result.ok) return result;

  return {
    ok: true as const,
    intentId: result.intent.id,
    intent: result.intent,
    uploadUrl: result.uploadUrl,
    uploadHeaders: result.uploadHeaders,
    storageKey: result.intent.storageKey,
    publicUrl:
      result.intent.visibility === MediaVisibility.PUBLIC ? getR2PublicUrl(result.intent.storageKey) : null,
    expiresInSeconds: result.expiresInSeconds
  };
}

async function findCompletedGalleryUpload(userId: string, intentId: string, storageKey: string) {
  const asset = await prisma.mediaAsset.findUnique({
    where: { storageKey },
    include: galleryAssetInclude()
  });
  const metadata = asset?.metadata as GalleryAssetMetadata | null | undefined;

  return asset && asset.ownerUserId === userId && metadata?.uploadIntentId === intentId
    ? toGalleryAssetView(asset)
    : null;
}

export async function completeGalleryUpload(userId: string, input: unknown) {
  const parsed = completeUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload completion." };
  }

  const purpose = purposeForSource(parsed.data.source);
  const visibility = visibilityForSource(parsed.data.source, parsed.data.visibility);
  const verification = await verifyDurableUploadIntent(userId, { intentId: parsed.data.intentId });

  if (!verification.ok) {
    if (verification.code === "ALREADY_USED") {
      const existing = await findCompletedGalleryUpload(userId, parsed.data.intentId, parsed.data.storageKey);
      if (existing) return { ok: true as const, asset: existing };
    }
    return verification;
  }

  if (
    verification.intent.purpose !== purpose ||
    verification.intent.storageKey !== parsed.data.storageKey ||
    verification.intent.mimeType !== parsed.data.mimeType ||
    verification.intent.sizeBytes !== String(parsed.data.sizeBytes) ||
    verification.intent.visibility !== visibility
  ) {
    return { ok: false as const, error: "Upload details did not match the original intent." };
  }

  if (parsed.data.thumbnailIntentId && parsed.data.thumbnailStorageKey) {
    const thumbnailVerification = await verifyDurableUploadIntent(userId, {
      intentId: parsed.data.thumbnailIntentId
    });

    if (!thumbnailVerification.ok) return thumbnailVerification;
    if (
      thumbnailVerification.intent.purpose !== purpose ||
      thumbnailVerification.intent.storageKey !== parsed.data.thumbnailStorageKey ||
      thumbnailVerification.intent.visibility !== visibility ||
      thumbnailVerification.intent.mimeType !== "image/jpeg"
    ) {
      return { ok: false as const, error: "Thumbnail details did not match the original intent." };
    }
  }

  let consumed;
  try {
    consumed = await consumeVerifiedUploadIntent({
      ownerUserId: userId,
      intentId: parsed.data.intentId,
      purpose,
      consume: async (transaction, intent) => {
        const now = new Date();
        const thumbnailIntent = parsed.data.thumbnailIntentId
          ? await transaction.uploadIntent.findUnique({ where: { id: parsed.data.thumbnailIntentId } })
          : null;

        if (
          parsed.data.thumbnailIntentId &&
          (!thumbnailIntent ||
            thumbnailIntent.ownerUserId !== userId ||
            thumbnailIntent.purpose !== purpose ||
            thumbnailIntent.status !== UploadIntentStatus.VERIFIED ||
            !thumbnailIntent.completedAt ||
            !thumbnailIntent.verifiedAt ||
            thumbnailIntent.expiresAt <= now ||
            thumbnailIntent.storageKey !== parsed.data.thumbnailStorageKey ||
            thumbnailIntent.visibility !== intent.visibility ||
            thumbnailIntent.declaredMimeType !== "image/jpeg")
        ) {
          throw new GalleryUploadCompletionError("Thumbnail intent is no longer available.");
        }

        const publiclyDeliverable = intent.visibility === MediaVisibility.PUBLIC;
        const thumbnailStorageKey = thumbnailIntent?.storageKey ?? null;
        const publicUrl = publiclyDeliverable ? getR2PublicUrl(intent.storageKey) : null;
        const thumbnailUrl = publiclyDeliverable && thumbnailStorageKey ? getR2PublicUrl(thumbnailStorageKey) : null;
        const systemSource = parsed.data.source !== "GALLERY";
        const asset = await transaction.mediaAsset.create({
          data: {
            ownerUserId: userId,
            storageKey: intent.storageKey,
            publicUrl,
            mimeType: intent.declaredMimeType,
            sizeBytes: intent.declaredSizeBytes,
            originalName: parsed.data.fileName,
            status: MediaAssetStatus.READY,
            visibility: intent.visibility,
            metadata: {
              caption: parsed.data.caption || null,
              commentsEnabled: intent.visibility !== MediaVisibility.PRIVATE && parsed.data.commentsEnabled,
              width: parsed.data.width ?? null,
              height: parsed.data.height ?? null,
              hiddenFromGalleryByDefault: systemSource,
              retentionPolicy: systemSource
                ? { compressAfterDays: 14, purgeUnviewedAfterDays: 14 }
                : null,
              source: parsed.data.source,
              uploadIntentId: intent.id,
              thumbnailIntentId: thumbnailIntent?.id ?? null,
              thumbnailStorageKey,
              thumbnailUrl
            }
          }
        });

        const systemDate = await upsertCollection(
          userId,
          MediaCollectionType.SYSTEM_DATE,
          dateSlug(asset.createdAt),
          transaction
        );
        await attachAssetToCollection(asset.id, systemDate.id, transaction);

        const tagNames = uniqueCleanTagNames([...sourceTags(parsed.data.source), ...parsed.data.tags]);
        for (const tagName of tagNames) {
          const tag = await upsertCollection(userId, MediaCollectionType.TAG, tagName, transaction);
          await attachAssetToCollection(asset.id, tag.id, transaction);
        }

        if (thumbnailIntent) {
          const used = await transaction.uploadIntent.updateMany({
            where: {
              id: thumbnailIntent.id,
              ownerUserId: userId,
              purpose,
              status: UploadIntentStatus.VERIFIED,
              expiresAt: { gt: now }
            },
            data: { status: UploadIntentStatus.USED, usedAt: now }
          });
          if (used.count !== 1) {
            throw new GalleryUploadCompletionError("Thumbnail intent changed while it was being used.");
          }
        }

        return { mediaAssetId: asset.id, storageKey: asset.storageKey };
      }
    });
  } catch (error) {
    if (error instanceof GalleryUploadCompletionError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }

  if (!consumed.ok) {
    if (consumed.code === "ALREADY_USED") {
      const existing = await findCompletedGalleryUpload(userId, parsed.data.intentId, parsed.data.storageKey);
      if (existing) return { ok: true as const, asset: existing };
    }
    return consumed;
  }

  const trackedAsset = await prisma.mediaAsset.findUnique({
    where: { id: consumed.value.mediaAssetId },
    include: galleryAssetInclude()
  });

  await diagnostics.info(MODULE_KEY, "Gallery upload completed.", {
    userId,
    intentId: parsed.data.intentId,
    mediaAssetId: consumed.value.mediaAssetId,
    storageKey: consumed.value.storageKey
  });

  return { ok: true as const, asset: trackedAsset ? toGalleryAssetView(trackedAsset) : null };
}

export async function listMyPics(userId: string, take = 24, options: { includeSystem?: boolean } = {}): Promise<GalleryAssetView[]> {
  const queryTake = options.includeSystem ? take : Math.max(take * 3, take);
  const assets = await withMediaDbTimeout(
    prisma.mediaAsset.findMany({
      where: {
        ownerUserId: userId,
        status: MediaAssetStatus.READY,
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
      status: MediaAssetStatus.READY,
      mimeType: {
        startsWith: "image/"
      }
    },
    include: galleryAssetInclude()
  });

  return asset ? toGalleryAssetView(asset) : null;
}

export async function getGalleryAssetViewer(viewerUserId: string, mediaAssetId: string): Promise<GalleryAssetViewer | null> {
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaAssetId,
      status: MediaAssetStatus.READY,
      mimeType: {
        startsWith: "image/"
      }
    },
    include: {
      ...galleryAssetInclude(),
      owner: {
        include: {
          profile: true
        }
      }
    }
  });

  if (!asset || !canViewAsset(viewerUserId, asset)) return null;

  const ownerVisibility =
    asset.ownerUserId === viewerUserId
      ? undefined
      : { in: [MediaVisibility.PUBLIC, MediaVisibility.MEMBERS] };

  const [previous, next, comments] = await Promise.all([
    prisma.mediaAsset.findFirst({
      where: {
        ownerUserId: asset.ownerUserId,
        status: MediaAssetStatus.READY,
        visibility: ownerVisibility,
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
        ownerUserId: asset.ownerUserId,
        status: MediaAssetStatus.READY,
        visibility: ownerVisibility,
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
        parentCommentId: null,
        deletedAt: null
      },
      include: {
        author: {
          include: {
            profile: true
          }
        },
        reactions: galleryReactionInclude(),
        replies: {
          where: {
            deletedAt: null
          },
          include: {
            author: {
              include: {
                profile: true
              }
            },
            reactions: galleryReactionInclude(),
            _count: {
              select: {
                replies: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          },
          take: 50
        },
        _count: {
          select: {
            replies: true
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
    owner: {
      id: asset.owner.id,
      displayName: asset.owner.profile?.displayName ?? asset.owner.username,
      username: asset.owner.username,
      avatarUrl: asset.owner.profile?.avatarUrl,
      bannerUrl: asset.owner.profile?.bannerUrl
    },
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

  let update;
  try {
    update = await prisma.$transaction(
      (transaction) => updateGalleryAssetSettingsWithinTransaction(transaction, userId, parsed.data),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 60_000
      }
    );
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Gallery visibility transaction failed.", {
      userId,
      mediaAssetId: parsed.data.mediaAssetId,
      toVisibility: parsed.data.visibility,
      error: error instanceof Error ? error.message : "unknown"
    });
    return {
      ok: false as const,
      code: "GALLERY_VISIBILITY_SAVE_FAILED" as const,
      retryable: true as const,
      state: "DATABASE_UPDATE_FAILED" as const,
      error: "Could not save that photo visibility. Try again."
    };
  }

  if (update.kind === "NOT_FOUND") {
    return { ok: false as const, error: "Photo not found." };
  }
  if (update.kind === "STORAGE_MOVE_INCOMPLETE") {
    await diagnostics.error(MODULE_KEY, "Gallery visibility storage move failed.", {
      userId,
      mediaAssetId: parsed.data.mediaAssetId,
      fromVisibility: update.fromVisibility,
      toVisibility: parsed.data.visibility,
      storageKeys: update.storageKeys,
      storageMoveCode: update.storageMove.code,
      storageMoveProgress: update.storageMove.progress,
      error: update.storageMove.error
    });
    return {
      ok: false as const,
      code: update.storageMove.code,
      retryable: update.storageMove.retryable,
      state: "STORAGE_MOVE_INCOMPLETE" as const,
      error: "The photo storage move is incomplete. Its visibility was not changed. Try again to finish."
    };
  }
  if (update.kind === "NO_LONGER_READY") {
    return {
      ok: false as const,
      code: "GALLERY_ASSET_NO_LONGER_READY" as const,
      retryable: false as const,
      error: "That photo is no longer available for changes."
    };
  }
  if (update.kind === "SAVE_FAILED") {
    await diagnostics.error(MODULE_KEY, "Gallery visibility database update failed.", {
      userId,
      mediaAssetId: parsed.data.mediaAssetId,
      fromVisibility: update.fromVisibility,
      toVisibility: parsed.data.visibility,
      storageTransitionComplete: update.movedStorage,
      error: update.error
    });
    return update.movedStorage
      ? {
          ok: false as const,
          code: "GALLERY_VISIBILITY_SAVE_PENDING" as const,
          retryable: true as const,
          state: "STORAGE_MOVED_DATABASE_PENDING" as const,
          error: "The photo moved, but its visibility change was not saved. Try again to finish."
        }
      : {
          ok: false as const,
          code: "GALLERY_VISIBILITY_SAVE_FAILED" as const,
          retryable: true as const,
          state: "DATABASE_UPDATE_FAILED" as const,
          error: "Could not save that photo visibility. Try again."
        };
  }

  await diagnostics.info(MODULE_KEY, "Gallery asset visibility updated.", {
    userId,
    mediaAssetId: update.mediaAssetId,
    fromVisibility: update.fromVisibility,
    toVisibility: parsed.data.visibility,
    movedStorage: update.movedStorage
  });

  return { ok: true as const };
}

export async function updateGalleryAssetSettingsWithinTransaction(
  transaction: Prisma.TransactionClient,
  userId: string,
  input: { mediaAssetId: string; visibility: MediaVisibility; commentsEnabled: boolean },
  storageMover: typeof moveGalleryVisibilityStorageObjects = moveGalleryVisibilityStorageObjects
) {
  const lockedUsers = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `);
  if (lockedUsers.length === 0) return { kind: "NOT_FOUND" as const };

  const lockedAssets = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "MediaAsset"
    WHERE "id" = ${input.mediaAssetId}
      AND "ownerUserId" = ${userId}
    FOR UPDATE
  `);
  if (lockedAssets.length === 0) return { kind: "NOT_FOUND" as const };

  const asset = await transaction.mediaAsset.findFirst({
    where: {
      id: input.mediaAssetId,
      ownerUserId: userId,
      status: MediaAssetStatus.READY,
      mimeType: {
        startsWith: "image/",
        mode: "insensitive"
      }
    }
  });

  if (!asset) return { kind: "NOT_FOUND" as const };

  const metadata = (asset.metadata as GalleryAssetMetadata | null) ?? {};
  const commentsEnabled = input.visibility !== MediaVisibility.PRIVATE && input.commentsEnabled;
  const fromAccess = storageAccessForVisibility(asset.visibility);
  const toAccess = storageAccessForVisibility(input.visibility);
  const storageObjects: GalleryVisibilityStorageObject[] = [
    {
      storageKey: asset.storageKey,
      label: "photo",
      expectedSizeBytes: Number(asset.sizeBytes),
      expectedMimeType: asset.mimeType
    },
    ...(metadata.thumbnailStorageKey
      ? [{ storageKey: metadata.thumbnailStorageKey, label: "photo thumbnail", expectedMimeType: "image/jpeg" }]
      : [])
  ];

  if (fromAccess !== toAccess) {
    const storageMove = await storageMover({
      objects: storageObjects,
      sourceAccess: fromAccess,
      destinationAccess: toAccess
    });

    if (!storageMove.ok) {
      return {
        kind: "STORAGE_MOVE_INCOMPLETE" as const,
        fromVisibility: asset.visibility,
        storageKeys: storageObjects.map((object) => object.storageKey),
        storageMove
      };
    }
  }

  const nextMetadata: GalleryAssetMetadata = {
    ...metadata,
    commentsEnabled,
    thumbnailUrl: metadata.thumbnailStorageKey ? publicUrlForVisibility(metadata.thumbnailStorageKey, input.visibility) : null
  };

  try {
    const saved = await transaction.mediaAsset.updateMany({
      where: {
        id: asset.id,
        ownerUserId: userId,
        status: MediaAssetStatus.READY
      },
      data: {
        visibility: input.visibility,
        publicUrl: publicUrlForVisibility(asset.storageKey, input.visibility),
        metadata: nextMetadata
      }
    });
    if (saved.count !== 1) {
      return { kind: "NO_LONGER_READY" as const };
    }
  } catch (error) {
    return {
      kind: "SAVE_FAILED" as const,
      fromVisibility: asset.visibility,
      movedStorage: fromAccess !== toAccess,
      error: error instanceof Error ? error.message : "unknown"
    };
  }

  return {
    kind: "UPDATED" as const,
    mediaAssetId: asset.id,
    fromVisibility: asset.visibility,
    movedStorage: fromAccess !== toAccess
  };
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
      status: MediaAssetStatus.READY,
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
      },
      status: MediaAssetStatus.READY
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
  const deletePasswordError = requireDeletePasswordValue(extractDeletePasswordFromBody(input));
  if (deletePasswordError) {
    return {
      ok: false as const,
      error: deletePasswordError.message,
      code: deletePasswordError.code,
      field: deletePasswordError.field
    };
  }

  const parsed = deleteGalleryAssetsSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid gallery delete request." };
  }

  const deletion = await prisma.$transaction(
    (transaction) => queueGalleryMediaDeletionWithinTransaction(transaction, userId, parsed.data.mediaAssetIds),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  if (deletion.kind === "ASSETS_NOT_FOUND") {
    return { ok: false as const, error: "One or more selected photos were not found." };
  }
  if (deletion.kind === "PROTECTED") {
    return { ok: false as const, error: "System-managed pictures cannot be deleted from My Pics." };
  }
  if (deletion.kind === "IN_USE") {
    return {
      ok: false as const,
      error: `One or more selected photos are still in use by: ${deletion.inUseCategories.join(", ")}.`,
      inUseCategories: deletion.inUseCategories
    };
  }
  if (deletion.kind === "RECOVERY_INVALID") {
    return { ok: false as const, error: deletion.error };
  }
  if (
    deletion.kind === "ALREADY_REQUESTED" &&
    (deletion.status === "FAILED" || deletion.status === "CANCELLED")
  ) {
    return { ok: false as const, error: `The existing media deletion request is ${deletion.status.toLowerCase()}.` };
  }
  const completed = deletion.kind === "ALREADY_REQUESTED" && deletion.status === "SUCCEEDED";

  await diagnostics.info(MODULE_KEY, "Gallery asset deletion queued.", {
    userId,
    mediaAssetIds: deletion.mediaAssetIds,
    destructiveActionRequestId: deletion.requestId,
    platformJobId: deletion.jobId,
    replayed: deletion.kind === "ALREADY_REQUESTED"
  });

  return {
    ok: true as const,
    queued: !completed,
    completed,
    replayed: deletion.kind === "ALREADY_REQUESTED",
    destructiveActionRequestId: deletion.requestId,
    platformJobId: deletion.jobId,
    queuedMediaAssetIds: deletion.mediaAssetIds,
    deletedCount: 0,
    deletedMediaAssetIds: [] as string[]
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
      status: MediaAssetStatus.READY,
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

  let parentCommentId: string | null = null;

  if (parsed.data.parentCommentId) {
    const parent = await prisma.galleryAssetComment.findFirst({
      where: {
        id: parsed.data.parentCommentId,
        mediaAssetId: asset.id,
        deletedAt: null
      },
      select: {
        id: true,
        authorUserId: true,
        parentCommentId: true
      }
    });

    if (!parent) {
      return { ok: false as const, error: "The comment you are replying to is not available." };
    }

    parentCommentId = parent.parentCommentId ?? parent.id;
  }

  const comment = await prisma.galleryAssetComment.create({
    data: {
      mediaAssetId: asset.id,
      authorUserId: userId,
      parentCommentId,
      body: parsed.data.body
    },
    include: {
      author: {
        include: {
          profile: true
        }
      },
      reactions: galleryReactionInclude(),
      _count: {
        select: {
          replies: true
        }
      }
    }
  });

  if (asset.ownerUserId !== userId) {
    await prisma.notification.create({
      data: {
        userId: asset.ownerUserId,
        title: parentCommentId ? "New photo reply" : "New photo comment",
        body: parentCommentId ? "Someone replied in a photo thread." : "Someone commented on one of your photos.",
        href: `/profile/gallery/${asset.id}#comment-${comment.id}`
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
      status: MediaAssetStatus.READY,
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

  const existing = await prisma.galleryAssetReaction.findUnique({
    where: {
      mediaAssetId_userId: {
        mediaAssetId: asset.id,
        userId
      }
    }
  });

  if (existing?.type === parsed.data.type) {
    await prisma.galleryAssetReaction.delete({ where: { id: existing.id } });
    return { ok: true as const, reaction: null, removed: true as const };
  }

  const reaction = await prisma.galleryAssetReaction.upsert({
    where: { mediaAssetId_userId: { mediaAssetId: asset.id, userId } },
    update: {
      type: parsed.data.type
    },
    create: {
      mediaAssetId: asset.id,
      userId,
      type: parsed.data.type
    }
  });

  return { ok: true as const, reaction, removed: false as const };
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
          visibility: true,
          status: true
        }
      }
    }
  });

  if (
    !comment ||
    comment.mediaAsset.status !== MediaAssetStatus.READY ||
    !canViewAsset(userId, comment.mediaAsset)
  ) {
    return { ok: false as const, error: "Comment not found." };
  }

  const existing = await prisma.galleryAssetCommentReaction.findUnique({
    where: {
      commentId_userId: {
        commentId: comment.id,
        userId
      }
    }
  });

  if (existing?.type === parsed.data.type) {
    await prisma.galleryAssetCommentReaction.delete({ where: { id: existing.id } });
    return { ok: true as const, reaction: null, removed: true as const };
  }

  const reaction = await prisma.galleryAssetCommentReaction.upsert({
    where: { commentId_userId: { commentId: comment.id, userId } },
    update: {
      type: parsed.data.type
    },
    create: {
      commentId: comment.id,
      userId,
      type: parsed.data.type
    }
  });

  return { ok: true as const, reaction, removed: false as const };
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
