import { createHash, randomUUID } from "node:crypto";
import {
  AuditSeverity,
  AuthSecurityEventType,
  DestructiveActionKind,
  DestructiveActionStatus,
  DestructiveStorageAccess,
  DestructiveStorageAction,
  DestructiveStorageStatus,
  MediaAssetStatus,
  MediaCollectionType,
  PlatformJobStatus,
  Prisma,
  RecordRetentionClass,
  type MediaVisibility,
  type PlatformJob
} from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { deleteR2Object, verifyR2ObjectAbsent, type R2ObjectAccess } from "@/lib/platform/r2";
import { mediaAssetDeliveryPath } from "@/modules/media/media-authorization";
import { UPLOAD_INTENT_TTL_MS } from "@/modules/media/upload-intent.service";
import type {
  PlatformJobHandlerContext,
  PlatformJobHandlerResult
} from "@/modules/platform-jobs/platform-jobs.service";

export const GALLERY_MEDIA_DELETE_JOB_KIND = "gallery.media-delete.v1";
export const GALLERY_MEDIA_DELETE_PAYLOAD_VERSION = 1;
const GALLERY_MEDIA_DELETE_MAX_ATTEMPTS = 8;
const GALLERY_MEDIA_DELETE_TERMINAL_RECOVERY_DELAY_MS = 60 * 60 * 1000;
export const GALLERY_MEDIA_DELETE_MAX_AUTOMATIC_RECOVERIES = 2;
export const GALLERY_MEDIA_UPLOAD_REPLAY_SAFETY_MS = 60 * 1000;
export const SYSTEM_GALLERY_TAGS = new Set([
  "stream images",
  "stream post images",
  "stream reply images",
  "ad",
  "ad images",
  "ad creative",
  "profile media",
  "business media"
]);

export const GALLERY_MEDIA_EXTERNAL_USE_LABELS = {
  feedPosts: "stream posts",
  feedComments: "stream comments",
  ads: "ads and ad creatives",
  businessArticles: "business article covers",
  chatAttachments: "chat attachments",
  mailAttachments: "mail attachments",
  groupForumPosts: "group forum posts",
  groupAssets: "group assets",
  marketListings: "market listings",
  scientologyCommendations: "Scientology commendations"
} as const;

type ExternalUseCounts = Record<keyof typeof GALLERY_MEDIA_EXTERNAL_USE_LABELS, number>;

type DeletionAsset = {
  id: string;
  ownerUserId: string;
  storageKey: string;
  mimeType: string;
  status: MediaAssetStatus;
  visibility: MediaVisibility;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  collections: Array<{
    collection: {
      type: MediaCollectionType;
      name: string;
    };
  }>;
};

type GalleryMediaDeletePayload = {
  version: 1;
  destructiveActionRequestId: string;
  ownerUserId: string;
  mediaAssetIds: string[];
  targetHash: string;
};

type GalleryDeletionRecoveryMode = "AUTOMATIC_TERMINAL_RECOVERY" | "CONFIRMED_RETRY";
export type GalleryDeletionFailureClass = "TRANSIENT_STORAGE" | "TERMINAL_INVARIANT";
export type GalleryDeletionFailureDisposition = "RETRY_CURRENT_JOB" | "CREATE_SUCCESSOR" | "TERMINAL";

type UploadIntentReplayRecord = {
  storageKey: string;
  createdAt: Date;
};

type StorageManifestObject = {
  id: string;
  storageKey: string;
  access: DestructiveStorageAccess;
  status: DestructiveStorageStatus;
};

type StorageObjectUpdate = {
  status: DestructiveStorageStatus;
  attemptCount?: { increment: number };
  attemptedAt?: Date;
  acknowledgedAt?: Date | null;
  verifiedAt?: Date | null;
  lastError?: string | null;
};

export type GalleryDeletionStorageOperations = {
  deleteObject: (storageKey: string, access: R2ObjectAccess) => Promise<void>;
  verifyAbsent: (storageKey: string, access: R2ObjectAccess) => Promise<{ ok: boolean; error?: string }>;
  updateObject: (id: string, data: StorageObjectUpdate) => Promise<void>;
  now?: () => Date;
};

function objectValue(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : null;
}

function thumbnailStorageKey(value: Prisma.JsonValue | null) {
  const metadata = objectValue(value);
  return typeof metadata?.thumbnailStorageKey === "string" && metadata.thumbnailStorageKey.length > 0
    ? metadata.thumbnailStorageKey
    : null;
}

function r2Access(access: DestructiveStorageAccess): R2ObjectAccess {
  return access === DestructiveStorageAccess.PUBLIC ? "public" : "private";
}

function normalizedMediaAssetIds(mediaAssetIds: readonly string[]) {
  return [...new Set(mediaAssetIds)].sort();
}

export function galleryMediaUploadReplayFenceUntil(
  assets: ReadonlyArray<Pick<DeletionAsset, "storageKey" | "createdAt">>,
  uploadIntents: readonly UploadIntentReplayRecord[]
) {
  const intentByStorageKey = new Map(uploadIntents.map((intent) => [intent.storageKey, intent]));
  let latestFenceAt = 0;

  for (const asset of assets) {
    const intent = intentByStorageKey.get(asset.storageKey);
    const signedAt = intent?.createdAt ?? (
      asset.storageKey.startsWith("upload-intents/") ? asset.createdAt : null
    );
    const signingWindowEndsAt = signedAt
      ? new Date(signedAt.getTime() + UPLOAD_INTENT_TTL_MS)
      : null;
    if (!signingWindowEndsAt) continue;
    latestFenceAt = Math.max(
      latestFenceAt,
      signingWindowEndsAt.getTime() + GALLERY_MEDIA_UPLOAD_REPLAY_SAFETY_MS
    );
  }

  return latestFenceAt > 0 ? new Date(latestFenceAt) : null;
}

function laterDate(left: Date, right: Date | null) {
  return right && right.getTime() > left.getTime() ? right : left;
}

async function loadGalleryMediaUploadReplayFenceUntil(
  transaction: Prisma.TransactionClient,
  ownerUserId: string,
  assets: readonly DeletionAsset[]
) {
  const storageKeys = [...new Set(assets.map((asset) => asset.storageKey))];
  const uploadIntents = storageKeys.length
    ? await transaction.uploadIntent.findMany({
        where: { ownerUserId, storageKey: { in: storageKeys } },
        select: { storageKey: true, createdAt: true }
      })
    : [];
  return galleryMediaUploadReplayFenceUntil(assets, uploadIntents);
}

function uploadReplayDelayResult(replayFenceUntil: Date | null, now = new Date()) {
  if (!replayFenceUntil || replayFenceUntil.getTime() <= now.getTime()) return null;
  return {
    ok: false as const,
    error: `Media deletion is waiting for its signed upload window to expire at ${replayFenceUntil.toISOString()}.`,
    failureClass: "TRANSIENT_STORAGE" as const,
    replayFenceUntil
  };
}

export function galleryMediaDeletionTargetHash(ownerUserId: string, mediaAssetIds: readonly string[]) {
  return createHash("sha256")
    .update(`${ownerUserId}\u0000${normalizedMediaAssetIds(mediaAssetIds).join("\u0000")}`, "utf8")
    .digest("hex");
}

export function galleryMediaDeletionIdempotencyKey(ownerUserId: string, mediaAssetIds: readonly string[]) {
  return `gallery-media-delete:v1:${galleryMediaDeletionTargetHash(ownerUserId, mediaAssetIds)}`;
}

export function profileMediaClearData(
  profile: { avatarUrl: string | null; bannerUrl: string | null } | null,
  mediaAssetIds: readonly string[]
) {
  const deletedMediaUrls = new Set(mediaAssetIds.map((mediaAssetId) => mediaAssetDeliveryPath(mediaAssetId)));
  const data: { avatarUrl?: null; bannerUrl?: null } = {};

  if (profile?.avatarUrl && deletedMediaUrls.has(profile.avatarUrl)) data.avatarUrl = null;
  if (profile?.bannerUrl && deletedMediaUrls.has(profile.bannerUrl)) data.bannerUrl = null;

  return data;
}

export function externalUseCategories(counts: ExternalUseCounts) {
  return (Object.keys(GALLERY_MEDIA_EXTERNAL_USE_LABELS) as Array<keyof ExternalUseCounts>)
    .filter((key) => counts[key] > 0)
    .map((key) => GALLERY_MEDIA_EXTERNAL_USE_LABELS[key]);
}

export function isProtectedSystemGalleryAsset(asset: Pick<DeletionAsset, "metadata" | "collections">) {
  const source = objectValue(asset.metadata)?.source;
  if (typeof source === "string" && source !== "GALLERY") return true;

  return asset.collections.some(({ collection }) =>
    collection.type === MediaCollectionType.TAG && SYSTEM_GALLERY_TAGS.has(collection.name.trim().toLowerCase())
  );
}

export function buildGalleryMediaDeletionManifestRows(requestId: string, assets: readonly DeletionAsset[]) {
  const rows = new Map<string, Prisma.DestructiveActionStorageObjectCreateManyInput>();

  for (const asset of assets) {
    const keys = [
      { role: "main", storageKey: asset.storageKey },
      { role: "thumbnail", storageKey: thumbnailStorageKey(asset.metadata) }
    ].filter((entry): entry is { role: string; storageKey: string } => Boolean(entry.storageKey));

    for (const entry of keys) {
      for (const access of [DestructiveStorageAccess.PRIVATE, DestructiveStorageAccess.PUBLIC]) {
        const identity = `${access}\u0000${entry.storageKey}`;
        if (rows.has(identity)) continue;
        rows.set(identity, {
          requestId,
          sourceType: "MediaAsset",
          sourceId: asset.id,
          storageKey: entry.storageKey,
          access,
          action: DestructiveStorageAction.DELETE,
          status: DestructiveStorageStatus.PLANNED,
          retentionClass: RecordRetentionClass.VITAL,
          metadata: {
            version: 1,
            role: entry.role,
            mediaAssetId: asset.id,
            primaryAccess: asset.visibility === "PUBLIC"
              ? DestructiveStorageAccess.PUBLIC
              : DestructiveStorageAccess.PRIVATE
          }
        });
      }
    }
  }

  return [...rows.values()].sort((left, right) =>
    `${left.access}\u0000${left.storageKey}`.localeCompare(`${right.access}\u0000${right.storageKey}`)
  );
}

async function lockOwnerAndAssets(
  transaction: Prisma.TransactionClient,
  ownerUserId: string,
  mediaAssetIds: readonly string[]
) {
  const lockedUsers = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "User"
    WHERE "id" = ${ownerUserId}
    FOR UPDATE
  `);
  if (lockedUsers.length === 0) return false;

  const lockedAssets = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "MediaAsset"
    WHERE "ownerUserId" = ${ownerUserId}
      AND "id" IN (${Prisma.join(mediaAssetIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
  return lockedAssets.length === mediaAssetIds.length;
}

async function loadDeletionAssets(
  transaction: Prisma.TransactionClient,
  ownerUserId: string,
  mediaAssetIds: readonly string[]
) {
  return transaction.mediaAsset.findMany({
    where: {
      id: { in: [...mediaAssetIds] },
      ownerUserId,
      mimeType: { startsWith: "image/", mode: "insensitive" }
    },
    select: {
      id: true,
      ownerUserId: true,
      storageKey: true,
      mimeType: true,
      status: true,
      visibility: true,
      metadata: true,
      createdAt: true,
      collections: {
        select: {
          collection: {
            select: { type: true, name: true }
          }
        }
      }
    },
    orderBy: { id: "asc" }
  });
}

export async function loadGalleryMediaExternalUseCategories(
  transaction: Prisma.TransactionClient,
  mediaAssetIds: readonly string[]
) {
  const ids = [...mediaAssetIds];
  const [
    feedPosts,
    feedComments,
    adImages,
    adCreatives,
    businessArticles,
    chatAttachments,
    mailAttachments,
    groupForumPosts,
    groupAssets,
    marketListings,
    scientologyCommendations
  ] = await Promise.all([
    transaction.feedPost.count({ where: { mediaAssetId: { in: ids }, streamDeletedAt: null } }),
    transaction.feedComment.count({ where: { mediaAssetId: { in: ids }, deletedAt: null } }),
    transaction.adCampaign.count({ where: { imageMediaAssetId: { in: ids } } }),
    transaction.adCampaignCreative.count({ where: { mediaAssetId: { in: ids } } }),
    transaction.businessArticle.count({ where: { coverMediaAssetId: { in: ids } } }),
    transaction.chatAttachment.count({ where: { mediaAssetId: { in: ids } } }),
    transaction.mailAttachment.count({ where: { mediaAssetId: { in: ids } } }),
    transaction.groupForumPost.count({ where: { mediaAssetId: { in: ids }, deletedAt: null } }),
    transaction.groupAsset.count({ where: { mediaAssetId: { in: ids }, deletedAt: null } }),
    transaction.marketListingPhoto.count({ where: { mediaAssetId: { in: ids } } }),
    transaction.scientologyCommendation.count({ where: { mediaAssetId: { in: ids } } })
  ]);

  return externalUseCategories({
    feedPosts,
    feedComments,
    ads: adImages + adCreatives,
    businessArticles,
    chatAttachments,
    mailAttachments,
    groupForumPosts,
    groupAssets,
    marketListings,
    scientologyCommendations
  });
}

export async function queueGalleryMediaDeletionWithinTransaction(
  transaction: Prisma.TransactionClient,
  ownerUserId: string,
  requestedMediaAssetIds: readonly string[]
) {
  const mediaAssetIds = normalizedMediaAssetIds(requestedMediaAssetIds);
  if (mediaAssetIds.length === 0) return { kind: "ASSETS_NOT_FOUND" as const };

  if (!await lockOwnerAndAssets(transaction, ownerUserId, mediaAssetIds)) {
    return { kind: "ASSETS_NOT_FOUND" as const };
  }

  const idempotencyKey = galleryMediaDeletionIdempotencyKey(ownerUserId, mediaAssetIds);
  const existing = await transaction.destructiveActionRequest.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      platformJobId: true,
      status: true,
      platformJob: { select: { status: true } }
    }
  });
  if (existing) {
    if (
      existing.platformJobId &&
      existing.status !== DestructiveActionStatus.SUCCEEDED &&
      (existing.platformJob?.status === PlatformJobStatus.FAILED || existing.platformJob?.status === PlatformJobStatus.CANCELLED)
    ) {
      return requeueGalleryMediaDeletionWithinTransaction(transaction, {
        requestId: existing.id,
        previousJobId: existing.platformJobId,
        ownerUserId,
        mediaAssetIds,
        expectedRequestStatuses: [existing.status],
        mode: "CONFIRMED_RETRY",
        error: `Confirmed retry of ${existing.status.toLowerCase()} gallery media deletion.`,
        runAfter: new Date()
      });
    }
    return {
      kind: "ALREADY_REQUESTED" as const,
      requestId: existing.id,
      jobId: existing.platformJobId,
      status: existing.status,
      mediaAssetIds
    };
  }

  const assets = await loadDeletionAssets(transaction, ownerUserId, mediaAssetIds);
  if (assets.length !== mediaAssetIds.length || assets.some((asset) => asset.status !== MediaAssetStatus.READY)) {
    return { kind: "ASSETS_NOT_FOUND" as const };
  }

  const protectedAssetIds = assets.filter(isProtectedSystemGalleryAsset).map((asset) => asset.id);
  if (protectedAssetIds.length > 0) {
    return { kind: "PROTECTED" as const, protectedAssetIds };
  }

  const inUseCategories = await loadGalleryMediaExternalUseCategories(transaction, mediaAssetIds);
  if (inUseCategories.length > 0) {
    return { kind: "IN_USE" as const, inUseCategories };
  }

  const queuedAt = new Date();
  const uploadReplayFenceUntil = await loadGalleryMediaUploadReplayFenceUntil(
    transaction,
    ownerUserId,
    assets
  );
  const jobRunAfter = laterDate(queuedAt, uploadReplayFenceUntil);

  const requestId = randomUUID();
  const jobId = randomUUID();
  const targetHash = galleryMediaDeletionTargetHash(ownerUserId, mediaAssetIds);
  const payload = {
    version: GALLERY_MEDIA_DELETE_PAYLOAD_VERSION,
    destructiveActionRequestId: requestId,
    ownerUserId,
    mediaAssetIds,
    targetHash
  } satisfies GalleryMediaDeletePayload;
  const manifestRows = buildGalleryMediaDeletionManifestRows(requestId, assets);

  await transaction.destructiveActionRequest.create({
    data: {
      id: requestId,
      idempotencyKey,
      kind: DestructiveActionKind.DELETE_MEDIA,
      status: DestructiveActionStatus.PENDING_CONFIRMATION,
      targetType: "MediaAssetBatch",
      targetId: targetHash,
      reason: "Gallery owner requested permanent media deletion.",
      requestedByUserId: ownerUserId,
      retentionClass: RecordRetentionClass.VITAL
    }
  });
  const confirmedAt = queuedAt;
  const securityEvent = await transaction.authSecurityEvent.create({
    data: {
      userId: ownerUserId,
      type: AuthSecurityEventType.DESTRUCTIVE_ACTION_CONFIRMED,
      identifier: targetHash,
      metadata: {
        version: 1,
        destructiveActionRequestId: requestId,
        targetType: "MediaAssetBatch",
        targetId: targetHash,
        mediaAssetIds,
        confirmationMatched: true
      }
    }
  });
  await transaction.platformJob.create({
    data: {
      id: jobId,
      kind: GALLERY_MEDIA_DELETE_JOB_KIND,
      payload,
      runAfter: jobRunAfter,
      maxAttempts: GALLERY_MEDIA_DELETE_MAX_ATTEMPTS
    }
  });
  if (manifestRows.length > 0) {
    await transaction.destructiveActionStorageObject.createMany({ data: manifestRows });
  }
  const storageManifest = {
    version: 1,
    totalObjects: manifestRows.length,
    deleteObjects: manifestRows.length,
    preserveObjects: 0
  };
  await transaction.destructiveActionRequest.update({
    where: { id: requestId },
    data: {
      result: {
        version: 1,
        phase: "QUEUED",
        ownerUserId,
        mediaAssetIds,
        uploadReplayFenceUntil: uploadReplayFenceUntil?.toISOString() ?? null,
        storageManifest
      }
    }
  });
  const queued = await transaction.destructiveActionRequest.updateMany({
    where: {
      id: requestId,
      status: DestructiveActionStatus.PENDING_CONFIRMATION,
      requestedByUserId: ownerUserId,
      confirmationSecurityEventId: null,
      platformJobId: null
    },
    data: {
      status: DestructiveActionStatus.QUEUED,
      confirmedByUserId: ownerUserId,
      confirmationSecurityEventId: securityEvent.id,
      platformJobId: jobId,
      confirmedAt,
      error: null
    }
  });
  if (queued.count !== 1) {
    throw new Error("Gallery media deletion could not be confirmed atomically.");
  }

  const marked = await transaction.mediaAsset.updateMany({
    where: { id: { in: mediaAssetIds }, ownerUserId, status: MediaAssetStatus.READY },
    data: { status: MediaAssetStatus.DELETING }
  });
  if (marked.count !== mediaAssetIds.length) {
    throw new Error("Gallery assets changed before the deletion request could be queued.");
  }

  const profile = await transaction.profile.findUnique({
    where: { userId: ownerUserId },
    select: { avatarUrl: true, bannerUrl: true }
  });
  const profileUpdate = profileMediaClearData(profile, mediaAssetIds);
  if (Object.keys(profileUpdate).length > 0) {
    await transaction.profile.update({ where: { userId: ownerUserId }, data: profileUpdate });
  }

  await writeAuditLog({
    operationId: `gallery-media-delete:${requestId}:queued`,
    requestId,
    actorUserId: ownerUserId,
    module: "gallery-media-storage",
    action: "gallery.media.delete.queued",
    targetType: "MediaAssetBatch",
    targetId: targetHash,
    severity: AuditSeverity.warning,
    retentionClass: RecordRetentionClass.VITAL,
    after: { status: DestructiveActionStatus.QUEUED, mediaAssetIds },
    metadata: {
      platformJobId: jobId,
      confirmationSecurityEventId: securityEvent.id,
      storageManifest
    }
  }, transaction);

  return {
    kind: "QUEUED" as const,
    requestId,
    jobId,
    mediaAssetIds,
    storageObjectCount: manifestRows.length
  };
}

export function parseGalleryMediaDeletePayload(value: Prisma.JsonValue | null): GalleryMediaDeletePayload | null {
  const payload = objectValue(value);
  if (
    payload?.version !== GALLERY_MEDIA_DELETE_PAYLOAD_VERSION ||
    typeof payload.destructiveActionRequestId !== "string" ||
    typeof payload.ownerUserId !== "string" ||
    typeof payload.targetHash !== "string" ||
    !Array.isArray(payload.mediaAssetIds) ||
    payload.mediaAssetIds.length === 0 ||
    payload.mediaAssetIds.some((id) => typeof id !== "string")
  ) return null;

  const payloadMediaAssetIds = payload.mediaAssetIds as string[];
  const mediaAssetIds = normalizedMediaAssetIds(payloadMediaAssetIds);
  if (
    mediaAssetIds.length !== payloadMediaAssetIds.length ||
    mediaAssetIds.some((id, index) => id !== payloadMediaAssetIds[index]) ||
    galleryMediaDeletionTargetHash(payload.ownerUserId, mediaAssetIds) !== payload.targetHash
  ) return null;

  return {
    version: 1,
    destructiveActionRequestId: payload.destructiveActionRequestId,
    ownerUserId: payload.ownerUserId,
    mediaAssetIds,
    targetHash: payload.targetHash
  };
}

function recoveryCountFromResult(value: Prisma.JsonValue | null) {
  const recoveryCount = objectValue(value)?.recoveryCount;
  return typeof recoveryCount === "number" && Number.isSafeInteger(recoveryCount) && recoveryCount >= 0
    ? recoveryCount
    : 0;
}

function automaticRecoveryCountFromResult(value: Prisma.JsonValue | null) {
  const automaticRecoveryCount = objectValue(value)?.automaticRecoveryCount;
  return typeof automaticRecoveryCount === "number" &&
    Number.isSafeInteger(automaticRecoveryCount) &&
    automaticRecoveryCount >= 0
    ? automaticRecoveryCount
    : 0;
}

export function galleryDeletionAttemptWillExhaust(job: Pick<PlatformJob, "attempts" | "maxAttempts">) {
  return job.attempts + 1 >= job.maxAttempts;
}

export function galleryDeletionFailureDisposition(
  job: Pick<PlatformJob, "attempts" | "maxAttempts">,
  failureClass: GalleryDeletionFailureClass
): GalleryDeletionFailureDisposition {
  if (failureClass === "TERMINAL_INVARIANT") return "TERMINAL";
  return galleryDeletionAttemptWillExhaust(job) ? "CREATE_SUCCESSOR" : "RETRY_CURRENT_JOB";
}

export function galleryDeletionAutomaticRecoveryAvailable(value: Prisma.JsonValue | null) {
  return automaticRecoveryCountFromResult(value) < GALLERY_MEDIA_DELETE_MAX_AUTOMATIC_RECOVERIES;
}

export async function requeueGalleryMediaDeletionWithinTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    requestId: string;
    previousJobId: string;
    ownerUserId: string;
    mediaAssetIds: readonly string[];
    expectedRequestStatuses: readonly DestructiveActionStatus[];
    mode: GalleryDeletionRecoveryMode;
    error: string;
    runAfter: Date;
  }
) {
  const mediaAssetIds = normalizedMediaAssetIds(input.mediaAssetIds);
  if (mediaAssetIds.length === 0 || !await lockOwnerAndAssets(transaction, input.ownerUserId, mediaAssetIds)) {
    return { kind: "ASSETS_NOT_FOUND" as const };
  }

  const lockedRequests = await transaction.$queryRaw<Array<{ id: string; status: DestructiveActionStatus }>>(Prisma.sql`
    SELECT "id", "status"
    FROM "DestructiveActionRequest"
    WHERE "id" = ${input.requestId}
    FOR UPDATE
  `);
  if (!lockedRequests[0] || !input.expectedRequestStatuses.includes(lockedRequests[0].status)) {
    const replay = await transaction.destructiveActionRequest.findUnique({
      where: { id: input.requestId },
      select: { id: true, platformJobId: true, status: true }
    });
    return replay
      ? {
          kind: "ALREADY_REQUESTED" as const,
          requestId: replay.id,
          jobId: replay.platformJobId,
          status: replay.status,
          mediaAssetIds
        }
      : { kind: "ASSETS_NOT_FOUND" as const };
  }

  const [request, previousJob, assets] = await Promise.all([
    transaction.destructiveActionRequest.findUnique({ where: { id: input.requestId } }),
    transaction.platformJob.findUnique({ where: { id: input.previousJobId } }),
    loadDeletionAssets(transaction, input.ownerUserId, mediaAssetIds)
  ]);
  const targetHash = galleryMediaDeletionTargetHash(input.ownerUserId, mediaAssetIds);
  if (
    !request ||
    request.kind !== DestructiveActionKind.DELETE_MEDIA ||
    request.targetType !== "MediaAssetBatch" ||
    request.targetId !== targetHash ||
    request.requestedByUserId !== input.ownerUserId ||
    request.confirmedByUserId !== input.ownerUserId ||
    !request.confirmationSecurityEventId ||
    !request.confirmedAt ||
    request.platformJobId !== input.previousJobId ||
    !input.expectedRequestStatuses.includes(request.status) ||
    !previousJob ||
    previousJob.kind !== GALLERY_MEDIA_DELETE_JOB_KIND
  ) {
    return { kind: "RECOVERY_INVALID" as const, error: "The confirmed media deletion request cannot be reconciled safely." };
  }

  if (
    input.mode === "AUTOMATIC_TERMINAL_RECOVERY" &&
    !galleryDeletionAutomaticRecoveryAvailable(request.result)
  ) {
    return {
      kind: "RECOVERY_LIMIT_REACHED" as const,
      error: "Automatic media deletion recovery reached its safety limit. Confirm a manual retry after reviewing the failure."
    };
  }

  const expectedPreviousJobStatuses: ReadonlySet<PlatformJobStatus> = input.mode === "AUTOMATIC_TERMINAL_RECOVERY"
    ? new Set([PlatformJobStatus.RUNNING])
    : new Set([PlatformJobStatus.FAILED, PlatformJobStatus.CANCELLED]);
  if (!expectedPreviousJobStatuses.has(previousJob.status)) {
    return { kind: "RECOVERY_INVALID" as const, error: "The previous media deletion job is not in a recoverable state." };
  }

  if (assets.length !== mediaAssetIds.length || assets.some((asset) => asset.status !== MediaAssetStatus.DELETING)) {
    return { kind: "ASSETS_NOT_FOUND" as const };
  }
  const protectedAssetIds = assets.filter(isProtectedSystemGalleryAsset).map((asset) => asset.id);
  if (protectedAssetIds.length > 0) return { kind: "PROTECTED" as const, protectedAssetIds };

  const inUseCategories = await loadGalleryMediaExternalUseCategories(transaction, mediaAssetIds);
  if (inUseCategories.length > 0) return { kind: "IN_USE" as const, inUseCategories };

  const uploadReplayFenceUntil = await loadGalleryMediaUploadReplayFenceUntil(
    transaction,
    input.ownerUserId,
    assets
  );
  const successorRunAfter = laterDate(input.runAfter, uploadReplayFenceUntil);

  const expectedManifest = buildGalleryMediaDeletionManifestRows(request.id, assets);
  const manifest = await transaction.destructiveActionStorageObject.findMany({
    where: { requestId: request.id },
    select: { access: true, storageKey: true, action: true, retentionClass: true }
  });
  const expectedKeys = new Set(expectedManifest.map((row) => `${row.access}\u0000${row.storageKey}`));
  const manifestMatches = manifest.length === expectedKeys.size && manifest.every((row) =>
    row.action === DestructiveStorageAction.DELETE &&
    row.retentionClass === RecordRetentionClass.VITAL &&
    expectedKeys.has(`${row.access}\u0000${row.storageKey}`)
  );
  if (!manifestMatches) {
    return { kind: "RECOVERY_INVALID" as const, error: "The media deletion storage manifest cannot be reconciled safely." };
  }

  const newJobId = randomUUID();
  const requeuedAt = new Date();
  const payload = {
    version: GALLERY_MEDIA_DELETE_PAYLOAD_VERSION,
    destructiveActionRequestId: request.id,
    ownerUserId: input.ownerUserId,
    mediaAssetIds,
    targetHash
  } satisfies GalleryMediaDeletePayload;
  let retrySecurityEventId: string | null = null;
  if (input.mode === "CONFIRMED_RETRY") {
    const retrySecurityEvent = await transaction.authSecurityEvent.create({
      data: {
        userId: input.ownerUserId,
        type: AuthSecurityEventType.DESTRUCTIVE_ACTION_CONFIRMED,
        identifier: targetHash,
        metadata: {
          version: 1,
          destructiveActionRequestId: request.id,
          targetType: "MediaAssetBatch",
          targetId: targetHash,
          mediaAssetIds,
          confirmationMatched: true,
          reconciliation: true,
          previousPlatformJobId: input.previousJobId
        }
      }
    });
    retrySecurityEventId = retrySecurityEvent.id;
  }

  await transaction.platformJob.create({
    data: {
      id: newJobId,
      kind: GALLERY_MEDIA_DELETE_JOB_KIND,
      payload,
      runAfter: successorRunAfter,
      maxAttempts: Math.max(previousJob.maxAttempts, GALLERY_MEDIA_DELETE_MAX_ATTEMPTS)
    }
  });
  const recoveryCount = recoveryCountFromResult(request.result) + 1;
  const automaticRecoveryCount = input.mode === "AUTOMATIC_TERMINAL_RECOVERY"
    ? automaticRecoveryCountFromResult(request.result) + 1
    : 0;
  const requeued = await transaction.destructiveActionRequest.updateMany({
    where: {
      id: request.id,
      status: { in: [...input.expectedRequestStatuses] },
      platformJobId: input.previousJobId,
      confirmationSecurityEventId: request.confirmationSecurityEventId
    },
    data: {
      status: DestructiveActionStatus.QUEUED,
      platformJobId: newJobId,
      failedAt: null,
      completedAt: null,
      error: null,
      result: {
        version: 1,
        phase: "QUEUED",
        ownerUserId: input.ownerUserId,
        mediaAssetIds,
        recoveryCount,
        automaticRecoveryCount,
        recoveryMode: input.mode,
        previousPlatformJobId: input.previousJobId,
        lastFailure: input.error,
        requeuedAt: requeuedAt.toISOString(),
        uploadReplayFenceUntil: uploadReplayFenceUntil?.toISOString() ?? null,
        storageManifest: {
          version: 1,
          totalObjects: manifest.length,
          deleteObjects: manifest.length,
          preserveObjects: 0
        }
      }
    }
  });
  if (requeued.count !== 1) {
    throw new Error("Gallery media deletion recovery lost its request state before requeue.");
  }

  await writeAuditLog({
    operationId: `gallery-media-delete:${request.id}:requeued:${newJobId}`,
    requestId: request.id,
    actorUserId: input.ownerUserId,
    module: "gallery-media-storage",
    action: "gallery.media.delete.requeued",
    targetType: "MediaAssetBatch",
    targetId: targetHash,
    severity: AuditSeverity.warning,
    retentionClass: RecordRetentionClass.VITAL,
    before: {
      status: request.status,
      platformJobId: input.previousJobId,
      error: input.error
    },
    after: {
      status: DestructiveActionStatus.QUEUED,
      platformJobId: newJobId,
      recoveryCount
    },
    metadata: {
      recoveryMode: input.mode,
      retrySecurityEventId,
      storageObjectCount: manifest.length,
      runAfter: successorRunAfter.toISOString(),
      uploadReplayFenceUntil: uploadReplayFenceUntil?.toISOString() ?? null
    }
  }, transaction);

  return {
    kind: "REQUEUED" as const,
    requestId: request.id,
    jobId: newJobId,
    mediaAssetIds,
    storageObjectCount: manifest.length,
    recoveryCount
  };
}

async function ensureWorkerLease(context: PlatformJobHandlerContext) {
  await context.assertLease();
  if (!await context.renewLease()) {
    await context.assertLease();
    throw new Error("The media deletion worker lease could not be renewed.");
  }
}

export async function processGalleryDeletionStorageObject(
  object: StorageManifestObject,
  context: Pick<PlatformJobHandlerContext, "assertLease" | "renewLease">,
  operations: GalleryDeletionStorageOperations
) {
  const now = operations.now ?? (() => new Date());
  const access = r2Access(object.access);

  await context.assertLease();
  if (!await context.renewLease()) {
    await context.assertLease();
    return { ok: false as const, error: "The worker lease could not be renewed." };
  }

  let initialVerification: { ok: boolean; error?: string };
  try {
    initialVerification = await operations.verifyAbsent(object.storageKey, access);
  } catch (error) {
    await context.assertLease();
    const message = error instanceof Error ? error.message : "Storage verification failed.";
    await operations.updateObject(object.id, {
      status: DestructiveStorageStatus.FAILED,
      verifiedAt: null,
      lastError: message
    });
    return { ok: false as const, error: message };
  }
  await context.assertLease();

  if (initialVerification.ok) {
    await operations.updateObject(object.id, {
      status: DestructiveStorageStatus.VERIFIED,
      verifiedAt: now(),
      lastError: null
    });
    return { ok: true as const, alreadyAbsent: true as const };
  }

  const attemptedAt = now();
  if (!await context.renewLease()) {
    await context.assertLease();
    return { ok: false as const, error: "The worker lease could not be renewed." };
  }
  try {
    await operations.deleteObject(object.storageKey, access);
  } catch (error) {
    await context.assertLease();
    const message = error instanceof Error ? error.message : "Storage deletion failed.";
    await operations.updateObject(object.id, {
      status: DestructiveStorageStatus.FAILED,
      attemptCount: { increment: 1 },
      attemptedAt,
      verifiedAt: null,
      lastError: message
    });
    return { ok: false as const, error: message };
  }
  await context.assertLease();
  await operations.updateObject(object.id, {
    status: DestructiveStorageStatus.DELETE_ACKNOWLEDGED,
    attemptCount: { increment: 1 },
    attemptedAt,
    acknowledgedAt: now(),
    verifiedAt: null,
    lastError: null
  });

  let verification: { ok: boolean; error?: string };
  if (!await context.renewLease()) {
    await context.assertLease();
    return { ok: false as const, error: "The worker lease could not be renewed." };
  }
  try {
    verification = await operations.verifyAbsent(object.storageKey, access);
  } catch (error) {
    verification = {
      ok: false,
      error: error instanceof Error ? error.message : "Storage verification failed after deletion."
    };
  }
  await context.assertLease();

  await operations.updateObject(object.id, verification.ok
    ? {
        status: DestructiveStorageStatus.VERIFIED,
        verifiedAt: now(),
        lastError: null
      }
    : {
        status: DestructiveStorageStatus.FAILED,
        verifiedAt: null,
        lastError: verification.error ?? "Storage object is still present after deletion."
      });

  return verification.ok
    ? { ok: true as const, alreadyAbsent: false as const }
    : { ok: false as const, error: verification.error ?? "Storage object is still present after deletion." };
}

async function validateDeletionBeforeStorage(
  transaction: Prisma.TransactionClient,
  payload: GalleryMediaDeletePayload,
  jobId: string
) {
  if (!await lockOwnerAndAssets(transaction, payload.ownerUserId, payload.mediaAssetIds)) {
    return { ok: false as const, error: "One or more deletion assets no longer exists." };
  }
  const request = await transaction.destructiveActionRequest.findUnique({
    where: { id: payload.destructiveActionRequestId }
  });
  if (
    !request ||
    request.kind !== DestructiveActionKind.DELETE_MEDIA ||
    request.status !== DestructiveActionStatus.RUNNING ||
    request.targetType !== "MediaAssetBatch" ||
    request.targetId !== payload.targetHash ||
    request.requestedByUserId !== payload.ownerUserId ||
    request.platformJobId !== jobId
  ) return { ok: false as const, error: "The media deletion request and worker job do not match." };

  const assets = await loadDeletionAssets(transaction, payload.ownerUserId, payload.mediaAssetIds);
  if (assets.length !== payload.mediaAssetIds.length || assets.some((asset) => asset.status !== MediaAssetStatus.DELETING)) {
    return { ok: false as const, error: "One or more media deletion tombstones is missing." };
  }
  if (assets.some(isProtectedSystemGalleryAsset)) {
    return { ok: false as const, error: "A protected system image cannot be deleted." };
  }
  const inUseCategories = await loadGalleryMediaExternalUseCategories(transaction, payload.mediaAssetIds);
  if (inUseCategories.length > 0) {
    return { ok: false as const, error: `Media is still in use by: ${inUseCategories.join(", ")}.` };
  }
  const uploadReplayDelay = uploadReplayDelayResult(
    await loadGalleryMediaUploadReplayFenceUntil(transaction, payload.ownerUserId, assets)
  );
  if (uploadReplayDelay) return uploadReplayDelay;

  const expectedManifest = buildGalleryMediaDeletionManifestRows(request.id, assets);
  const manifest = await transaction.destructiveActionStorageObject.findMany({
    where: { requestId: request.id },
    select: { access: true, storageKey: true, action: true, retentionClass: true }
  });
  const expectedKeys = new Set(expectedManifest.map((row) => `${row.access}\u0000${row.storageKey}`));
  const manifestMatches = manifest.length === expectedKeys.size && manifest.every((row) =>
    row.action === DestructiveStorageAction.DELETE &&
    row.retentionClass === RecordRetentionClass.VITAL &&
    expectedKeys.has(`${row.access}\u0000${row.storageKey}`)
  );
  if (!manifestMatches) return { ok: false as const, error: "The media deletion storage manifest is incomplete." };

  return { ok: true as const };
}

async function processDeletionManifest(
  requestId: string,
  context: PlatformJobHandlerContext
) {
  const objects = await prisma.destructiveActionStorageObject.findMany({
    where: { requestId, action: DestructiveStorageAction.DELETE },
    select: { id: true, storageKey: true, access: true, status: true },
    orderBy: [{ access: "asc" }, { storageKey: "asc" }]
  });
  let alreadyAbsent = 0;

  for (const object of objects) {
    const result = await processGalleryDeletionStorageObject(object, context, {
      deleteObject: async (storageKey, access) => {
        await deleteR2Object(storageKey, access);
      },
      verifyAbsent: verifyR2ObjectAbsent,
      updateObject: async (id, data) => {
        await prisma.destructiveActionStorageObject.update({ where: { id }, data });
      }
    });
    if (!result.ok) return { ok: false as const, error: result.error };
    if (result.alreadyAbsent) alreadyAbsent += 1;
  }

  return { ok: true as const, objectCount: objects.length, alreadyAbsent };
}

async function finalizeGalleryMediaDeletion(
  transaction: Prisma.TransactionClient,
  payload: GalleryMediaDeletePayload,
  jobId: string,
  storageResult: { objectCount: number; alreadyAbsent: number }
) {
  if (!await lockOwnerAndAssets(transaction, payload.ownerUserId, payload.mediaAssetIds)) {
    return { ok: false as const, error: "One or more deletion assets no longer exists." };
  }
  const lockedRequests = await transaction.$queryRaw<Array<{ id: string; status: DestructiveActionStatus }>>(Prisma.sql`
    SELECT "id", "status"
    FROM "DestructiveActionRequest"
    WHERE "id" = ${payload.destructiveActionRequestId}
    FOR UPDATE
  `);
  if (lockedRequests[0]?.status === DestructiveActionStatus.SUCCEEDED) {
    const completed = await transaction.destructiveActionRequest.findUnique({
      where: { id: payload.destructiveActionRequestId },
      select: { result: true }
    });
    return { ok: true as const, result: completed?.result ?? { replayed: true } };
  }
  if (lockedRequests[0]?.status !== DestructiveActionStatus.RUNNING) {
    return { ok: false as const, error: "The media deletion request is no longer running." };
  }

  const request = await transaction.destructiveActionRequest.findUnique({
    where: { id: payload.destructiveActionRequestId }
  });
  if (
    !request ||
    request.kind !== DestructiveActionKind.DELETE_MEDIA ||
    request.platformJobId !== jobId ||
    request.targetId !== payload.targetHash
  ) return { ok: false as const, error: "The media deletion request and worker job do not match." };

  const assets = await loadDeletionAssets(transaction, payload.ownerUserId, payload.mediaAssetIds);
  if (assets.length !== payload.mediaAssetIds.length || assets.some((asset) => asset.status !== MediaAssetStatus.DELETING)) {
    return { ok: false as const, error: "One or more media deletion tombstones is missing." };
  }
  if (assets.some(isProtectedSystemGalleryAsset)) {
    return { ok: false as const, error: "A protected system image cannot be deleted." };
  }
  const inUseCategories = await loadGalleryMediaExternalUseCategories(transaction, payload.mediaAssetIds);
  if (inUseCategories.length > 0) {
    return { ok: false as const, error: `Media is still in use by: ${inUseCategories.join(", ")}.` };
  }
  const uploadReplayDelay = uploadReplayDelayResult(
    await loadGalleryMediaUploadReplayFenceUntil(transaction, payload.ownerUserId, assets)
  );
  if (uploadReplayDelay) return uploadReplayDelay;
  const outstandingObjects = await transaction.destructiveActionStorageObject.count({
    where: {
      requestId: request.id,
      action: DestructiveStorageAction.DELETE,
      status: { not: DestructiveStorageStatus.VERIFIED }
    }
  });
  if (outstandingObjects !== 0) {
    return { ok: false as const, error: "Storage verification is incomplete." };
  }

  const deleted = await transaction.mediaAsset.deleteMany({
    where: {
      id: { in: payload.mediaAssetIds },
      ownerUserId: payload.ownerUserId,
      status: MediaAssetStatus.DELETING
    }
  });
  if (deleted.count !== payload.mediaAssetIds.length) {
    throw new Error("Media asset deletion changed while finalization held its locks.");
  }

  const completedAt = new Date();
  const result = {
    version: 1,
    phase: "SUCCEEDED",
    destructiveActionRequestId: request.id,
    ownerUserId: payload.ownerUserId,
    deletedMediaAssetIds: payload.mediaAssetIds,
    deletedCount: deleted.count,
    storageObjectCount: storageResult.objectCount,
    alreadyAbsentStorageObjects: storageResult.alreadyAbsent,
    recoveryCount: recoveryCountFromResult(request.result),
    automaticRecoveryCount: automaticRecoveryCountFromResult(request.result),
    completedAt: completedAt.toISOString()
  } satisfies Prisma.InputJsonObject;
  const completed = await transaction.destructiveActionRequest.updateMany({
    where: {
      id: request.id,
      status: DestructiveActionStatus.RUNNING,
      platformJobId: jobId
    },
    data: {
      status: DestructiveActionStatus.SUCCEEDED,
      completedAt,
      failedAt: null,
      error: null,
      result
    }
  });
  if (completed.count !== 1) throw new Error("Media deletion completion could not be saved atomically.");

  await writeAuditLog({
    operationId: `gallery-media-delete:${request.id}:succeeded`,
    requestId: request.id,
    actorUserId: payload.ownerUserId,
    module: "gallery-media-storage",
    action: "gallery.media.delete.succeeded",
    targetType: "MediaAssetBatch",
    targetId: payload.targetHash,
    severity: AuditSeverity.warning,
    retentionClass: RecordRetentionClass.VITAL,
    before: { status: DestructiveActionStatus.RUNNING },
    after: { status: DestructiveActionStatus.SUCCEEDED, deletedCount: deleted.count },
    metadata: { platformJobId: jobId, storageObjectCount: storageResult.objectCount }
  }, transaction);

  return { ok: true as const, result };
}

async function galleryDeletionFailureResult(
  job: PlatformJob,
  payload: GalleryMediaDeletePayload,
  context: PlatformJobHandlerContext,
  failureClass: GalleryDeletionFailureClass,
  error: string
): Promise<PlatformJobHandlerResult> {
  const disposition = galleryDeletionFailureDisposition(job, failureClass);
  if (disposition === "TERMINAL") return { ok: false, error, retryable: false };
  if (disposition === "RETRY_CURRENT_JOB") return { ok: false, error, retryable: true };

  await ensureWorkerLease(context);
  const recovery = await prisma.$transaction(
    (transaction) => requeueGalleryMediaDeletionWithinTransaction(transaction, {
      requestId: payload.destructiveActionRequestId,
      previousJobId: job.id,
      ownerUserId: payload.ownerUserId,
      mediaAssetIds: payload.mediaAssetIds,
      expectedRequestStatuses: [DestructiveActionStatus.RUNNING],
      mode: "AUTOMATIC_TERMINAL_RECOVERY",
      error,
      runAfter: new Date(Date.now() + GALLERY_MEDIA_DELETE_TERMINAL_RECOVERY_DELAY_MS)
    }),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  if (
    recovery.kind === "REQUEUED" ||
    (recovery.kind === "ALREADY_REQUESTED" && recovery.jobId !== job.id)
  ) {
    return { ok: false, error, retryable: false };
  }

  return {
    ok: false,
    error: `${error} ${
      recovery.kind === "RECOVERY_LIMIT_REACHED"
        ? recovery.error
        : "Automatic deletion recovery could not safely requeue the request."
    }`,
    retryable: false
  };
}

export async function runGalleryMediaDeletionPlatformJob(
  job: PlatformJob,
  context: PlatformJobHandlerContext
): Promise<PlatformJobHandlerResult> {
  const payload = parseGalleryMediaDeletePayload(job.payload);
  if (!payload || job.kind !== GALLERY_MEDIA_DELETE_JOB_KIND) {
    return { ok: false, error: "Invalid gallery media deletion job payload.", retryable: false };
  }
  await context.assertLease();

  const request = await prisma.destructiveActionRequest.findUnique({
    where: { id: payload.destructiveActionRequestId }
  });
  if (
    !request ||
    request.kind !== DestructiveActionKind.DELETE_MEDIA ||
    request.targetType !== "MediaAssetBatch" ||
    request.targetId !== payload.targetHash ||
    request.requestedByUserId !== payload.ownerUserId ||
    request.platformJobId !== job.id
  ) return { ok: false, error: "The media deletion request and worker job do not match.", retryable: false };

  if (request.status === DestructiveActionStatus.SUCCEEDED) {
    return { ok: true, result: request.result ?? { replayed: true } };
  }
  if (request.status !== DestructiveActionStatus.QUEUED) {
    return { ok: false, error: `Media deletion request is ${request.status.toLowerCase()}.`, retryable: false };
  }

  const claimed = await prisma.destructiveActionRequest.updateMany({
    where: {
      id: request.id,
      status: DestructiveActionStatus.QUEUED,
      platformJobId: job.id
    },
    data: {
      status: DestructiveActionStatus.RUNNING,
      startedAt: request.startedAt ?? new Date(),
      error: null
    }
  });
  if (claimed.count !== 1) {
    const replay = await prisma.destructiveActionRequest.findUnique({ where: { id: request.id } });
    return replay?.status === DestructiveActionStatus.SUCCEEDED
      ? { ok: true, result: replay.result ?? { replayed: true } }
      : { ok: false, error: "Media deletion request could not be claimed from the queued state.", retryable: false };
  }

  await ensureWorkerLease(context);
  const preflight = await prisma.$transaction(
    (transaction) => validateDeletionBeforeStorage(transaction, payload, job.id),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  if (!preflight.ok) {
    return galleryDeletionFailureResult(
      job,
      payload,
      context,
      "failureClass" in preflight ? preflight.failureClass : "TERMINAL_INVARIANT",
      preflight.error
    );
  }

  const firstStoragePass = await processDeletionManifest(request.id, context);
  if (!firstStoragePass.ok) {
    return galleryDeletionFailureResult(job, payload, context, "TRANSIENT_STORAGE", firstStoragePass.error);
  }

  await ensureWorkerLease(context);
  const secondPreflight = await prisma.$transaction(
    (transaction) => validateDeletionBeforeStorage(transaction, payload, job.id),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  if (!secondPreflight.ok) {
    return galleryDeletionFailureResult(
      job,
      payload,
      context,
      "failureClass" in secondPreflight ? secondPreflight.failureClass : "TERMINAL_INVARIANT",
      secondPreflight.error
    );
  }

  const finalStoragePass = await processDeletionManifest(request.id, context);
  if (!finalStoragePass.ok) {
    return galleryDeletionFailureResult(job, payload, context, "TRANSIENT_STORAGE", finalStoragePass.error);
  }
  await ensureWorkerLease(context);

  const finalization = await prisma.$transaction(
    (transaction) => finalizeGalleryMediaDeletion(transaction, payload, job.id, {
      objectCount: finalStoragePass.objectCount,
      alreadyAbsent: firstStoragePass.alreadyAbsent
    }),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  return finalization.ok
    ? { ok: true, result: finalization.result as Prisma.InputJsonValue }
    : galleryDeletionFailureResult(
        job,
        payload,
        context,
        "failureClass" in finalization ? finalization.failureClass : "TERMINAL_INVARIANT",
        finalization.error
      );
}
