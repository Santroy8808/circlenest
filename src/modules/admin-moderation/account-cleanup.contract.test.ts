import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  DestructiveStorageAccess,
  DestructiveStorageAction,
  DestructiveStorageStatus
} from "@prisma/client";
import {
  ACCOUNT_CLEANUP_CONDITIONAL_RETENTION_RULES,
  ACCOUNT_CLEANUP_ORDINARY_MODELS,
  ACCOUNT_CLEANUP_PRESERVED_MODELS,
  buildAccountDeletionStorageManifestRows,
  buildAdCampaignAccountDeletionTargetSnapshot,
  buildMediaAssetStorageCandidates,
  findNewlyProtectedAccountDeletionStorageCandidates,
  findUnmanifestedAccountDeletionStorageCandidates,
  hashAccountDeletionSnapshot,
  isPermanentlyProtectedMediaMetadata,
  mediaThumbnailStorageKey,
  parseAccountCleanupJobPayload
} from "@/modules/admin-moderation/account-cleanup.service";
import { parseDeleteRequestMetadata } from "@/modules/admin-moderation/account-lifecycle.service";
import { platformJobHandlers, platformJobRetryDelayMs } from "@/modules/platform-jobs/platform-jobs.service";

test("account cleanup jobs require the canonical request and target contract", () => {
  assert.deepEqual(parseAccountCleanupJobPayload({
    version: 1,
    destructiveActionRequestId: "delete-request-1",
    targetUserId: "member-1"
  }), {
    version: 1,
    destructiveActionRequestId: "delete-request-1",
    targetUserId: "member-1"
  });
  assert.equal(parseAccountCleanupJobPayload({ version: 1, targetUserId: "member-1" }), null);
  assert.equal(parseAccountCleanupJobPayload({
    version: 2,
    destructiveActionRequestId: "delete-request-1",
    targetUserId: "member-1"
  }), null);
});

test("system and VITAL media metadata is never selected for account cleanup", () => {
  assert.equal(isPermanentlyProtectedMediaMetadata({ neverDelete: true }), true);
  assert.equal(isPermanentlyProtectedMediaMetadata({ systemAsset: true }), true);
  assert.equal(isPermanentlyProtectedMediaMetadata({ retentionClass: "VITAL" }), true);
  assert.equal(isPermanentlyProtectedMediaMetadata({ retentionProtected: true }), true);
  assert.equal(isPermanentlyProtectedMediaMetadata({ retentionClass: "STANDARD" }), false);
  assert.equal(isPermanentlyProtectedMediaMetadata(null), false);
  assert.equal(mediaThumbnailStorageKey({ thumbnailStorageKey: "thumb/member-1.jpg" }), "thumb/member-1.jpg");
  assert.equal(mediaThumbnailStorageKey({ thumbnailStorageKey: null }), null);
});

test("confirmation storage manifests preserve source ids and let preservation win shared keys", () => {
  const rows = buildAccountDeletionStorageManifestRows("delete-request-1", [
    {
      sourceType: "UploadIntent",
      sourceId: "intent-1",
      storageKey: "members/member-1/photo.jpg",
      access: DestructiveStorageAccess.PRIVATE,
      action: DestructiveStorageAction.DELETE,
      reason: "OWNED_UPLOAD_INTENT"
    },
    {
      sourceType: "MediaAsset",
      sourceId: "asset-1",
      storageKey: "members/member-1/photo.jpg",
      access: DestructiveStorageAccess.PRIVATE,
      action: DestructiveStorageAction.PRESERVE,
      reason: "ADMIN_HELD_THREAD_EVIDENCE"
    },
    {
      sourceType: "MediaAsset.thumbnail",
      sourceId: "asset-1",
      storageKey: "members/member-1/photo-thumb.jpg",
      access: DestructiveStorageAccess.PRIVATE,
      action: DestructiveStorageAction.PRESERVE,
      reason: "ADMIN_HELD_THREAD_EVIDENCE"
    }
  ]);

  assert.equal(rows.length, 2);
  const shared = rows.find((row) => row.storageKey.endsWith("photo.jpg"));
  assert.equal(shared?.requestId, "delete-request-1");
  assert.equal(shared?.action, DestructiveStorageAction.PRESERVE);
  assert.equal(shared?.status, DestructiveStorageStatus.PLANNED);
  assert.equal(shared?.sourceId, "asset-1");
  assert.deepEqual(
    (shared?.metadata.sources as Array<{ sourceId: string }>).map((source) => source.sourceId).sort(),
    ["asset-1", "intent-1"]
  );
});

test("media manifests cover both buckets and preservation wins both physical copies", () => {
  const ordinary = buildMediaAssetStorageCandidates({
    mediaAssetId: "asset-delete",
    storageKey: "members/member-1/photo.jpg",
    thumbnailStorageKey: "members/member-1/photo-thumb.jpg",
    action: DestructiveStorageAction.DELETE,
    reason: "ORDINARY_OWNED_MEDIA"
  });
  assert.equal(ordinary.length, 4);
  assert.deepEqual(
    new Set(ordinary.map((candidate) => candidate.access)),
    new Set([DestructiveStorageAccess.PUBLIC, DestructiveStorageAccess.PRIVATE])
  );

  const preserved = buildMediaAssetStorageCandidates({
    mediaAssetId: "asset-preserve",
    storageKey: "members/member-1/photo.jpg",
    thumbnailStorageKey: "members/member-1/photo-thumb.jpg",
    action: DestructiveStorageAction.PRESERVE,
    reason: "ADMIN_HELD_THREAD_EVIDENCE"
  });
  const rows = buildAccountDeletionStorageManifestRows("delete-request-1", [...ordinary, ...preserved]);
  assert.equal(rows.length, 4);
  assert.equal(rows.every((row) => row.action === DestructiveStorageAction.PRESERVE), true);
});

test("manifest closure rejects finalized uploads and newly protected DELETE sources", () => {
  const intent = {
    sourceType: "UploadIntent",
    sourceId: "intent-1",
    storageKey: "members/member-1/photo.jpg",
    access: DestructiveStorageAccess.PRIVATE,
    action: DestructiveStorageAction.DELETE,
    reason: "OWNED_UPLOAD_INTENT"
  } as const;
  const rows = buildAccountDeletionStorageManifestRows("delete-request-1", [intent]);
  const finalizedAsset = buildMediaAssetStorageCandidates({
    mediaAssetId: "asset-created-after-confirmation",
    storageKey: intent.storageKey,
    action: DestructiveStorageAction.DELETE,
    reason: "ORDINARY_OWNED_MEDIA"
  });
  assert.equal(
    findUnmanifestedAccountDeletionStorageCandidates([intent, ...finalizedAsset], rows).length,
    2
  );

  const directAttachment = {
    sourceType: "ChatAttachment",
    sourceId: "attachment-1",
    storageKey: "chat/member-1/evidence.pdf",
    access: DestructiveStorageAccess.PRIVATE,
    action: DestructiveStorageAction.DELETE,
    reason: "ORDINARY_CHAT_DIRECT_ATTACHMENT"
  } as const;
  const directRows = buildAccountDeletionStorageManifestRows("delete-request-2", [directAttachment]);
  assert.equal(findNewlyProtectedAccountDeletionStorageCandidates([{
    ...directAttachment,
    action: DestructiveStorageAction.PRESERVE,
    reason: "VITAL_CHAT_DIRECT_ATTACHMENT"
  }], directRows).length, 1);
});

test("storage manifest migration seals membership while permitting status reconciliation", () => {
  const migration = readFileSync(resolve(
    "prisma/migrations/20260721135000_account_deletion_integrity/migration.sql"
  ), "utf8");
  assert.match(migration, /BEFORE INSERT OR UPDATE OR DELETE/);
  assert.match(migration, /storage manifests can only be built once before confirmation/);
  assert.match(migration, /storage manifest rows cannot be deleted/);
  assert.match(migration, /"acknowledgedAt" TIMESTAMP\(3\)/);
});

test("confirmation seals storage and ad targets before the request is queued", () => {
  const lifecycle = readFileSync(resolve(
    "src/modules/admin-moderation/account-lifecycle.service.ts"
  ), "utf8");
  const storageManifest = lifecycle.indexOf("const storageManifest = await persistAccountDeletionStorageManifest");
  const adTargetSnapshots = lifecycle.indexOf("const adTargetSnapshots = await snapshotAdCampaignTargetsForAccountDeletion");
  const queuedClaim = lifecycle.indexOf("const claimed = await tx.destructiveActionRequest.updateMany", storageManifest);
  assert.ok(storageManifest > 0);
  assert.ok(adTargetSnapshots > storageManifest);
  assert.ok(queuedClaim > adTargetSnapshots);
});

test("worker claims only queued requests and completes only verified DELETE manifests", () => {
  const cleanup = readFileSync(resolve(
    "src/modules/admin-moderation/account-cleanup.service.ts"
  ), "utf8");
  const claimStart = cleanup.indexOf("const claimed = await prisma.destructiveActionRequest.updateMany");
  const claim = cleanup.slice(claimStart, claimStart + 500);
  assert.match(claim, /status: DestructiveActionStatus\.QUEUED/);
  assert.match(cleanup, /status: \{ not: DestructiveStorageStatus\.VERIFIED \}/);
  assert.match(cleanup, /verifyR2ObjectAbsent/);
  const r2Delete = cleanup.indexOf("await deleteR2Object(object.storageKey");
  assert.ok(cleanup.lastIndexOf("reconcileAccountDeletionStorageSources", r2Delete) > 0);
  assert.equal(cleanup.includes("scope.vitalChatThreadIds"), false);
  assert.match(cleanup, /thread: \{ retentionClass: RecordRetentionClass\.STANDARD \}/);
  assert.match(cleanup, /await reverifyCompletedStorageManifest\(request\.id, context\)/);
});

test("ad target snapshots are JSON-safe and hash canonical original content", () => {
  const capturedAt = new Date("2026-07-21T12:00:00.000Z");
  const snapshot = buildAdCampaignAccountDeletionTargetSnapshot(capturedAt, [{
    type: "MARKET_LISTING",
    id: "listing-1",
    content: { updatedAt: capturedAt, title: "Original title", priceCents: 1250 }
  }]);
  const target = (snapshot.targets as Array<Record<string, unknown>>)[0]!;
  assert.equal(snapshot.capturedAt, capturedAt.toISOString());
  assert.equal((target.content as Record<string, unknown>).updatedAt, capturedAt.toISOString());
  assert.match(target.sha256 as string, /^[a-f0-9]{64}$/);
  assert.equal(target.sha256, hashAccountDeletionSnapshot(target.content));
  assert.equal(snapshot.sha256, hashAccountDeletionSnapshot(snapshot.targets));
  assert.equal(
    hashAccountDeletionSnapshot({ title: "Original title", priceCents: 1250 }),
    hashAccountDeletionSnapshot({ priceCents: 1250, title: "Original title" })
  );
});

test("delete confirmation metadata uses a versioned canonical manifest", () => {
  const manifest = {
    version: 1,
    targetUserId: "member-1",
    reason: "Administrator-approved account deletion.",
    expiresAt: "2026-07-21T12:10:00.000Z",
    expectedConfirmationDigest: "a".repeat(64),
    mediaAssetCountAtRequest: 3,
    retainedProtectedTables: [{ table: "AuditLog", tags: ["RETENTION_AUDIT_TRAIL"] }],
    preservedModels: [...ACCOUNT_CLEANUP_PRESERVED_MODELS],
    ordinaryModels: [...ACCOUNT_CLEANUP_ORDINARY_MODELS],
    conditionalRetentionRules: ACCOUNT_CLEANUP_CONDITIONAL_RETENTION_RULES.map((entry) => ({
      models: [...entry.models],
      rule: entry.rule
    }))
  };
  assert.deepEqual(parseDeleteRequestMetadata(manifest), manifest);
  assert.equal("username" in manifest, false);
  assert.equal("email" in manifest, false);
  assert.equal(parseDeleteRequestMetadata({ ...manifest, version: 2 }), null);
  assert.equal(parseDeleteRequestMetadata({ ...manifest, ordinaryModels: null }), null);
});

test("cleanup allowlists separate retained evidence from ordinary member content", () => {
  assert.equal(ACCOUNT_CLEANUP_PRESERVED_MODELS.includes("AuditLog"), true);
  assert.equal(ACCOUNT_CLEANUP_PRESERVED_MODELS.includes("MailMessage"), true);
  assert.equal(ACCOUNT_CLEANUP_PRESERVED_MODELS.includes("AdCreditLedgerEntry"), true);
  assert.equal(ACCOUNT_CLEANUP_PRESERVED_MODELS.includes("DestructiveActionStorageObject"), true);
  assert.equal(ACCOUNT_CLEANUP_ORDINARY_MODELS.includes("FeedPost"), true);
  assert.equal(ACCOUNT_CLEANUP_ORDINARY_MODELS.includes("MediaAsset"), true);
  assert.equal((ACCOUNT_CLEANUP_ORDINARY_MODELS as readonly string[]).includes("AuditLog"), false);
  assert.equal(
    ACCOUNT_CLEANUP_CONDITIONAL_RETENTION_RULES.some((entry) => entry.rule.includes("administrator-held")),
    true
  );
  assert.equal(typeof platformJobHandlers["account.data-cleanup.v1"], "function");
  assert.equal(platformJobRetryDelayMs(0), 30_000);
  assert.equal(platformJobRetryDelayMs(3), 240_000);
  assert.equal(platformJobRetryDelayMs(20), 3_600_000);
});
