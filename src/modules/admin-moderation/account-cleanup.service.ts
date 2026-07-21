import {
  AdCampaignStatus,
  AuditOutcome,
  AuditSeverity,
  DeliveryOutboxStatus,
  DestructiveActionKind,
  DestructiveActionStatus,
  DestructiveStorageAccess,
  DestructiveStorageAction,
  DestructiveStorageStatus,
  EventStatus,
  FundraiserStatus,
  Prisma,
  RecordRetentionClass,
  type MediaVisibility,
  type PlatformJob
} from "@prisma/client";
import { createHash } from "node:crypto";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { deleteR2Object, verifyR2ObjectAbsent, type R2ObjectAccess } from "@/lib/platform/r2";
import { cancelSubscriptionForAccountDeletion } from "@/modules/membership-policy/subscriptions.service";
import {
  PlatformJobLeaseLostError,
  type PlatformJobHandlerContext,
  type PlatformJobHandlerResult
} from "@/modules/platform-jobs/platform-jobs.service";

export const ACCOUNT_DATA_CLEANUP_JOB_KIND = "account.data-cleanup.v1";

const DELETED_BODY = "[Removed: account deleted]";

export const ACCOUNT_CLEANUP_PRESERVED_MODELS = [
  "TermsAcceptance",
  "AuditLog",
  "AdminAction",
  "DestructiveActionRequest",
  "DestructiveActionStorageObject",
  "AuthSecurityEvent",
  "PublicAnnouncement",
  "DeliveryOutbox",
  "FeedbackTicket",
  "FeedbackTicketEvent",
  "ConductReport",
  "ConductEvent",
  "MailThread",
  "MailMessage",
  "MailRecipient",
  "MailAttachment",
  "BusinessInquiry",
  "AdCampaign",
  "AdCreditLedgerEntry",
  "AdDeliveryLog",
  "BillingCheckoutIntent",
  "StripeCheckoutFulfillment",
  "FundraiserCampaign",
  "FundContributionIntent",
  "FundLedgerEntry"
] as const;

export const ACCOUNT_CLEANUP_ORDINARY_MODELS = [
  "Profile",
  "UserResume",
  "ScientologyProfile",
  "FeedPost",
  "FeedComment",
  "GalleryAssetComment",
  "MarketListing",
  "JobListing",
  "WriterManuscript",
  "WriterManuscriptSubscription",
  "GroupMember",
  "GroupJoinRequest",
  "GroupUserPin",
  "GroupForumThread",
  "GroupForumPost",
  "GroupAsset",
  "EventModerator",
  "EventInvitation",
  "EventRsvp",
  "Notification",
  "Alert",
  "MediaAsset",
  "UploadIntent"
] as const;

export const ACCOUNT_CLEANUP_CONDITIONAL_RETENTION_RULES = [
  {
    models: ["ChatThread", "ChatParticipant", "ChatMessage", "ChatAttachment", "ChatMessageReaction"],
    rule: "Preserve only rows belonging to a thread permanently tagged VITAL."
  },
  {
    models: ["EncryptedChatThread", "EncryptedChatParticipant", "EncryptedChatMessage", "EncryptedChatEnvelope"],
    rule: "Preserve only rows belonging to an encrypted thread permanently tagged VITAL."
  },
  {
    models: ["FeedPost"],
    rule: "Preserve administrator announcements, administrator-held posts, and linked held evidence; hide ordinary member posts."
  },
  {
    models: ["MediaAsset"],
    rule: "Use the immutable confirmation-time storage manifest; preserve system/VITAL, mail, VITAL chat, admin post/hold, and ad evidence assets."
  },
  {
    models: ["AdCampaign"],
    rule: "Before cleanup begins, preserve a hashed snapshot of each linked listing, business article, or manuscript target."
  }
] as const;

type CleanupJobPayload = {
  version: 1;
  destructiveActionRequestId: string;
  targetUserId: string;
};

type AccountCleanupProgress = {
  version: 1;
  phase: "DATA_PURGED";
  targetUserId: string;
  counts: Record<string, number>;
  storageManifest: Prisma.JsonObject;
  adTargetSnapshots: Prisma.JsonObject;
};

type AccountDeletionIntegrity = Pick<AccountCleanupProgress, "storageManifest" | "adTargetSnapshots">;

export type AccountDeletionStorageCandidate = {
  sourceType: string;
  sourceId: string;
  storageKey: string;
  access: DestructiveStorageAccess;
  action: DestructiveStorageAction;
  reason: string;
};

type AccountDeletionStorageManifestRow = {
  sourceType: string;
  sourceId: string;
  storageKey: string;
  access: DestructiveStorageAccess;
  action: DestructiveStorageAction;
  metadata: Prisma.JsonValue | null;
};

function objectValue(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseAccountDeletionIntegrity(value: Prisma.JsonValue | null): AccountDeletionIntegrity | null {
  const container = objectValue(value);
  const storageManifest = container && objectValue(container.storageManifest as Prisma.JsonValue | null);
  const adTargetSnapshots = container && objectValue(container.adTargetSnapshots as Prisma.JsonValue | null);
  if (
    storageManifest?.version !== 1 ||
    storageManifest.immutable !== true ||
    typeof storageManifest.totalObjects !== "number" ||
    typeof storageManifest.deleteObjects !== "number" ||
    typeof storageManifest.preserveObjects !== "number" ||
    storageManifest.totalObjects !== storageManifest.deleteObjects + storageManifest.preserveObjects ||
    !adTargetSnapshots ||
    adTargetSnapshots.version !== 1 ||
    typeof adTargetSnapshots.campaignsSnapshotted !== "number" ||
    typeof adTargetSnapshots.campaignsSealed !== "number" ||
    !Array.isArray(adTargetSnapshots.campaigns) ||
    adTargetSnapshots.campaigns.length !== adTargetSnapshots.campaignsSealed
  ) return null;
  return {
    storageManifest: storageManifest as Prisma.JsonObject,
    adTargetSnapshots: adTargetSnapshots as Prisma.JsonObject
  };
}

function parseAccountCleanupProgress(value: Prisma.JsonValue | null): AccountCleanupProgress | null {
  const progress = objectValue(value);
  const counts = progress && objectValue(progress.counts as Prisma.JsonValue | null);
  const integrity = parseAccountDeletionIntegrity(value);
  if (
    progress?.version !== 1 ||
    progress.phase !== "DATA_PURGED" ||
    typeof progress.targetUserId !== "string" ||
    !counts ||
    !integrity ||
    Object.values(counts).some((count) => typeof count !== "number" || !Number.isInteger(count) || count < 0)
  ) return null;
  return {
    version: 1,
    phase: "DATA_PURGED",
    targetUserId: progress.targetUserId,
    counts: counts as Record<string, number>,
    ...integrity
  };
}

export function parseAccountCleanupJobPayload(value: Prisma.JsonValue | null): CleanupJobPayload | null {
  const payload = objectValue(value);
  if (
    payload?.version !== 1 ||
    typeof payload.destructiveActionRequestId !== "string" ||
    typeof payload.targetUserId !== "string"
  ) return null;
  return {
    version: 1,
    destructiveActionRequestId: payload.destructiveActionRequestId,
    targetUserId: payload.targetUserId
  };
}

export function isPermanentlyProtectedMediaMetadata(value: Prisma.JsonValue | null) {
  const metadata = objectValue(value);
  if (!metadata) return false;
  return metadata.neverDelete === true ||
    metadata.systemAsset === true ||
    metadata.retentionClass === "VITAL" ||
    metadata.retentionProtected === true;
}

function storageAccess(visibility: MediaVisibility): DestructiveStorageAccess {
  return visibility === "PUBLIC" ? DestructiveStorageAccess.PUBLIC : DestructiveStorageAccess.PRIVATE;
}

function r2StorageAccess(access: DestructiveStorageAccess): R2ObjectAccess {
  return access === DestructiveStorageAccess.PUBLIC ? "public" : "private";
}

export function mediaThumbnailStorageKey(value: Prisma.JsonValue | null) {
  const metadata = objectValue(value);
  return typeof metadata?.thumbnailStorageKey === "string" && metadata.thumbnailStorageKey.length > 0
    ? metadata.thumbnailStorageKey
    : null;
}

export function buildMediaAssetStorageCandidates(input: {
  mediaAssetId: string;
  storageKey: string;
  thumbnailStorageKey?: string | null;
  action: DestructiveStorageAction;
  reason: string;
}) {
  const candidates: AccountDeletionStorageCandidate[] = [];
  for (const access of [DestructiveStorageAccess.PUBLIC, DestructiveStorageAccess.PRIVATE] as const) {
    candidates.push({
      sourceType: "MediaAsset",
      sourceId: input.mediaAssetId,
      storageKey: input.storageKey,
      access,
      action: input.action,
      reason: input.reason
    });
    if (input.thumbnailStorageKey) {
      candidates.push({
        sourceType: "MediaAsset.thumbnail",
        sourceId: input.mediaAssetId,
        storageKey: input.thumbnailStorageKey,
        access,
        action: input.action,
        reason: input.reason
      });
    }
  }
  return candidates;
}

export function buildAccountDeletionStorageManifestRows(
  requestId: string,
  candidates: readonly AccountDeletionStorageCandidate[]
) {
  const grouped = new Map<string, AccountDeletionStorageCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.storageKey) continue;
    const key = `${candidate.access}:${candidate.storageKey}`;
    const existing = grouped.get(key);
    if (existing) existing.push(candidate);
    else grouped.set(key, [candidate]);
  }

  return [...grouped.values()].map((sources) => {
    const sortedSources = [...sources].sort((left, right) =>
      `${left.sourceType}:${left.sourceId}`.localeCompare(`${right.sourceType}:${right.sourceId}`)
    );
    const action = sortedSources.some((source) => source.action === DestructiveStorageAction.PRESERVE)
      ? DestructiveStorageAction.PRESERVE
      : DestructiveStorageAction.DELETE;
    const primary = sortedSources.find((source) => source.action === action) ?? sortedSources[0]!;
    return {
      requestId,
      sourceType: primary.sourceType,
      sourceId: primary.sourceId,
      storageKey: primary.storageKey,
      access: primary.access,
      action,
      status: DestructiveStorageStatus.PLANNED,
      retentionClass: RecordRetentionClass.VITAL,
      metadata: {
        version: 1,
        sources: sortedSources.map((source) => ({
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          storageKey: source.storageKey,
          access: source.access,
          requestedAction: source.action,
          reason: source.reason
        }))
      } satisfies Prisma.InputJsonObject
    };
  }).sort((left, right) =>
    `${left.access}:${left.storageKey}`.localeCompare(`${right.access}:${right.storageKey}`)
  );
}

function storageSourceReferenceKey(source: {
  sourceType: string;
  sourceId: string;
  storageKey: string;
  access: DestructiveStorageAccess;
}) {
  return `${source.sourceType}\u0000${source.sourceId}\u0000${source.access}\u0000${source.storageKey}`;
}

function manifestSourceReferenceKeys(rows: readonly AccountDeletionStorageManifestRow[]) {
  const references = new Set<string>();
  for (const row of rows) {
    const metadata = objectValue(row.metadata);
    const sources = Array.isArray(metadata?.sources) ? metadata.sources : [];
    let recorded = 0;
    for (const source of sources) {
      const reference = objectValue(source as Prisma.JsonValue);
      if (typeof reference?.sourceType !== "string" || typeof reference.sourceId !== "string") continue;
      references.add(storageSourceReferenceKey({
        sourceType: reference.sourceType,
        sourceId: reference.sourceId,
        storageKey: typeof reference.storageKey === "string" ? reference.storageKey : row.storageKey,
        access: reference.access === DestructiveStorageAccess.PUBLIC
          ? DestructiveStorageAccess.PUBLIC
          : row.access
      }));
      recorded += 1;
    }
    if (recorded === 0) references.add(storageSourceReferenceKey(row));
  }
  return references;
}

export function findUnmanifestedAccountDeletionStorageCandidates(
  candidates: readonly AccountDeletionStorageCandidate[],
  rows: readonly AccountDeletionStorageManifestRow[]
) {
  const references = manifestSourceReferenceKeys(rows);
  return candidates.filter((candidate) => !references.has(storageSourceReferenceKey(candidate)));
}

export function findNewlyProtectedAccountDeletionStorageCandidates(
  candidates: readonly AccountDeletionStorageCandidate[],
  rows: readonly AccountDeletionStorageManifestRow[]
) {
  const deleteObjects = new Set(rows
    .filter((row) => row.action === DestructiveStorageAction.DELETE)
    .map((row) => `${row.access}\u0000${row.storageKey}`));
  return candidates.filter((candidate) =>
    candidate.action === DestructiveStorageAction.PRESERVE &&
    deleteObjects.has(`${candidate.access}\u0000${candidate.storageKey}`)
  );
}

function protectedAssetReasons(asset: {
  metadata: Prisma.JsonValue | null;
  mailAttachments: { id: string }[];
  chatAttachments: { id: string }[];
  adCampaignImages: { id: string }[];
  adCarouselItems: { id: string }[];
  feedPosts: { id: string }[];
  feedComments: { id: string }[];
}) {
  const reasons: string[] = [];
  if (isPermanentlyProtectedMediaMetadata(asset.metadata)) reasons.push("PERMANENT_MEDIA_METADATA");
  if (asset.mailAttachments.length) reasons.push("RETAINED_MAIL_EVIDENCE");
  if (asset.chatAttachments.length) reasons.push("VITAL_CHAT_EVIDENCE");
  if (asset.adCampaignImages.length || asset.adCarouselItems.length) reasons.push("AD_CAMPAIGN_EVIDENCE");
  if (asset.feedPosts.length) reasons.push("ADMIN_POST_OR_HOLD_EVIDENCE");
  if (asset.feedComments.length) reasons.push("ADMIN_HELD_THREAD_EVIDENCE");
  return reasons;
}

async function loadAccountDeletionStorageCandidates(
  tx: Prisma.TransactionClient,
  targetUserId: string
) {
  const [assets, uploadIntents, directChatAttachments, directMailAttachments] = await Promise.all([
    tx.mediaAsset.findMany({
      where: { ownerUserId: targetUserId },
      select: {
        id: true,
        storageKey: true,
        metadata: true,
        mailAttachments: { select: { id: true }, take: 1 },
        chatAttachments: {
          where: { message: { thread: { retentionClass: RecordRetentionClass.VITAL } } },
          select: { id: true },
          take: 1
        },
        adCampaignImages: { select: { id: true }, take: 1 },
        adCarouselItems: { select: { id: true }, take: 1 },
        feedPosts: {
          where: { OR: [{ isAdminAnnouncement: true }, { adminHoldAt: { not: null } }] },
          select: { id: true },
          take: 1
        },
        feedComments: {
          where: {
            post: { adminHoldAt: { not: null } },
            OR: [{ authorUserId: targetUserId }, { post: { adminHoldThread: true } }]
          },
          select: { id: true },
          take: 1
        }
      }
    }),
    tx.uploadIntent.findMany({
      where: { ownerUserId: targetUserId },
      select: { id: true, storageKey: true, visibility: true }
    }),
    tx.chatAttachment.findMany({
      where: {
        storageKey: { not: null },
        mediaAssetId: null,
        message: { senderUserId: targetUserId }
      },
      select: {
        id: true,
        storageKey: true,
        message: { select: { thread: { select: { retentionClass: true } } } }
      }
    }),
    tx.mailAttachment.findMany({
      where: {
        storageKey: { not: null },
        mediaAssetId: null,
        message: { senderUserId: targetUserId }
      },
      select: { id: true, storageKey: true }
    })
  ]);

  const candidates: AccountDeletionStorageCandidate[] = [];
  for (const asset of assets) {
    const reasons = protectedAssetReasons(asset);
    const action = reasons.length
      ? DestructiveStorageAction.PRESERVE
      : DestructiveStorageAction.DELETE;
    const reason = reasons.join(",") || "ORDINARY_OWNED_MEDIA";
    const thumbnailStorageKey = mediaThumbnailStorageKey(asset.metadata);
    candidates.push(...buildMediaAssetStorageCandidates({
      mediaAssetId: asset.id,
      storageKey: asset.storageKey,
      thumbnailStorageKey,
      action,
      reason
    }));
  }
  for (const intent of uploadIntents) {
    candidates.push({
      sourceType: "UploadIntent",
      sourceId: intent.id,
      storageKey: intent.storageKey,
      access: storageAccess(intent.visibility),
      action: DestructiveStorageAction.DELETE,
      reason: "OWNED_UPLOAD_INTENT"
    });
  }
  for (const attachment of directChatAttachments) {
    candidates.push({
      sourceType: "ChatAttachment",
      sourceId: attachment.id,
      storageKey: attachment.storageKey!,
      access: DestructiveStorageAccess.PRIVATE,
      action: attachment.message.thread.retentionClass === RecordRetentionClass.VITAL
        ? DestructiveStorageAction.PRESERVE
        : DestructiveStorageAction.DELETE,
      reason: attachment.message.thread.retentionClass === RecordRetentionClass.VITAL
        ? "VITAL_CHAT_DIRECT_ATTACHMENT"
        : "ORDINARY_CHAT_DIRECT_ATTACHMENT"
    });
  }
  for (const attachment of directMailAttachments) {
    candidates.push({
      sourceType: "MailAttachment",
      sourceId: attachment.id,
      storageKey: attachment.storageKey!,
      access: DestructiveStorageAccess.PRIVATE,
      action: DestructiveStorageAction.PRESERVE,
      reason: "RETAINED_MAIL_DIRECT_ATTACHMENT"
    });
  }

  return candidates;
}

export async function persistAccountDeletionStorageManifest(
  tx: Prisma.TransactionClient,
  requestId: string,
  targetUserId: string
) {
  const existingCount = await tx.destructiveActionStorageObject.count({ where: { requestId } });
  if (existingCount !== 0) throw new Error("The account-deletion storage manifest already exists and is immutable.");

  const candidates = await loadAccountDeletionStorageCandidates(tx, targetUserId);
  const rows = buildAccountDeletionStorageManifestRows(requestId, candidates);
  if (rows.length) await tx.destructiveActionStorageObject.createMany({ data: rows });
  const sourceCounts = candidates.reduce<Record<string, number>>((counts, candidate) => {
    counts[candidate.sourceType] = (counts[candidate.sourceType] ?? 0) + 1;
    return counts;
  }, {});
  return {
    version: 1,
    immutable: true,
    totalObjects: rows.length,
    deleteObjects: rows.filter((row) => row.action === DestructiveStorageAction.DELETE).length,
    preserveObjects: rows.filter((row) => row.action === DestructiveStorageAction.PRESERVE).length,
    sourceCounts
  } satisfies Prisma.InputJsonObject;
}

async function reconcileAccountDeletionStorageSources(
  tx: Prisma.TransactionClient,
  requestId: string,
  targetUserId: string
) {
  const requests = await tx.$queryRaw<Array<{ id: string; status: DestructiveActionStatus }>>(Prisma.sql`
    SELECT "id", "status"
    FROM "DestructiveActionRequest"
    WHERE "id" = ${requestId}
    FOR UPDATE
  `);
  if (requests[0]?.status !== DestructiveActionStatus.RUNNING) {
    throw new Error("Account cleanup request changed while storage sources were being reconciled.");
  }
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "FeedPost"
    WHERE "authorUserId" = ${targetUserId}
      OR "targetProfileUserId" = ${targetUserId}
      OR "mediaAssetId" IN (SELECT "id" FROM "MediaAsset" WHERE "ownerUserId" = ${targetUserId})
      OR "id" IN (
        SELECT "postId"
        FROM "FeedComment"
        WHERE "authorUserId" = ${targetUserId}
          OR "mediaAssetId" IN (SELECT "id" FROM "MediaAsset" WHERE "ownerUserId" = ${targetUserId})
          OR "id" IN (SELECT "commentId" FROM "FeedCommentReaction" WHERE "userId" = ${targetUserId})
          OR "id" IN (SELECT "commentId" FROM "FeedCommentHashtag" WHERE "taggedByUserId" = ${targetUserId})
          OR "mediaAssetId" IN (
            SELECT "mediaAssetId" FROM "MediaAssetHashtag" WHERE "taggedByUserId" = ${targetUserId}
          )
      )
      OR "id" IN (SELECT "postId" FROM "FeedPostReaction" WHERE "userId" = ${targetUserId})
      OR "id" IN (SELECT "postId" FROM "FeedPostHashtag" WHERE "taggedByUserId" = ${targetUserId})
      OR "id" IN (SELECT "postId" FROM "FeedPostDismissal" WHERE "userId" = ${targetUserId})
      OR "mediaAssetId" IN (
        SELECT "mediaAssetId" FROM "MediaAssetHashtag" WHERE "taggedByUserId" = ${targetUserId}
      )
    ORDER BY "id"
    FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "FeedComment"
    WHERE "authorUserId" = ${targetUserId}
      OR "mediaAssetId" IN (SELECT "id" FROM "MediaAsset" WHERE "ownerUserId" = ${targetUserId})
      OR "id" IN (SELECT "commentId" FROM "FeedCommentReaction" WHERE "userId" = ${targetUserId})
      OR "id" IN (SELECT "commentId" FROM "FeedCommentHashtag" WHERE "taggedByUserId" = ${targetUserId})
      OR "mediaAssetId" IN (
        SELECT "mediaAssetId" FROM "MediaAssetHashtag" WHERE "taggedByUserId" = ${targetUserId}
      )
    ORDER BY "id"
    FOR UPDATE
  `);
  const users = await tx.$queryRaw<Array<{
    id: string;
    deactivatedAt: Date | null;
    sessionsRevokedAt: Date | null;
  }>>(Prisma.sql`
    SELECT "id", "deactivatedAt", "sessionsRevokedAt"
    FROM "User"
    WHERE "id" = ${targetUserId}
    FOR UPDATE
  `);
  if (!users[0]?.deactivatedAt || !users[0].sessionsRevokedAt) {
    throw new Error("Account cleanup requires the target account to remain deactivated with sessions revoked.");
  }

  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "MediaAsset" WHERE "ownerUserId" = ${targetUserId} FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "UploadIntent" WHERE "ownerUserId" = ${targetUserId} FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "ChatMessage" WHERE "senderUserId" = ${targetUserId} FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "MailMessage" WHERE "senderUserId" = ${targetUserId} FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "ChatAttachment"
    WHERE "messageId" IN (SELECT "id" FROM "ChatMessage" WHERE "senderUserId" = ${targetUserId})
    FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "MailAttachment"
    WHERE "messageId" IN (SELECT "id" FROM "MailMessage" WHERE "senderUserId" = ${targetUserId})
    FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT thread."id"
    FROM "ChatThread" thread
    WHERE EXISTS (
      SELECT 1 FROM "ChatParticipant" participant
      WHERE participant."threadId" = thread."id" AND participant."userId" = ${targetUserId}
    ) OR EXISTS (
      SELECT 1 FROM "ChatMessage" message
      WHERE message."threadId" = thread."id" AND message."senderUserId" = ${targetUserId}
    )
    FOR UPDATE OF thread
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT thread."id"
    FROM "EncryptedChatThread" thread
    WHERE EXISTS (
      SELECT 1 FROM "EncryptedChatParticipant" participant
      WHERE participant."threadId" = thread."id" AND participant."userId" = ${targetUserId}
    ) OR EXISTS (
      SELECT 1 FROM "EncryptedChatMessage" message
      WHERE message."threadId" = thread."id" AND message."senderUserId" = ${targetUserId}
    )
    FOR UPDATE OF thread
  `);
  const [candidates, rows] = await Promise.all([
    loadAccountDeletionStorageCandidates(tx, targetUserId),
    tx.destructiveActionStorageObject.findMany({
      where: { requestId },
      select: {
        sourceType: true,
        sourceId: true,
        storageKey: true,
        access: true,
        action: true,
        metadata: true
      }
    })
  ]);
  const unmanifested = findUnmanifestedAccountDeletionStorageCandidates(candidates, rows);
  if (unmanifested.length) {
    const first = unmanifested[0]!;
    throw new Error(
      `Account cleanup found ${unmanifested.length} unmanifested storage source(s); first is ` +
      `${first.sourceType}:${first.sourceId}:${first.access}:${first.storageKey}.`
    );
  }
  const newlyProtected = findNewlyProtectedAccountDeletionStorageCandidates(candidates, rows);
  if (newlyProtected.length) {
    const first = newlyProtected[0]!;
    throw new Error(
      `Account cleanup found ${newlyProtected.length} manifest DELETE source(s) that are now protected; first is ` +
      `${first.sourceType}:${first.sourceId}:${first.access}:${first.storageKey}.`
    );
  }
  return { candidates, rows };
}

async function loadCleanupScope(targetUserId: string, requestId: string) {
  const linkedHeldPostWhere = {
    adminHoldAt: { not: null },
    OR: [
      { authorUserId: targetUserId },
      { targetProfileUserId: targetUserId },
      { mediaAsset: { ownerUserId: targetUserId } },
      { mediaAsset: { hashtags: { some: { taggedByUserId: targetUserId } } } },
      { reactions: { some: { userId: targetUserId } } },
      { dismissals: { some: { userId: targetUserId } } },
      { hashtags: { some: { taggedByUserId: targetUserId } } },
      {
        comments: {
          some: {
            OR: [
              { authorUserId: targetUserId },
              { mediaAsset: { ownerUserId: targetUserId } },
              { mediaAsset: { hashtags: { some: { taggedByUserId: targetUserId } } } },
              { reactions: { some: { userId: targetUserId } } },
              { hashtags: { some: { taggedByUserId: targetUserId } } }
            ]
          }
        }
      }
    ]
  } satisfies Prisma.FeedPostWhereInput;
  const [assets, uploadIntents, manifest, heldEvidence] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: { ownerUserId: targetUserId },
      select: { id: true }
    }),
    prisma.uploadIntent.findMany({
      where: { ownerUserId: targetUserId },
      select: { id: true }
    }),
    prisma.destructiveActionStorageObject.findMany({
      where: { requestId },
      select: {
        sourceType: true,
        sourceId: true,
        action: true,
        metadata: true
      }
    }),
    Promise.all([
      prisma.feedPost.count({
        where: linkedHeldPostWhere
      }),
      prisma.feedComment.count({ where: { authorUserId: targetUserId, post: { adminHoldAt: { not: null } } } }),
      prisma.feedPostReaction.count({ where: { userId: targetUserId, post: { adminHoldAt: { not: null } } } }),
      prisma.feedCommentReaction.count({
        where: { userId: targetUserId, comment: { post: { adminHoldAt: { not: null } } } }
      }),
      prisma.feedPostHashtag.count({
        where: { taggedByUserId: targetUserId, post: { adminHoldAt: { not: null } } }
      }),
      prisma.feedCommentHashtag.count({
        where: { taggedByUserId: targetUserId, comment: { post: { adminHoldAt: { not: null } } } }
      }),
      prisma.feedPostDismissal.count({
        where: { userId: targetUserId, post: { adminHoldAt: { not: null } } }
      }),
      prisma.mediaAssetHashtag.count({
        where: {
          taggedByUserId: targetUserId,
          mediaAsset: {
            OR: [
              { feedPosts: { some: { adminHoldAt: { not: null } } } },
              { feedComments: { some: { post: { adminHoldAt: { not: null } } } } }
            ]
          }
        }
      }),
      prisma.feedPost.count({
        where: {
          ...linkedHeldPostWhere,
          adminHoldThread: true
        }
      })
    ])
  ]);
  const sourceActions = new Map<string, DestructiveStorageAction>();
  const heldMediaAssetIds = new Set<string>();
  const recordSourceAction = (sourceType: string, sourceId: string, action: DestructiveStorageAction) => {
    const key = `${sourceType}:${sourceId}`;
    const existing = sourceActions.get(key);
    sourceActions.set(
      key,
      existing === DestructiveStorageAction.PRESERVE || action === DestructiveStorageAction.PRESERVE
        ? DestructiveStorageAction.PRESERVE
        : DestructiveStorageAction.DELETE
    );
  };
  for (const object of manifest) {
    const metadata = objectValue(object.metadata);
    const sources = Array.isArray(metadata?.sources) ? metadata.sources : [];
    let recordedSources = 0;
    for (const source of sources) {
      const reference = objectValue(source as Prisma.JsonValue);
      if (
        typeof reference?.sourceType === "string" &&
        typeof reference.sourceId === "string" &&
        (reference.requestedAction === DestructiveStorageAction.DELETE ||
          reference.requestedAction === DestructiveStorageAction.PRESERVE)
      ) {
        recordSourceAction(reference.sourceType, reference.sourceId, reference.requestedAction);
        if (
          reference.sourceType.startsWith("MediaAsset") &&
          typeof reference.reason === "string" &&
          reference.reason.includes("ADMIN_")
        ) heldMediaAssetIds.add(reference.sourceId);
        recordedSources += 1;
      }
    }
    if (recordedSources === 0) recordSourceAction(object.sourceType, object.sourceId, object.action);
  }
  const purgeAssets = assets.filter((asset) =>
    sourceActions.get(`MediaAsset:${asset.id}`) === DestructiveStorageAction.DELETE
  );
  const deleteUploadIntents = uploadIntents.filter((intent) =>
    sourceActions.get(`UploadIntent:${intent.id}`) === DestructiveStorageAction.DELETE
  );
  return {
    purgeAssetIds: purgeAssets.map((asset) => asset.id),
    protectedAssetCount: assets.length - purgeAssets.length,
    deleteUploadIntentIds: deleteUploadIntents.map((intent) => intent.id),
    heldEvidence: {
      posts: heldEvidence[0],
      comments: heldEvidence[1],
      postReactions: heldEvidence[2],
      commentReactions: heldEvidence[3],
      postHashtags: heldEvidence[4],
      commentHashtags: heldEvidence[5],
      dismissals: heldEvidence[6],
      mediaHashtags: heldEvidence[7],
      mediaAssets: heldMediaAssetIds.size,
      fullThreads: heldEvidence[8]
    }
  };
}

type CountResult = { count: number };

function addCount(counts: Record<string, number>, key: string, result: CountResult) {
  counts[key] = (counts[key] ?? 0) + result.count;
}

function canonicalSnapshotJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalSnapshotJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalSnapshotJson(object[key])}`
  ).join(",")}}`;
}

export function hashAccountDeletionSnapshot(value: unknown) {
  return createHash("sha256").update(canonicalSnapshotJson(value), "utf8").digest("hex");
}

function snapshotJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(snapshotJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, snapshotJsonValue(entry)]));
  }
  return value;
}

export function buildAdCampaignAccountDeletionTargetSnapshot(
  capturedAt: Date,
  inputs: readonly { type: string; id: string; content: unknown }[]
) {
  const targets = inputs.map((input) => {
    const content = snapshotJsonValue(input.content);
    return {
      type: input.type,
      id: input.id,
      sha256: hashAccountDeletionSnapshot(content),
      content
    };
  });
  return {
    version: 1,
    reason: "ACCOUNT_DELETION",
    capturedAt: capturedAt.toISOString(),
    sha256: hashAccountDeletionSnapshot(targets),
    targets
  } as unknown as Prisma.InputJsonObject;
}

export async function snapshotAdCampaignTargetsForAccountDeletion(
  tx: Prisma.TransactionClient,
  targetUserId: string,
  capturedAt: Date
) {
  const campaigns = await tx.adCampaign.findMany({
    where: {
      OR: [
        { marketListing: { sellerUserId: targetUserId } },
        { businessArticle: { ownerUserId: targetUserId } },
        { subscriberTargetManuscript: { authorUserId: targetUserId } }
      ]
    },
    select: {
      id: true,
      targetSnapshot: true,
      targetSnapshotAt: true,
      marketListing: {
        select: {
          id: true,
          slug: true,
          sellerUserId: true,
          title: true,
          description: true,
          category: true,
          location: true,
          contactEmail: true,
          contactPhone: true,
          contactNotes: true,
          allowMessages: true,
          carouselEnabled: true,
          priceCents: true,
          currency: true,
          status: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          photos: {
            select: { id: true, mediaAssetId: true, sortOrder: true, createdAt: true },
            orderBy: { sortOrder: "asc" }
          }
        }
      },
      businessArticle: {
        select: {
          id: true,
          ownerUserId: true,
          businessProfileId: true,
          coverMediaAssetId: true,
          slug: true,
          title: true,
          summary: true,
          body: true,
          published: true,
          createdAt: true,
          updatedAt: true
        }
      },
      subscriberTargetManuscript: {
        select: {
          id: true,
          slug: true,
          authorUserId: true,
          title: true,
          genre: true,
          summary: true,
          visibility: true,
          publishToStorefront: true,
          createdAt: true,
          updatedAt: true,
          chapters: {
            select: {
              id: true,
              title: true,
              bodyText: true,
              bodyHtml: true,
              wordCount: true,
              sortOrder: true,
              publishedAt: true,
              autosavedAt: true,
              createdAt: true,
              updatedAt: true
            },
            orderBy: { sortOrder: "asc" }
          }
        }
      }
    }
  });

  let snapshotCount = 0;
  let existingSnapshotCount = 0;
  const targetCounts = { marketListings: 0, businessArticles: 0, manuscripts: 0 };
  const campaignSeals: Array<{
    campaignId: string;
    snapshotAt: string | null;
    sha256: string;
    targets: Array<{ type: string; id: string }>;
  }> = [];
  for (const campaign of campaigns) {
    if (campaign.targetSnapshot !== null) {
      const existing = objectValue(campaign.targetSnapshot);
      const targets = Array.isArray(existing?.targets) ? existing.targets : null;
      if (
        typeof existing?.sha256 !== "string" ||
        !targets ||
        hashAccountDeletionSnapshot(targets) !== existing.sha256
      ) {
        throw new Error(`Ad campaign ${campaign.id} has an invalid pre-existing target snapshot.`);
      }
      campaignSeals.push({
        campaignId: campaign.id,
        snapshotAt: campaign.targetSnapshotAt?.toISOString() ?? null,
        sha256: existing.sha256,
        targets: targets.map((target) => {
          const value = objectValue(target as Prisma.JsonValue);
          if (typeof value?.type !== "string" || typeof value.id !== "string") {
            throw new Error(`Ad campaign ${campaign.id} has an invalid pre-existing target reference.`);
          }
          return { type: value.type, id: value.id };
        })
      });
      existingSnapshotCount += 1;
      continue;
    }
    const targets: Array<{ type: string; id: string; content: unknown }> = [];
    if (campaign.marketListing) {
      const content = campaign.marketListing;
      targets.push({ type: "MARKET_LISTING", id: content.id, content });
    }
    if (campaign.businessArticle) {
      const content = campaign.businessArticle;
      targets.push({ type: "BUSINESS_ARTICLE", id: content.id, content });
    }
    if (campaign.subscriberTargetManuscript) {
      const content = campaign.subscriberTargetManuscript;
      targets.push({ type: "WRITER_MANUSCRIPT", id: content.id, content });
    }
    if (!targets.length) continue;
    const snapshot = buildAdCampaignAccountDeletionTargetSnapshot(capturedAt, targets);
    const updated = await tx.adCampaign.updateMany({
      where: { id: campaign.id, targetSnapshot: { equals: Prisma.DbNull } },
      data: { targetSnapshot: snapshot, targetSnapshotAt: capturedAt }
    });
    snapshotCount += updated.count;
    if (updated.count === 1) {
      campaignSeals.push({
        campaignId: campaign.id,
        snapshotAt: capturedAt.toISOString(),
        sha256: snapshot.sha256 as string,
        targets: targets.map((target) => ({ type: target.type, id: target.id }))
      });
      for (const target of targets) {
        if (target.type === "MARKET_LISTING") targetCounts.marketListings += 1;
        if (target.type === "BUSINESS_ARTICLE") targetCounts.businessArticles += 1;
        if (target.type === "WRITER_MANUSCRIPT") targetCounts.manuscripts += 1;
      }
    }
  }
  return {
    version: 1,
    capturedAt: capturedAt.toISOString(),
    campaignsSnapshotted: snapshotCount,
    campaignsAlreadySnapshotted: existingSnapshotCount,
    campaignsSealed: campaignSeals.length,
    campaigns: campaignSeals,
    targetCounts
  } satisfies Prisma.InputJsonObject;
}

async function verifyAdCampaignTargetSnapshotSeal(summary: Prisma.JsonObject, targetUserId: string) {
  const campaignSeals = Array.isArray(summary.campaigns) ? summary.campaigns : [];
  const sealedCampaignIds = new Set<string>();
  for (const sealValue of campaignSeals) {
    const seal = objectValue(sealValue as Prisma.JsonValue);
    if (typeof seal?.campaignId !== "string" || typeof seal.sha256 !== "string") {
      throw new Error("Account cleanup contains an invalid ad-target snapshot seal.");
    }
    sealedCampaignIds.add(seal.campaignId);
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: seal.campaignId },
      select: { targetSnapshot: true }
    });
    const snapshot = objectValue(campaign?.targetSnapshot ?? null);
    const targets = Array.isArray(snapshot?.targets) ? snapshot.targets : null;
    if (
      typeof snapshot?.sha256 !== "string" ||
      snapshot.sha256 !== seal.sha256 ||
      !targets ||
      hashAccountDeletionSnapshot(targets) !== snapshot.sha256
    ) {
      throw new Error(`Ad campaign ${seal.campaignId} no longer matches its target snapshot seal.`);
    }
  }
  const currentlyLinkedCampaigns = await prisma.adCampaign.findMany({
    where: {
      OR: [
        { marketListing: { sellerUserId: targetUserId } },
        { businessArticle: { ownerUserId: targetUserId } },
        { subscriberTargetManuscript: { authorUserId: targetUserId } }
      ]
    },
    select: { id: true }
  });
  const unsealedCampaignIds = currentlyLinkedCampaigns
    .map((campaign) => campaign.id)
    .filter((campaignId) => !sealedCampaignIds.has(campaignId));
  if (unsealedCampaignIds.length) {
    throw new Error(
      `Account cleanup stopped because ${unsealedCampaignIds.length} ad campaign target(s) were linked after confirmation.`
    );
  }
}

async function storageManifestSummary(requestId: string) {
  const objects = await prisma.destructiveActionStorageObject.findMany({
    where: { requestId },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      storageKey: true,
      access: true,
      action: true,
      status: true,
      attemptCount: true,
      lastError: true,
      acknowledgedAt: true,
      verifiedAt: true
    },
    orderBy: [{ access: "asc" }, { storageKey: "asc" }]
  });
  const deleteObjects = objects.filter((object) => object.action === DestructiveStorageAction.DELETE);
  const statusCounts = deleteObjects.reduce<Record<string, number>>((counts, object) => {
    counts[object.status] = (counts[object.status] ?? 0) + 1;
    return counts;
  }, {});
  const outstandingObjects = deleteObjects
    .filter((object) => object.status !== DestructiveStorageStatus.VERIFIED)
    .map((object) => ({
      id: object.id,
      sourceType: object.sourceType,
      sourceId: object.sourceId,
      storageKey: object.storageKey,
      access: object.access,
      status: object.status,
      attempts: object.attemptCount,
      error: object.lastError
    }));
  return {
    manifestVersion: 1,
    totalObjects: objects.length,
    preserveObjects: objects.length - deleteObjects.length,
    deleteObjects: deleteObjects.length,
    deleteStatusCounts: {
      planned: statusCounts[DestructiveStorageStatus.PLANNED] ?? 0,
      acknowledged: statusCounts[DestructiveStorageStatus.DELETE_ACKNOWLEDGED] ?? 0,
      verified: statusCounts[DestructiveStorageStatus.VERIFIED] ?? 0,
      failed: statusCounts[DestructiveStorageStatus.FAILED] ?? 0
    },
    deleteAttempts: deleteObjects.reduce((sum, object) => sum + object.attemptCount, 0),
    allDeleteObjectsVerified: deleteObjects.every((object) => object.status === DestructiveStorageStatus.VERIFIED),
    outstandingObjects
  } satisfies Prisma.InputJsonObject;
}

async function processStorageManifest(
  requestId: string,
  targetUserId: string,
  context: PlatformJobHandlerContext
) {
  const objects = await prisma.destructiveActionStorageObject.findMany({
    where: { requestId, action: DestructiveStorageAction.DELETE },
    orderBy: [{ access: "asc" }, { storageKey: "asc" }]
  });

  for (const object of objects) {
    await context.assertLease();
    if (object.status === DestructiveStorageStatus.VERIFIED) continue;

    if (
      object.status === DestructiveStorageStatus.DELETE_ACKNOWLEDGED ||
      object.status === DestructiveStorageStatus.FAILED
    ) {
      const reconciled = await verifyR2ObjectAbsent(object.storageKey, r2StorageAccess(object.access));
      if (reconciled.ok) {
        await prisma.destructiveActionStorageObject.update({
          where: { id: object.id },
          data: {
            status: DestructiveStorageStatus.VERIFIED,
            verifiedAt: new Date(),
            lastError: null
          }
        });
        continue;
      }
    }

    await prisma.$transaction(
      (tx) => reconcileAccountDeletionStorageSources(tx, requestId, targetUserId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    await context.assertLease();
    const attemptedAt = new Date();
    try {
      await deleteR2Object(object.storageKey, r2StorageAccess(object.access));
      await prisma.destructiveActionStorageObject.update({
        where: { id: object.id },
        data: {
          status: DestructiveStorageStatus.DELETE_ACKNOWLEDGED,
          attemptCount: { increment: 1 },
          attemptedAt,
          acknowledgedAt: new Date(),
          verifiedAt: null,
          lastError: null
        }
      });
    } catch (error) {
      await prisma.destructiveActionStorageObject.update({
        where: { id: object.id },
        data: {
          status: DestructiveStorageStatus.FAILED,
          attemptCount: { increment: 1 },
          attemptedAt,
          verifiedAt: null,
          lastError: error instanceof Error ? error.message : "Storage deletion failed."
        }
      });
      continue;
    }

    const verification = await verifyR2ObjectAbsent(object.storageKey, r2StorageAccess(object.access));
    await prisma.destructiveActionStorageObject.update({
      where: { id: object.id },
      data: verification.ok
        ? {
            status: DestructiveStorageStatus.VERIFIED,
            verifiedAt: new Date(),
            lastError: null
          }
        : {
            status: DestructiveStorageStatus.FAILED,
            verifiedAt: null,
            lastError: verification.error
          }
    });
  }

  const summary = await storageManifestSummary(requestId);
  if (!summary.allDeleteObjectsVerified) {
    throw new Error(
      `Storage manifest verification is incomplete for ${summary.outstandingObjects.length} DELETE object(s).`
    );
  }
  return summary;
}

async function reverifyCompletedStorageManifest(
  requestId: string,
  context: PlatformJobHandlerContext
) {
  const objects = await prisma.destructiveActionStorageObject.findMany({
    where: {
      requestId,
      action: DestructiveStorageAction.DELETE,
      status: DestructiveStorageStatus.VERIFIED
    },
    orderBy: [{ access: "asc" }, { storageKey: "asc" }]
  });
  for (const object of objects) {
    await context.assertLease();
    const verification = await verifyR2ObjectAbsent(object.storageKey, r2StorageAccess(object.access));
    if (verification.ok) {
      await prisma.destructiveActionStorageObject.update({
        where: { id: object.id },
        data: { verifiedAt: new Date(), lastError: null }
      });
      continue;
    }
    await prisma.destructiveActionStorageObject.update({
      where: { id: object.id },
      data: {
        status: DestructiveStorageStatus.FAILED,
        verifiedAt: null,
        lastError: `Previously verified storage object reappeared: ${verification.error}`
      }
    });
    throw new Error(`Storage object ${object.id} no longer satisfies its verified-absent state.`);
  }
}

async function purgeOrdinaryData(
  tx: Prisma.TransactionClient,
  targetUserId: string,
  now: Date,
  scope: Awaited<ReturnType<typeof loadCleanupScope>>
) {
  const counts: Record<string, number> = {};

  addCount(counts, "feedPostsHidden", await tx.feedPost.updateMany({
    where: { authorUserId: targetUserId, isAdminAnnouncement: false, adminHoldAt: null },
    data: { body: DELETED_BODY, mediaAssetId: null, targetProfileUserId: null, streamDeletedAt: now }
  }));
  addCount(counts, "profileTargetPostsHidden", await tx.feedPost.updateMany({
    where: { targetProfileUserId: targetUserId, adminHoldAt: null },
    data: { targetProfileUserId: null, streamDeletedAt: now }
  }));
  addCount(counts, "feedCommentsAnonymized", await tx.feedComment.updateMany({
    where: { authorUserId: targetUserId, post: { adminHoldAt: null } },
    data: { body: DELETED_BODY, mediaAssetId: null, deletedAt: now }
  }));
  addCount(counts, "galleryCommentsAnonymized", await tx.galleryAssetComment.updateMany({
    where: { authorUserId: targetUserId },
    data: { body: DELETED_BODY, deletedAt: now }
  }));
  addCount(counts, "groupThreadsAnonymized", await tx.groupForumThread.updateMany({
    where: { authorUserId: targetUserId },
    data: { title: "Deleted topic", body: DELETED_BODY, deletedAt: now, endedAt: now }
  }));
  addCount(counts, "groupPostsAnonymized", await tx.groupForumPost.updateMany({
    where: { authorUserId: targetUserId },
    data: { body: DELETED_BODY, mediaAssetId: null, deletedAt: now }
  }));
  addCount(counts, "groupAssetCommentsAnonymized", await tx.groupAssetComment.updateMany({
    where: { authorUserId: targetUserId },
    data: { body: DELETED_BODY, deletedAt: now }
  }));
  addCount(counts, "storefrontTopicsAnonymized", await tx.storefrontForumTopic.updateMany({
    where: { authorUserId: targetUserId },
    data: { authorUserId: null, guestName: "Deleted account", title: "Deleted topic", body: DELETED_BODY, imageUrl: null, deletedAt: now }
  }));
  addCount(counts, "storefrontPostsAnonymized", await tx.storefrontForumPost.updateMany({
    where: { authorUserId: targetUserId },
    data: { authorUserId: null, guestName: "Deleted account", body: DELETED_BODY, imageUrl: null, deletedAt: now }
  }));

  const deletions: Array<[string, Promise<CountResult>]> = [
    ["marketListingsDeleted", tx.marketListing.deleteMany({ where: { sellerUserId: targetUserId } })],
    ["jobListingsDeleted", tx.jobListing.deleteMany({ where: { employerUserId: targetUserId } })],
    ["manuscriptsDeleted", tx.writerManuscript.deleteMany({ where: { authorUserId: targetUserId } })],
    ["writerSubscriptionsDeleted", tx.writerManuscriptSubscription.deleteMany({ where: { userId: targetUserId } })],
    ["groupAssetsDeleted", tx.groupAsset.deleteMany({ where: { uploaderUserId: targetUserId } })],
    ["groupMembershipsDeleted", tx.groupMember.deleteMany({ where: { userId: targetUserId } })],
    ["groupJoinRequestsDeleted", tx.groupJoinRequest.deleteMany({ where: { requesterUserId: targetUserId } })],
    ["groupPinsDeleted", tx.groupUserPin.deleteMany({ where: { userId: targetUserId } })],
    ["eventModerationsDeleted", tx.eventModerator.deleteMany({ where: { userId: targetUserId } })],
    ["eventInvitationsDeleted", tx.eventInvitation.deleteMany({ where: { inviteeUserId: targetUserId } })],
    ["eventRsvpsDeleted", tx.eventRsvp.deleteMany({ where: { userId: targetUserId } })],
    ["socialRelationshipsDeleted", tx.socialRelationship.deleteMany({ where: { OR: [{ fromUserId: targetUserId }, { toUserId: targetUserId }] } })],
    ["familyRequestsDeleted", tx.familyRelationshipRequest.deleteMany({ where: { OR: [{ requesterUserId: targetUserId }, { targetUserId }] } })],
    ["friendRequestsDeleted", tx.friendRelationshipRequest.deleteMany({ where: { OR: [{ requesterUserId: targetUserId }, { targetUserId }] } })],
    ["notificationsDeleted", tx.notification.deleteMany({ where: { userId: targetUserId } })],
    ["alertsDeleted", tx.alert.deleteMany({ where: { userId: targetUserId } })],
    ["feedReactionsDeleted", tx.feedPostReaction.deleteMany({
      where: { userId: targetUserId, post: { adminHoldAt: null } }
    })],
    ["feedCommentReactionsDeleted", tx.feedCommentReaction.deleteMany({
      where: { userId: targetUserId, comment: { post: { adminHoldAt: null } } }
    })],
    ["feedDismissalsDeleted", tx.feedPostDismissal.deleteMany({
      where: { userId: targetUserId, post: { adminHoldAt: null } }
    })],
    ["galleryReactionsDeleted", tx.galleryAssetReaction.deleteMany({ where: { userId: targetUserId } })],
    ["galleryCommentReactionsDeleted", tx.galleryAssetCommentReaction.deleteMany({ where: { userId: targetUserId } })],
    ["groupThreadReactionsDeleted", tx.groupForumThreadReaction.deleteMany({ where: { userId: targetUserId } })],
    ["groupPostReactionsDeleted", tx.groupForumPostReaction.deleteMany({ where: { userId: targetUserId } })],
    ["hashtagsDeleted", tx.mediaAssetHashtag.deleteMany({
      where: {
        taggedByUserId: targetUserId,
        mediaAsset: {
          feedPosts: { none: { adminHoldAt: { not: null } } },
          feedComments: { none: { post: { adminHoldAt: { not: null } } } }
        }
      }
    })],
    ["feedPostHashtagsDeleted", tx.feedPostHashtag.deleteMany({
      where: { taggedByUserId: targetUserId, post: { adminHoldAt: null } }
    })],
    ["feedCommentHashtagsDeleted", tx.feedCommentHashtag.deleteMany({
      where: { taggedByUserId: targetUserId, comment: { post: { adminHoldAt: null } } }
    })],
    ["hashtagSignalsDeleted", tx.userHashtagSignal.deleteMany({ where: { userId: targetUserId } })],
    ["mediaCollectionsDeleted", tx.mediaCollection.deleteMany({ where: { ownerUserId: targetUserId } })],
    ["auditorProfilesDeleted", tx.auditorProfile.deleteMany({ where: { userId: targetUserId } })],
    ["auditorSeekerProfilesDeleted", tx.auditorSeekerProfile.deleteMany({ where: { userId: targetUserId } })],
    ["membershipOverridesDeleted", tx.membershipPolicyOverride.deleteMany({ where: { userId: targetUserId } })],
    ["upgradeOffersDeleted", tx.membershipUpgradeOffer.deleteMany({ where: { userId: targetUserId } })],
    ["upgradeEligibilitiesDeleted", tx.membershipTierUpgradeEligibility.deleteMany({ where: { userId: targetUserId } })],
    ["promotionGrantsDeleted", tx.membershipPromotionGrant.deleteMany({ where: { userId: targetUserId } })],
    ["interestsDeleted", tx.userInterest.deleteMany({ where: { userId: targetUserId } })],
    ["usageMetricsDeleted", tx.userApplicationUsageMetric.deleteMany({ where: { userId: targetUserId } })],
    ["verificationTokensDeleted", tx.emailVerificationToken.deleteMany({ where: { userId: targetUserId } })],
    ["passwordResetTokensDeleted", tx.passwordResetToken.deleteMany({ where: { userId: targetUserId } })],
    ["twoFactorConfigDeleted", tx.twoFactorConfig.deleteMany({ where: { userId: targetUserId } })],
    ["diagnosticsDeleted", tx.diagnosticLog.deleteMany({ where: { userId: targetUserId } })],
    ["activityEventsDeleted", tx.platformActivityEvent.deleteMany({ where: { userId: targetUserId } })]
  ];
  for (const [key, operation] of deletions) addCount(counts, key, await operation);

  addCount(counts, "ordinaryChatReactionsDeleted", await tx.chatMessageReaction.deleteMany({
    where: {
      userId: targetUserId,
      message: { thread: { retentionClass: RecordRetentionClass.STANDARD } }
    }
  }));
  addCount(counts, "ordinaryChatMessagesDeleted", await tx.chatMessage.deleteMany({
    where: {
      senderUserId: targetUserId,
      thread: { retentionClass: RecordRetentionClass.STANDARD }
    }
  }));
  addCount(counts, "ordinaryChatParticipationsDeleted", await tx.chatParticipant.deleteMany({
    where: {
      userId: targetUserId,
      thread: { retentionClass: RecordRetentionClass.STANDARD }
    }
  }));
  addCount(counts, "ordinaryEncryptedEnvelopesDeleted", await tx.encryptedChatEnvelope.deleteMany({
    where: {
      recipientUserId: targetUserId,
      message: { thread: { retentionClass: RecordRetentionClass.STANDARD } }
    }
  }));
  addCount(counts, "ordinaryEncryptedMessagesDeleted", await tx.encryptedChatMessage.deleteMany({
    where: {
      senderUserId: targetUserId,
      thread: { retentionClass: RecordRetentionClass.STANDARD }
    }
  }));
  addCount(counts, "ordinaryEncryptedParticipationsDeleted", await tx.encryptedChatParticipant.deleteMany({
    where: {
      userId: targetUserId,
      thread: { retentionClass: RecordRetentionClass.STANDARD }
    }
  }));

  addCount(counts, "mediaAssetsDeleted", await tx.mediaAsset.deleteMany({
    where: {
      ownerUserId: targetUserId,
      id: { in: scope.purgeAssetIds },
      mailAttachments: { none: {} },
      chatAttachments: {
        none: { message: { thread: { retentionClass: RecordRetentionClass.VITAL } } }
      },
      adCampaignImages: { none: {} },
      adCarouselItems: { none: {} },
      feedPosts: {
        none: { OR: [{ isAdminAnnouncement: true }, { adminHoldAt: { not: null } }] }
      },
      feedComments: {
        none: {
          post: { adminHoldAt: { not: null } },
          OR: [{ authorUserId: targetUserId }, { post: { adminHoldThread: true } }]
        }
      }
    }
  }));
  addCount(counts, "uploadIntentsDeleted", await tx.uploadIntent.deleteMany({
    where: { ownerUserId: targetUserId, id: { in: scope.deleteUploadIntentIds } }
  }));

  addCount(counts, "resumesDeleted", await tx.userResume.deleteMany({ where: { userId: targetUserId } }));
  addCount(counts, "scientologyProfilesDeleted", await tx.scientologyProfile.deleteMany({ where: { userId: targetUserId } }));
  addCount(counts, "profilesAnonymized", await tx.profile.updateMany({
    where: { userId: targetUserId },
    data: {
      displayName: "Deleted account",
      tagline: null,
      bio: null,
      avatarUrl: null,
      bannerUrl: null,
      location: null,
      theme: Prisma.DbNull,
      allowProfilePosts: false
    }
  }));

  const devices = await tx.userDevice.findMany({ where: { userId: targetUserId }, select: { id: true } });
  for (const device of devices) {
    await tx.userDevice.update({
      where: { id: device.id },
      data: {
        deviceId: `deleted:${device.id}`,
        publicKey: `deleted:${device.id}`,
        revokedAt: now,
        appVersion: null
      }
    });
  }
  await tx.mailMessage.updateMany({
    where: { senderUserId: targetUserId },
    data: { senderIdentitySnapshot: "Deleted account" }
  });
  await tx.mailRecipient.updateMany({
    where: { userId: targetUserId },
    data: { recipientIdentitySnapshot: "Deleted account", archivedAt: now }
  });
  await tx.mailContact.updateMany({
    where: { OR: [{ ownerUserId: targetUserId }, { contactUserId: targetUserId }] },
    data: { displayName: "Deleted account", notes: null }
  });
  await tx.feedbackTicket.updateMany({
    where: { reporterUserId: targetUserId },
    data: { reporterUserId: null, reporterEmail: null, pageUrl: null, userAgent: null, diagnostics: Prisma.DbNull }
  });
  await tx.deliveryOutbox.updateMany({
    where: {
      recipientUserId: targetUserId,
      status: { in: [DeliveryOutboxStatus.PENDING, DeliveryOutboxStatus.PROCESSING] }
    },
    data: {
      status: DeliveryOutboxStatus.CANCELLED,
      lockedAt: null,
      lockedBy: null,
      error: "Recipient account deleted before delivery."
    }
  });
  await tx.freeAccountInviteCode.updateMany({
    where: { OR: [{ assignedUserId: targetUserId }, { usedByUserId: targetUserId }] },
    data: { assignedUserId: null, usedByUserId: null, recipientEmail: null }
  });
  await tx.group.updateMany({
    where: { createdByUserId: targetUserId },
    data: { createdByUserId: null, archivedAt: now, avatarUrl: null, bannerUrl: null }
  });
  await tx.event.updateMany({
    where: { createdByUserId: targetUserId },
    data: { createdByUserId: null, status: EventStatus.CANCELED }
  });
  await tx.eventInvitation.updateMany({
    where: { invitedByUserId: targetUserId },
    data: { invitedByUserId: null }
  });
  await tx.hashtag.updateMany({ where: { createdByUserId: targetUserId }, data: { createdByUserId: null } });

  await tx.businessProfile.updateMany({
    where: { ownerUserId: targetUserId },
    data: {
      slug: `deleted-business-${targetUserId}`,
      businessName: "Deleted business",
      contactPersonName: null,
      tagline: null,
      description: null,
      location: null,
      publicEmail: null,
      phone: null,
      website: null,
      logoUrl: null,
      bannerUrl: null,
      heroImageUrl: null,
      galleryImageUrls: [],
      blogEnabled: false,
      forumEnabled: false,
      publicStorefrontEnabled: false,
      emailLinkingEnabled: false
    }
  });
  await tx.businessAccount.updateMany({
    where: { OR: [{ privateUserId: targetUserId }, { businessUserId: targetUserId }] },
    data: { active: false }
  });
  await tx.auditorAccount.updateMany({
    where: { OR: [{ privateUserId: targetUserId }, { auditorUserId: targetUserId }] },
    data: { active: false }
  });
  await tx.businessArticle.updateMany({
    where: { ownerUserId: targetUserId },
    data: { title: "Deleted article", summary: null, body: DELETED_BODY, coverMediaAssetId: null, published: false }
  });
  await tx.auditorSuccessStory.updateMany({
    where: { authorUserId: targetUserId },
    data: { title: null, body: DELETED_BODY, removedByAuditorAt: now }
  });
  await tx.adCampaign.updateMany({
    where: { ownerUserId: targetUserId, status: { not: AdCampaignStatus.ARCHIVED } },
    data: { status: AdCampaignStatus.ARCHIVED }
  });
  await tx.fundraiserCampaign.updateMany({
    where: { creatorUserId: targetUserId, status: { not: FundraiserStatus.ARCHIVED } },
    data: { status: FundraiserStatus.ARCHIVED }
  });

  return counts;
}

export async function runAccountDataCleanupPlatformJob(
  job: PlatformJob,
  context: PlatformJobHandlerContext
): Promise<PlatformJobHandlerResult> {
  const payload = parseAccountCleanupJobPayload(job.payload);
  if (!payload) return { ok: false, error: "Invalid account cleanup job payload." };
  await context.assertLease();

  const request = await prisma.destructiveActionRequest.findUnique({
    where: { id: payload.destructiveActionRequestId }
  });
  if (
    !request ||
    request.kind !== DestructiveActionKind.DELETE_ACCOUNT ||
    request.targetType !== "User" ||
    request.targetId !== payload.targetUserId ||
    request.platformJobId !== job.id
  ) return { ok: false, error: "Account cleanup request and worker job do not match." };

  if (request.status === DestructiveActionStatus.SUCCEEDED) {
    return { ok: true, result: request.result ?? { replayed: true } };
  }
  if (request.status !== DestructiveActionStatus.QUEUED) {
    return { ok: false, error: `Account cleanup request is ${request.status.toLowerCase()}.` };
  }
  const integrity = parseAccountDeletionIntegrity(request.result);

  const claimed = await prisma.destructiveActionRequest.updateMany({
    where: {
      id: request.id,
      status: DestructiveActionStatus.QUEUED,
      platformJobId: job.id
    },
    data: { status: DestructiveActionStatus.RUNNING, startedAt: request.startedAt ?? new Date(), error: null }
  });
  if (claimed.count !== 1) {
    return { ok: false, error: "Account cleanup request could not be claimed from the queued state." };
  }

  try {
    if (!integrity) {
      throw new Error("Account cleanup request does not contain a sealed storage and ad-target manifest.");
    }
    const [manifestTotal, manifestDelete, manifestPreserve] = await Promise.all([
      prisma.destructiveActionStorageObject.count({ where: { requestId: request.id } }),
      prisma.destructiveActionStorageObject.count({
        where: { requestId: request.id, action: DestructiveStorageAction.DELETE }
      }),
      prisma.destructiveActionStorageObject.count({
        where: { requestId: request.id, action: DestructiveStorageAction.PRESERVE }
      })
    ]);
    if (
      manifestTotal !== integrity.storageManifest.totalObjects ||
      manifestDelete !== integrity.storageManifest.deleteObjects ||
      manifestPreserve !== integrity.storageManifest.preserveObjects
    ) {
      throw new Error("Account cleanup storage manifest does not match its immutable seal.");
    }
    await verifyAdCampaignTargetSnapshotSeal(integrity.adTargetSnapshots, payload.targetUserId);
    await prisma.$transaction(
      (tx) => reconcileAccountDeletionStorageSources(tx, request.id, payload.targetUserId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    await context.assertLease();
    const billing = await cancelSubscriptionForAccountDeletion({
      userId: payload.targetUserId,
      destructiveActionRequestId: request.id
    });
    await context.assertLease();
    const storage = await processStorageManifest(request.id, payload.targetUserId, context);
    await context.assertLease();
    const scope = await loadCleanupScope(payload.targetUserId, request.id);

    const now = new Date();
    const counts = await prisma.$transaction(async (tx) => {
      await reconcileAccountDeletionStorageSources(tx, request.id, payload.targetUserId);
      const lockedRequest = await tx.destructiveActionRequest.findUnique({ where: { id: request.id } });
      if (
        !lockedRequest ||
        lockedRequest.status !== DestructiveActionStatus.RUNNING
      ) {
        throw new Error("Account cleanup request changed while the worker was running.");
      }
      const priorProgress = parseAccountCleanupProgress(lockedRequest.result);
      if (priorProgress?.targetUserId === payload.targetUserId) return priorProgress.counts;
      const attemptCounts = await purgeOrdinaryData(tx, payload.targetUserId, now, scope);
      const progress = {
        version: 1,
        phase: "DATA_PURGED",
        targetUserId: payload.targetUserId,
        updatedAt: new Date().toISOString(),
        counts: attemptCounts,
        storage,
        storageManifest: integrity.storageManifest,
        adTargetSnapshots: integrity.adTargetSnapshots
      } satisfies Prisma.InputJsonObject;
      const savedProgress = await tx.destructiveActionRequest.updateMany({
        where: { id: request.id, status: DestructiveActionStatus.RUNNING },
        data: { result: progress }
      });
      if (savedProgress.count !== 1) {
        throw new Error("Account cleanup progress could not be saved atomically.");
      }
      return attemptCounts;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await reverifyCompletedStorageManifest(request.id, context);
    await context.assertLease();
    const [ordinaryMediaRecordsRemaining, uploadIntentsRemaining] = await Promise.all([
      prisma.mediaAsset.count({ where: { id: { in: scope.purgeAssetIds } } }),
      prisma.uploadIntent.count({ where: { id: { in: scope.deleteUploadIntentIds } } })
    ]);
    if (ordinaryMediaRecordsRemaining > 0 || uploadIntentsRemaining > 0) {
      throw new Error(
        `Account cleanup verification found ${ordinaryMediaRecordsRemaining} manifested ordinary media record(s) and ` +
        `${uploadIntentsRemaining} manifested upload intent(s).`
      );
    }

    const completedAt = new Date();
    const result = {
      version: 1,
      targetUserId: payload.targetUserId,
      destructiveActionRequestId: request.id,
      completedAt: completedAt.toISOString(),
      accountRecordRetainedAsAnonymizedTombstone: true,
      protectedModels: [...ACCOUNT_CLEANUP_PRESERVED_MODELS],
      conditionalRetentionRules: ACCOUNT_CLEANUP_CONDITIONAL_RETENTION_RULES,
      protectedMediaAssets: scope.protectedAssetCount,
      adminHeldFeedEvidence: scope.heldEvidence,
      storageManifest: integrity.storageManifest,
      adTargetSnapshots: integrity.adTargetSnapshots,
      billing,
      storage,
      counts
    } satisfies Prisma.InputJsonObject;
    await context.assertLease();
    await prisma.$transaction(async (tx) => {
      await reconcileAccountDeletionStorageSources(tx, request.id, payload.targetUserId);
      const unverifiedDeleteObjects = await tx.destructiveActionStorageObject.count({
        where: {
          requestId: request.id,
          action: DestructiveStorageAction.DELETE,
          status: { not: DestructiveStorageStatus.VERIFIED }
        }
      });
      if (unverifiedDeleteObjects !== 0) {
        throw new Error(
          `Account cleanup cannot complete with ${unverifiedDeleteObjects} unverified DELETE storage object(s).`
        );
      }
      const completed = await tx.destructiveActionRequest.updateMany({
        where: { id: request.id, status: DestructiveActionStatus.RUNNING },
        data: {
          status: DestructiveActionStatus.SUCCEEDED,
          completedAt,
          failedAt: null,
          error: null,
          result
        }
      });
      if (completed.count !== 1) throw new Error("Account cleanup request could not be marked complete.");
      await writeAuditLog({
        operationId: `account-cleanup:${request.id}:succeeded`,
        requestId: request.id,
        actorUserId: request.confirmedByUserId ?? request.requestedByUserId ?? undefined,
        module: "admin-account-cleanup",
        action: "account.cleanup_succeeded",
        targetType: "User",
        targetId: payload.targetUserId,
        severity: AuditSeverity.critical,
        after: result,
        metadata: {
          platformJobId: job.id,
          storageManifest: {
            deleteObjects: storage.deleteObjects,
            preserveObjects: storage.preserveObjects,
            deleteAttempts: storage.deleteAttempts,
            allDeleteObjectsVerified: storage.allDeleteObjectsVerified
          }
        }
      }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { ok: true, result };
  } catch (error) {
    if (error instanceof PlatformJobLeaseLostError) throw error;
    const message = error instanceof Error ? error.message : "Account cleanup failed.";
    const terminal = job.attempts + 1 >= job.maxAttempts;
    const failedAt = terminal ? new Date() : null;
    const [storage, persistedRequest] = await Promise.all([
      storageManifestSummary(request.id),
      prisma.destructiveActionRequest.findUnique({ where: { id: request.id }, select: { result: true } })
    ]);
    const progress = parseAccountCleanupProgress(persistedRequest?.result ?? null);
    const failureIntegrity = parseAccountDeletionIntegrity(persistedRequest?.result ?? null);
    const failureResult = terminal ? {
      version: 1,
      targetUserId: payload.targetUserId,
      destructiveActionRequestId: request.id,
      status: DestructiveActionStatus.FAILED,
      failedAt: failedAt!.toISOString(),
      error: message,
      storage,
      counts: progress?.counts ?? {},
      ...(failureIntegrity ?? {})
    } satisfies Prisma.InputJsonObject : null;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.destructiveActionRequest.updateMany({
        where: {
          id: request.id,
          status: { in: [DestructiveActionStatus.RUNNING, DestructiveActionStatus.QUEUED] }
        },
        data: {
          status: terminal ? DestructiveActionStatus.FAILED : DestructiveActionStatus.QUEUED,
          failedAt,
          error: message,
          ...(failureResult ? { result: failureResult } : {})
        }
      });
      if (terminal && updated.count === 1) {
        await writeAuditLog({
          operationId: `account-cleanup:${request.id}:failed`,
          requestId: request.id,
          actorUserId: request.confirmedByUserId ?? request.requestedByUserId ?? undefined,
          module: "admin-account-cleanup",
          action: "account.cleanup_failed",
          targetType: "User",
          targetId: payload.targetUserId,
          severity: AuditSeverity.critical,
          outcome: AuditOutcome.FAILURE,
          after: failureResult!,
          metadata: {
            platformJobId: job.id,
            attempts: job.attempts + 1,
            storageOutstandingObjects: storage.outstandingObjects.length
          }
        }, tx);
      }
    });
    return { ok: false, error: message };
  }
}
