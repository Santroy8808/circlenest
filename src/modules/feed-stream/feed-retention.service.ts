import { FeedVisibility, MediaVisibility, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import {
  AccountDeletionFenceConflictError,
  assertAccountDeletionFenceOpen
} from "@/lib/platform/account-deletion-fence";
import { findAuditLogByOperationId, writeAuditLog } from "@/lib/platform/audit";
import { createCommandFingerprint, isMatchingCommandFingerprint } from "@/lib/platform/command-fingerprint";
import { prisma } from "@/lib/platform/db";
import { withMediaAssetReferenceValidation } from "@/lib/platform/media-asset-reference-fence";
import { getR2Object, getR2PublicUrl, putR2Object, type R2ObjectAccess } from "@/lib/platform/r2";
import { isAdminRole } from "@/lib/platform/roles";
import {
  assertFeedChildWriteAllowed,
  assertNewFeedPostWriteAllowed,
  lockFeedPostForWrite
} from "@/modules/feed-stream/feed-write-fence";
import { publicStreamVisibilityFilter } from "@/modules/feed-stream/feed-visibility";

const MODULE_KEY = "feed-retention";
const STREAM_COMPRESSION_MIME_TYPE = "image/webp";
const STREAM_COMPRESSION_MAX_EDGE_PX = 1600;
const STREAM_COMPRESSION_QUALITY = 76;
const STREAM_COMPRESSION_MIN_SAVINGS_RATIO = 0.06;
const STREAM_COMPRESSION_BATCH_LIMIT = 50;
const COMPRESSIBLE_STREAM_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const feedThreadDeletionFenceSelect = {
  authorUserId: true,
  targetProfileUserId: true,
  mediaAsset: {
    select: {
      ownerUserId: true,
      hashtags: { select: { taggedByUserId: true } }
    }
  },
  reactions: { select: { userId: true } },
  dismissals: { select: { userId: true } },
  hashtags: { select: { taggedByUserId: true } },
  comments: {
    select: {
      authorUserId: true,
      mediaAsset: {
        select: {
          ownerUserId: true,
          hashtags: { select: { taggedByUserId: true } }
        }
      },
      reactions: { select: { userId: true } },
      hashtags: { select: { taggedByUserId: true } }
    }
  }
} satisfies Prisma.FeedPostSelect;

type FeedThreadDeletionFenceTarget = Prisma.FeedPostGetPayload<{
  select: typeof feedThreadDeletionFenceSelect;
}>;

export function feedThreadDeletionFenceUserIds(post: FeedThreadDeletionFenceTarget) {
  return [...new Set([
    post.authorUserId,
    post.targetProfileUserId,
    post.mediaAsset?.ownerUserId,
    ...(post.mediaAsset?.hashtags.map((hashtag) => hashtag.taggedByUserId) ?? []),
    ...post.reactions.map((reaction) => reaction.userId),
    ...post.dismissals.map((dismissal) => dismissal.userId),
    ...post.hashtags.map((hashtag) => hashtag.taggedByUserId),
    ...post.comments.flatMap((comment) => [
      comment.authorUserId,
      comment.mediaAsset?.ownerUserId,
      ...(comment.mediaAsset?.hashtags.map((hashtag) => hashtag.taggedByUserId) ?? []),
      ...comment.reactions.map((reaction) => reaction.userId),
      ...comment.hashtags.map((hashtag) => hashtag.taggedByUserId)
    ])
  ].filter((userId): userId is string => Boolean(userId)))].sort();
}

export const FREE_TIER_PERSONAL_STORAGE_BYTES = 200 * 1024 * 1024;

export const streamRetentionPolicy = {
  compressionAfterUnviewedHours: 48,
  archiveAfterDays: 7,
  deleteAfterDays: 90,
  note:
    "Public stream posts are subject to compression after 48 hours without a view, archive after 1 week, and permanent thread deletion after 3 months unless an admin hold is present. Limits are subject to change."
} as const;

const holdSchema = z.object({
  commandId: z.string().trim().min(8).max(200).optional(),
  postId: z.string().trim().min(1),
  reason: z.string().trim().min(5).max(1000),
  holdThread: z.boolean().default(true)
});

const postIdSchema = z.object({
  postId: z.string().trim().min(1)
});

const releaseHoldSchema = postIdSchema.extend({
  commandId: z.string().trim().min(8).max(200).optional()
});

const booleanQueryParam = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }, z.boolean().default(defaultValue));

const searchSchema = z.object({
  query: z.string().trim().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  includeArchived: booleanQueryParam(true),
  includeDeleted: booleanQueryParam(true),
  heldOnly: booleanQueryParam(false)
});

const importedThreadSchema = z.object({
  exportedAt: z.string(),
  source: z.literal("theta-space.feed-thread.v1"),
  post: z.record(z.unknown()),
  comments: z.array(z.record(z.unknown())).default([]),
  postReactions: z.array(z.record(z.unknown())).default([]),
  commentReactions: z.array(z.record(z.unknown())).default([]),
  postHashtags: z.array(z.record(z.unknown())).default([]),
  commentHashtags: z.array(z.record(z.unknown())).default([])
});

type AdminFeedPostSearchResult = {
  id: string;
  bodyPreview: string;
  author: string;
  authorUsername: string;
  createdAt: string;
  visibility: FeedVisibility;
  mediaAssetId: string | null;
  streamCompressedAt: string | null;
  streamArchivedAt: string | null;
  streamDeletedAt: string | null;
  adminHoldAt: string | null;
  adminHoldReason: string | null;
  adminHoldThread: boolean;
};

type StreamCompressionCandidate = Prisma.FeedPostGetPayload<{
  include: {
    mediaAsset: {
      select: {
        id: true;
        storageKey: true;
        mimeType: true;
        sizeBytes: true;
        visibility: true;
        metadata: true;
      };
    };
  };
}>;

async function requireAdmin(actorUserId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { role: true }
  });

  return isAdminRole(actor?.role) ? { ok: true as const } : { ok: false as const, error: "Admin access required." };
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(now: Date, hours: number) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function publicStreamWhere(extra: Prisma.FeedPostWhereInput = {}): Prisma.FeedPostWhereInput {
  return {
    ...extra,
    visibility: publicStreamVisibilityFilter(),
    targetProfileUserId: null,
    isAdminAnnouncement: false
  };
}

function bodyPreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized || "(media-only post)";
}

function mediaAccessForVisibility(visibility: MediaVisibility): R2ObjectAccess {
  return visibility === MediaVisibility.PUBLIC ? "public" : "private";
}

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function r2ObjectBodyToBuffer(body: unknown) {
  const transformer = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof transformer?.transformToByteArray === "function") {
    return Buffer.from(await transformer.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function compressStreamMedia(post: StreamCompressionCandidate) {
  const mediaAsset = post.mediaAsset;
  if (!mediaAsset) return { ok: false as const, reason: "missing-media-asset" };

  const normalizedMimeType = mediaAsset.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!COMPRESSIBLE_STREAM_MIME_TYPES.has(normalizedMimeType)) {
    return { ok: false as const, reason: "unsupported-mime-type" };
  }

  const access = mediaAccessForVisibility(mediaAsset.visibility);
  const object = await getR2Object(mediaAsset.storageKey, access);
  const originalBytes = await r2ObjectBodyToBuffer(object.Body);
  if (originalBytes.length === 0) return { ok: false as const, reason: "empty-object" };

  const compressedBytes = await sharp(originalBytes, { animated: false })
    .rotate()
    .resize({
      width: STREAM_COMPRESSION_MAX_EDGE_PX,
      height: STREAM_COMPRESSION_MAX_EDGE_PX,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: STREAM_COMPRESSION_QUALITY, effort: 4 })
    .toBuffer();

  const savingsRatio = 1 - compressedBytes.length / originalBytes.length;
  if (savingsRatio < STREAM_COMPRESSION_MIN_SAVINGS_RATIO) {
    return {
      ok: false as const,
      reason: "insufficient-savings",
      originalSizeBytes: originalBytes.length,
      compressedSizeBytes: compressedBytes.length
    };
  }

  await putR2Object({
    storageKey: mediaAsset.storageKey,
    body: compressedBytes,
    mimeType: STREAM_COMPRESSION_MIME_TYPE,
    access,
    metadata: {
      "theta-compressed": "true",
      "theta-compressed-at": new Date().toISOString(),
      "theta-original-mime": normalizedMimeType,
      "theta-original-size": String(originalBytes.length)
    }
  });

  const existingMetadata = isJsonObject(mediaAsset.metadata) ? mediaAsset.metadata : {};
  await prisma.mediaAsset.update({
    where: { id: mediaAsset.id },
    data: {
      mimeType: STREAM_COMPRESSION_MIME_TYPE,
      sizeBytes: BigInt(compressedBytes.length),
      publicUrl: mediaAsset.visibility === MediaVisibility.PUBLIC ? getR2PublicUrl(mediaAsset.storageKey) : null,
      metadata: {
        ...existingMetadata,
        streamRetentionCompression: {
          compressedAt: new Date().toISOString(),
          originalMimeType: normalizedMimeType,
          originalSizeBytes: originalBytes.length,
          compressedMimeType: STREAM_COMPRESSION_MIME_TYPE,
          compressedSizeBytes: compressedBytes.length,
          quality: STREAM_COMPRESSION_QUALITY,
          maxEdgePx: STREAM_COMPRESSION_MAX_EDGE_PX
        }
      }
    }
  });

  return {
    ok: true as const,
    originalSizeBytes: originalBytes.length,
    compressedSizeBytes: compressedBytes.length
  };
}

export async function markFeedPostsViewed(postIds: string[]) {
  const uniqueIds = [...new Set(postIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  await prisma.feedPost.updateMany({
    where: {
      id: { in: uniqueIds },
      streamDeletedAt: null
    },
    data: { lastViewedAt: new Date() }
  });
}

export async function applyPublicStreamRetentionPolicy(actorUserId?: string) {
  if (actorUserId) {
    const admin = await requireAdmin(actorUserId);
    if (!admin.ok) return admin;
  }

  const now = new Date();
  const compressionCutoff = hoursAgo(now, streamRetentionPolicy.compressionAfterUnviewedHours);
  const archiveCutoff = daysAgo(now, streamRetentionPolicy.archiveAfterDays);
  const deleteCutoff = daysAgo(now, streamRetentionPolicy.deleteAfterDays);

  const compressionCandidates = await prisma.feedPost.findMany({
    where: publicStreamWhere({
      mediaAssetId: { not: null },
      streamCompressedAt: null,
      streamArchivedAt: null,
      streamDeletedAt: null,
      adminHoldAt: null,
      OR: [
        { lastViewedAt: null, createdAt: { lte: compressionCutoff } },
        { lastViewedAt: { lte: compressionCutoff } }
      ]
    }),
    include: {
      mediaAsset: {
        select: {
          id: true,
          storageKey: true,
          mimeType: true,
          sizeBytes: true,
          visibility: true,
          metadata: true
        }
      }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: STREAM_COMPRESSION_BATCH_LIMIT
  });

  let compressedCount = 0;
  let compressionSkippedCount = 0;
  let compressionFailedCount = 0;

  for (const post of compressionCandidates) {
    try {
      const result = await compressStreamMedia(post);
      if (result.ok) {
        compressedCount += 1;
      } else {
        compressionSkippedCount += 1;
      }
      await prisma.feedPost.update({
        where: { id: post.id },
        data: { streamCompressedAt: now }
      });
    } catch (error) {
      compressionFailedCount += 1;
      await writeAuditLog({
        actorUserId,
        module: MODULE_KEY,
        action: "stream.compression_failed",
        targetType: "FeedPost",
        targetId: post.id,
        severity: "warning",
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  const archived = await prisma.feedPost.updateMany({
    where: publicStreamWhere({
      streamArchivedAt: null,
      streamDeletedAt: null,
      adminHoldAt: null,
      createdAt: { lte: archiveCutoff }
    }),
    data: { streamArchivedAt: now }
  });

  const deleted = await prisma.feedPost.updateMany({
    where: publicStreamWhere({
      adminHoldAt: null,
      createdAt: { lte: deleteCutoff }
    }),
    data: { streamDeletedAt: now }
  });

  const permanentlyDeleted = await prisma.feedPost.deleteMany({
    where: publicStreamWhere({
      adminHoldAt: null,
      createdAt: { lte: deleteCutoff }
    })
  });

  if (
    actorUserId ||
    compressedCount > 0 ||
    compressionSkippedCount > 0 ||
    compressionFailedCount > 0 ||
    archived.count > 0 ||
    deleted.count > 0 ||
    permanentlyDeleted.count > 0
  ) {
    await writeAuditLog({
      actorUserId,
      module: MODULE_KEY,
      action: "stream.retention_applied",
      targetType: "FeedPost",
      severity: "warning",
      metadata: {
        compressedCount,
        compressionSkippedCount,
        compressionFailedCount,
        archivedCount: archived.count,
        deletedCount: deleted.count,
        permanentlyDeletedCount: permanentlyDeleted.count,
        policy: streamRetentionPolicy
      }
    });
  }

  return {
    ok: true as const,
    compressedCount,
    compressionSkippedCount,
    compressionFailedCount,
    archivedCount: archived.count,
    deletedCount: deleted.count,
    permanentlyDeletedCount: permanentlyDeleted.count
  };
}

export async function searchAdminFeedThreads(actorUserId: string, input: unknown) {
  const admin = await requireAdmin(actorUserId);
  if (!admin.ok) return admin;

  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid search." };
  }

  const query = parsed.data.query;
  const where: Prisma.FeedPostWhereInput = {
    ...(parsed.data.heldOnly ? { adminHoldAt: { not: null } } : {}),
    ...(parsed.data.includeArchived ? {} : { streamArchivedAt: null }),
    ...(parsed.data.includeDeleted ? {} : { streamDeletedAt: null }),
    ...(query
      ? {
          OR: [
            { id: query },
            { body: { contains: query, mode: "insensitive" } },
            { author: { is: { username: { contains: query.replace(/^@/, ""), mode: "insensitive" } } } },
            { author: { is: { email: { contains: query, mode: "insensitive" } } } },
            { author: { is: { profile: { is: { displayName: { contains: query, mode: "insensitive" } } } } } }
          ]
        }
      : {})
  };

  const posts = await prisma.feedPost.findMany({
    where,
    include: {
      author: {
        include: { profile: true }
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: parsed.data.limit
  });

  const results: AdminFeedPostSearchResult[] = posts.map((post) => ({
    id: post.id,
    bodyPreview: bodyPreview(post.body),
    author: post.author.profile?.displayName ?? post.author.username,
    authorUsername: post.author.username,
    createdAt: post.createdAt.toISOString(),
    visibility: post.visibility,
    mediaAssetId: post.mediaAssetId,
    streamCompressedAt: post.streamCompressedAt?.toISOString() ?? null,
    streamArchivedAt: post.streamArchivedAt?.toISOString() ?? null,
    streamDeletedAt: post.streamDeletedAt?.toISOString() ?? null,
    adminHoldAt: post.adminHoldAt?.toISOString() ?? null,
    adminHoldReason: post.adminHoldReason,
    adminHoldThread: post.adminHoldThread
  }));

  return { ok: true as const, results };
}

export async function holdFeedThread(actorUserId: string, input: unknown) {
  const admin = await requireAdmin(actorUserId);
  if (!admin.ok) return admin;

  const parsed = holdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid hold request." };
  }

  const commandId = parsed.data.commandId ?? randomUUID();
  const action = "stream.post_held";
  const target = { type: "FeedPost", id: parsed.data.postId };
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action,
    target,
    payload: { reason: parsed.data.reason, holdThread: parsed.data.holdThread }
  });
  const replay = await findAuditLogByOperationId(commandId);
  if (replay) {
    return isMatchingCommandFingerprint(replay, { actorUserId, action, target, fingerprint: commandFingerprint })
      ? { ok: true as const, replayed: true as const }
      : { ok: false as const, error: "That administrator command id has already been used." };
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const lockedPost = await lockFeedPostForWrite(tx, parsed.data.postId);
      if (!lockedPost) return false;
      const current = await tx.feedPost.findUnique({
        where: { id: parsed.data.postId },
        select: {
          ...feedThreadDeletionFenceSelect,
          adminHoldAt: true,
          adminHoldByUserId: true,
          adminHoldReason: true,
          adminHoldThread: true
        }
      });
      if (!current) return false;
      await assertAccountDeletionFenceOpen(
        tx,
        feedThreadDeletionFenceUserIds(current),
        "This feed thread is linked to an account already queued for deletion. Place the hold before confirming account deletion."
      );
      const now = new Date();
      await tx.feedPost.update({
        where: { id: parsed.data.postId },
        data: {
          adminHoldAt: now,
          adminHoldByUserId: actorUserId,
          adminHoldReason: parsed.data.reason,
          adminHoldThread: parsed.data.holdThread
        }
      });

      await writeAuditLog({
        operationId: commandId,
        actorUserId,
        module: MODULE_KEY,
        action,
        targetType: target.type,
        targetId: target.id,
        severity: "critical",
        before: {
          adminHoldAt: current.adminHoldAt?.toISOString() ?? null,
          adminHoldByUserId: current.adminHoldByUserId,
          adminHoldReason: current.adminHoldReason,
          adminHoldThread: current.adminHoldThread
        },
        after: {
          adminHoldAt: now.toISOString(),
          adminHoldByUserId: actorUserId,
          adminHoldReason: parsed.data.reason,
          adminHoldThread: parsed.data.holdThread
        },
        metadata: { commandFingerprint, reason: parsed.data.reason, holdThread: parsed.data.holdThread }
      }, tx);
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!updated) return { ok: false as const, error: "Post was not found." };
  } catch (error) {
    if (error instanceof AccountDeletionFenceConflictError) {
      return { ok: false as const, error: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentReplay = await findAuditLogByOperationId(commandId);
      if (concurrentReplay) {
        return isMatchingCommandFingerprint(concurrentReplay, { actorUserId, action, target, fingerprint: commandFingerprint })
          ? { ok: true as const, replayed: true as const }
          : { ok: false as const, error: "That administrator command id has already been used." };
      }
    }
    throw error;
  }

  return { ok: true as const, replayed: false as const };
}

export async function releaseFeedThreadHold(actorUserId: string, input: unknown) {
  const admin = await requireAdmin(actorUserId);
  if (!admin.ok) return admin;

  const parsed = releaseHoldSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid post id." };
  }

  const commandId = parsed.data.commandId ?? randomUUID();
  const action = "stream.post_hold_released";
  const target = { type: "FeedPost", id: parsed.data.postId };
  const commandFingerprint = createCommandFingerprint({ actorUserId, action, target, payload: {} });
  const replay = await findAuditLogByOperationId(commandId);
  if (replay) {
    return isMatchingCommandFingerprint(replay, { actorUserId, action, target, fingerprint: commandFingerprint })
      ? { ok: true as const, replayed: true as const }
      : { ok: false as const, error: "That administrator command id has already been used." };
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const lockedPost = await lockFeedPostForWrite(tx, parsed.data.postId);
      if (!lockedPost) return false;
      const current = await tx.feedPost.findUnique({
        where: { id: parsed.data.postId },
        select: {
          ...feedThreadDeletionFenceSelect,
          adminHoldAt: true,
          adminHoldByUserId: true,
          adminHoldReason: true,
          adminHoldThread: true
        }
      });
      if (!current) return false;
      await assertAccountDeletionFenceOpen(
        tx,
        feedThreadDeletionFenceUserIds(current),
        "This feed thread is linked to an account already queued for deletion. Release the hold before confirming account deletion."
      );
      await tx.feedPost.update({
        where: { id: parsed.data.postId },
        data: {
          adminHoldAt: null,
          adminHoldByUserId: null,
          adminHoldReason: null,
          adminHoldThread: true
        }
      });
      await writeAuditLog({
        operationId: commandId,
        actorUserId,
        module: MODULE_KEY,
        action,
        targetType: target.type,
        targetId: target.id,
        severity: "warning",
        before: {
          adminHoldAt: current.adminHoldAt?.toISOString() ?? null,
          adminHoldByUserId: current.adminHoldByUserId,
          adminHoldReason: current.adminHoldReason,
          adminHoldThread: current.adminHoldThread
        },
        after: { adminHoldAt: null, adminHoldByUserId: null, adminHoldReason: null, adminHoldThread: true },
        metadata: { commandFingerprint }
      }, tx);
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!updated) return { ok: false as const, error: "Post was not found." };
  } catch (error) {
    if (error instanceof AccountDeletionFenceConflictError) {
      return { ok: false as const, error: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentReplay = await findAuditLogByOperationId(commandId);
      if (concurrentReplay) {
        return isMatchingCommandFingerprint(concurrentReplay, { actorUserId, action, target, fingerprint: commandFingerprint })
          ? { ok: true as const, replayed: true as const }
          : { ok: false as const, error: "That administrator command id has already been used." };
      }
    }
    throw error;
  }

  return { ok: true as const, replayed: false as const };
}

export async function exportFeedThread(actorUserId: string, input: unknown) {
  const admin = await requireAdmin(actorUserId);
  if (!admin.ok) return admin;

  const parsed = postIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid post id." };
  }

  const [post, comments, postReactions, commentReactions, postHashtags, commentHashtags] = await Promise.all([
    prisma.feedPost.findUnique({ where: { id: parsed.data.postId } }),
    prisma.feedComment.findMany({ where: { postId: parsed.data.postId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.feedPostReaction.findMany({ where: { postId: parsed.data.postId } }),
    prisma.feedCommentReaction.findMany({ where: { comment: { is: { postId: parsed.data.postId } } } }),
    prisma.feedPostHashtag.findMany({ where: { postId: parsed.data.postId } }),
    prisma.feedCommentHashtag.findMany({ where: { comment: { is: { postId: parsed.data.postId } } } })
  ]);

  if (!post) {
    return { ok: false as const, error: "Post was not found." };
  }

  const exported = {
    source: "theta-space.feed-thread.v1" as const,
    exportedAt: new Date().toISOString(),
    policy: streamRetentionPolicy,
    post,
    comments,
    postReactions,
    commentReactions,
    postHashtags,
    commentHashtags
  };

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "stream.thread_exported",
    targetType: "FeedPost",
    targetId: parsed.data.postId,
    severity: "warning",
    metadata: {
      commentCount: comments.length,
      postReactionCount: postReactions.length,
      commentReactionCount: commentReactions.length
    }
  });

  return { ok: true as const, thread: exported };
}

export async function importFeedThread(actorUserId: string, input: unknown) {
  const admin = await requireAdmin(actorUserId);
  if (!admin.ok) return admin;

  const parsed = importedThreadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid import payload." };
  }

  const post = parsed.data.post as Prisma.FeedPostUncheckedCreateInput;
  if (!post.id) return { ok: false as const, error: "Import payload is missing the post id." };
  const importedPostId = String(post.id);
  const importedCommentIds = new Set(parsed.data.comments.map((comment) => String(comment.id ?? "")));
  const hasCrossThreadChild =
    parsed.data.comments.some((comment) => String(comment.postId ?? "") !== importedPostId) ||
    parsed.data.postReactions.some((reaction) => String(reaction.postId ?? "") !== importedPostId) ||
    parsed.data.postHashtags.some((hashtag) => String(hashtag.postId ?? "") !== importedPostId) ||
    parsed.data.commentReactions.some((reaction) => !importedCommentIds.has(String(reaction.commentId ?? ""))) ||
    parsed.data.commentHashtags.some((hashtag) => !importedCommentIds.has(String(hashtag.commentId ?? ""))) ||
    parsed.data.comments.some((comment) =>
      Boolean(comment.parentCommentId) && !importedCommentIds.has(String(comment.parentCommentId))
    );
  if (hasCrossThreadChild) {
    return { ok: false as const, error: "Import payload contains child records from another feed thread." };
  }

  const existing = await prisma.feedPost.findUnique({ where: { id: importedPostId }, select: { id: true } });
  if (existing) {
    return { ok: false as const, error: "A post with that id already exists." };
  }

  const referencedUserIds = [
    actorUserId,
    post.authorUserId,
    post.targetProfileUserId,
    ...parsed.data.comments.map((comment) => comment.authorUserId),
    ...parsed.data.postReactions.map((reaction) => reaction.userId),
    ...parsed.data.commentReactions.map((reaction) => reaction.userId),
    ...parsed.data.postHashtags.map((hashtag) => hashtag.taggedByUserId),
    ...parsed.data.commentHashtags.map((hashtag) => hashtag.taggedByUserId)
  ].filter((userId): userId is string => typeof userId === "string" && Boolean(userId));
  const referencedMediaAssetIds = [
    post.mediaAssetId,
    ...parsed.data.comments.map((comment) => comment.mediaAssetId)
  ].filter((mediaAssetId): mediaAssetId is string => typeof mediaAssetId === "string" && Boolean(mediaAssetId));

  const restoration = await withMediaAssetReferenceValidation(() =>
    prisma.$transaction(async (tx) => {
      await assertNewFeedPostWriteAllowed(tx, {
        actorUserId,
        additionalUserIds: referencedUserIds,
        mediaAssetIds: referencedMediaAssetIds
      });
      await tx.feedPost.create({ data: post });
      const allowed = await assertFeedChildWriteAllowed(tx, {
        postId: importedPostId,
        actorUserId,
        additionalUserIds: referencedUserIds,
        mediaAssetIds: referencedMediaAssetIds
      });
      if (!allowed) throw new Error("The imported feed post changed before its child records were restored.");
      for (const comment of parsed.data.comments) {
        await tx.feedComment.create({ data: comment as Prisma.FeedCommentUncheckedCreateInput });
      }
      for (const reaction of parsed.data.postReactions) {
        await tx.feedPostReaction.create({ data: reaction as Prisma.FeedPostReactionUncheckedCreateInput });
      }
      for (const reaction of parsed.data.commentReactions) {
        await tx.feedCommentReaction.create({ data: reaction as Prisma.FeedCommentReactionUncheckedCreateInput });
      }
      for (const hashtag of parsed.data.postHashtags) {
        await tx.feedPostHashtag.create({ data: hashtag as Prisma.FeedPostHashtagUncheckedCreateInput });
      }
      for (const hashtag of parsed.data.commentHashtags) {
        await tx.feedCommentHashtag.create({ data: hashtag as Prisma.FeedCommentHashtagUncheckedCreateInput });
      }
    })
  );
  if (!restoration.ok) return restoration;

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "stream.thread_imported",
    targetType: "FeedPost",
    targetId: importedPostId,
    severity: "critical",
    metadata: {
      sourceExportedAt: parsed.data.exportedAt,
      commentCount: parsed.data.comments.length
    }
  });

  return { ok: true as const, postId: importedPostId };
}
