import assert from "node:assert/strict";
import test from "node:test";
import {
  DestructiveActionStatus,
  DestructiveStorageAccess,
  DestructiveStorageAction,
  DestructiveStorageStatus,
  MediaAssetStatus,
  MediaCollectionType,
  MediaVisibility,
  PlatformJobStatus,
  Prisma,
  RecordRetentionClass
} from "@prisma/client";
import {
  buildGalleryMediaDeletionManifestRows,
  externalUseCategories,
  galleryDeletionAutomaticRecoveryAvailable,
  galleryDeletionAttemptWillExhaust,
  galleryDeletionFailureDisposition,
  galleryMediaDeletionTargetHash,
  galleryMediaUploadReplayFenceUntil,
  GALLERY_MEDIA_DELETE_MAX_AUTOMATIC_RECOVERIES,
  GALLERY_MEDIA_UPLOAD_REPLAY_SAFETY_MS,
  isProtectedSystemGalleryAsset,
  loadGalleryMediaExternalUseCategories,
  parseGalleryMediaDeletePayload,
  processGalleryDeletionStorageObject,
  profileMediaClearData,
  queueGalleryMediaDeletionWithinTransaction,
  requeueGalleryMediaDeletionWithinTransaction
} from "@/modules/gallery-media-storage/gallery-media-deletion.service";
import { deleteGalleryAssets } from "@/modules/gallery-media-storage/gallery-media-storage.service";
import { platformJobHandlers } from "@/modules/platform-jobs/platform-jobs.service";

const baseAsset = {
  id: "asset-a",
  ownerUserId: "owner-1",
  storageKey: "gallery/asset-a.webp",
  mimeType: "image/webp",
  status: MediaAssetStatus.READY,
  visibility: MediaVisibility.PRIVATE,
  metadata: { source: "GALLERY", thumbnailStorageKey: "gallery/asset-a-thumb.webp" },
  createdAt: new Date("2026-07-21T10:00:00.000Z"),
  collections: []
};

test("upload replay fence uses immutable signing time rather than extended consumption expiry", () => {
  const intent = {
    storageKey: "upload-intents/owner/gallery/key",
    createdAt: new Date("2026-07-21T10:00:00.000Z"),
    expiresAt: new Date("2026-07-21T10:14:00.000Z")
  };
  const fence = galleryMediaUploadReplayFenceUntil(
    [{ storageKey: "upload-intents/owner/gallery/key", createdAt: baseAsset.createdAt }],
    [intent]
  );

  assert.equal(
    fence?.toISOString(),
    new Date(
      intent.createdAt.getTime() + (5 * 60 * 1000) + GALLERY_MEDIA_UPLOAD_REPLAY_SAFETY_MS
    ).toISOString()
  );
});

test("upload replay fence falls back to asset creation time after its intent record is gone", () => {
  const assetCreatedAt = new Date("2026-07-21T10:00:00.000Z");
  const fence = galleryMediaUploadReplayFenceUntil(
    [{ storageKey: "upload-intents/owner/gallery/orphaned-key", createdAt: assetCreatedAt }],
    []
  );

  assert.equal(
    fence?.toISOString(),
    new Date(
      assetCreatedAt.getTime() + (5 * 60 * 1000) + GALLERY_MEDIA_UPLOAD_REPLAY_SAFETY_MS
    ).toISOString()
  );
});

test("gallery deletion requires the DELETE password inside the service boundary", async () => {
  const result = await deleteGalleryAssets("owner-1", { mediaAssetIds: ["asset-a"] });

  assert.equal(result.ok, false);
  assert.equal(result.code, "DELETE_PASSWORD_REQUIRED");
  assert.equal(result.field, "deletePassword");
});

test("profile references are cleared only for exact deleted delivery URLs", () => {
  assert.deepEqual(profileMediaClearData({
    avatarUrl: "/api/media/assets/avatar-asset",
    bannerUrl: "/api/media/assets/banner-kept"
  }, ["avatar-asset"]), { avatarUrl: null });
  assert.deepEqual(profileMediaClearData({
    avatarUrl: "/api/media/assets/avatar-kept",
    bannerUrl: "/api/media/assets/banner-asset"
  }, ["banner-asset"]), { bannerUrl: null });
  assert.deepEqual(profileMediaClearData({
    avatarUrl: "/api/media/assets/avatar-asset",
    bannerUrl: "/api/media/assets/banner-asset"
  }, ["avatar-asset", "banner-asset"]), { avatarUrl: null, bannerUrl: null });
  assert.deepEqual(profileMediaClearData({
    avatarUrl: "/api/media/assets/avatar-kept",
    bannerUrl: "https://cdn.example.test/banner.webp"
  }, ["different-asset"]), {});
});

test("external-use labels cover every blocking domain and no gallery-local relation", () => {
  assert.deepEqual(externalUseCategories({
    feedPosts: 1,
    feedComments: 1,
    ads: 2,
    businessArticles: 1,
    chatAttachments: 1,
    mailAttachments: 1,
    groupForumPosts: 1,
    groupAssets: 1,
    marketListings: 1,
    scientologyCommendations: 1
  }), [
    "stream posts",
    "stream comments",
    "ads and ad creatives",
    "business article covers",
    "chat attachments",
    "mail attachments",
    "group forum posts",
    "group assets",
    "market listings",
    "Scientology commendations"
  ]);
});

test("external-use lookup queries every external live domain", async () => {
  const called: string[] = [];
  const count = (name: string, value = 0) => async () => {
    called.push(name);
    return value;
  };
  const transaction = {
    feedPost: { count: count("feedPost", 1) },
    feedComment: { count: count("feedComment") },
    adCampaign: { count: count("adCampaign") },
    adCampaignCreative: { count: count("adCampaignCreative", 1) },
    businessArticle: { count: count("businessArticle") },
    chatAttachment: { count: count("chatAttachment") },
    mailAttachment: { count: count("mailAttachment") },
    groupForumPost: { count: count("groupForumPost") },
    groupAsset: { count: count("groupAsset") },
    marketListingPhoto: { count: count("marketListingPhoto") },
    scientologyCommendation: { count: count("scientologyCommendation") }
  } as unknown as Prisma.TransactionClient;

  const categories = await loadGalleryMediaExternalUseCategories(transaction, ["asset-a"]);

  assert.deepEqual(categories, ["stream posts", "ads and ad creatives"]);
  assert.equal(called.length, 11);
});

test("system-source and system-tag gallery assets are never deletable", () => {
  assert.equal(isProtectedSystemGalleryAsset({ metadata: { source: "STREAM_POST" }, collections: [] }), true);
  assert.equal(isProtectedSystemGalleryAsset({
    metadata: { source: "GALLERY" },
    collections: [{ collection: { type: MediaCollectionType.TAG, name: "Profile Media" } }]
  }), true);
  assert.equal(isProtectedSystemGalleryAsset({
    metadata: { source: "GALLERY" },
    collections: [{ collection: { type: MediaCollectionType.TAG, name: "Family" } }]
  }), false);
});

test("manifest inventories main and thumbnail keys in both buckets with VITAL retention", () => {
  const rows = buildGalleryMediaDeletionManifestRows("request-1", [baseAsset]);

  assert.equal(rows.length, 4);
  assert.deepEqual(new Set(rows.map((row) => row.storageKey)), new Set([
    "gallery/asset-a.webp",
    "gallery/asset-a-thumb.webp"
  ]));
  assert.deepEqual(new Set(rows.map((row) => row.access)), new Set([
    DestructiveStorageAccess.PRIVATE,
    DestructiveStorageAccess.PUBLIC
  ]));
  assert.equal(rows.every((row) => row.action === DestructiveStorageAction.DELETE), true);
  assert.equal(rows.every((row) => row.status === DestructiveStorageStatus.PLANNED), true);
  assert.equal(rows.every((row) => row.retentionClass === RecordRetentionClass.VITAL), true);
});

function queueTransaction(input?: {
  asset?: typeof baseAsset;
  existing?: {
    id: string;
    platformJobId: string;
    status: DestructiveActionStatus;
    platformJob?: { status: PlatformJobStatus } | null;
  } | null;
  feedPostCount?: number;
  uploadIntentCreatedAt?: Date;
}) {
  const events: string[] = [];
  const lockValues: unknown[][] = [];
  const writes: Array<{ name: string; value: unknown }> = [];
  let lockCall = 0;
  const count = (name: string, value = 0) => async () => {
    events.push(`count-${name}`);
    return value;
  };
  const transaction = {
    $queryRaw: async (query: { values: unknown[] }) => {
      lockCall += 1;
      events.push(lockCall === 1 ? "lock-user" : "lock-assets");
      lockValues.push(query.values);
      return lockCall === 1 ? [{ id: "owner-1" }] : [{ id: "asset-a" }];
    },
    destructiveActionRequest: {
      findUnique: async () => {
        events.push("find-request");
        return input?.existing
          ? {
              kind: "DELETE_MEDIA",
              targetType: "MediaAssetBatch",
              targetId: galleryMediaDeletionTargetHash("owner-1", ["asset-a"]),
              requestedByUserId: "owner-1",
              platformJob: null,
              ...input.existing
            }
          : null;
      },
      create: async (value: unknown) => {
        events.push("create-request");
        writes.push({ name: "request", value });
        return {};
      },
      update: async (value: unknown) => {
        events.push("seal-request");
        writes.push({ name: "request-seal", value });
        return {};
      },
      updateMany: async (value: unknown) => {
        events.push("queue-request");
        writes.push({ name: "request-queue", value });
        return { count: 1 };
      }
    },
    mediaAsset: {
      findMany: async () => {
        events.push("read-assets");
        return [input?.asset ?? baseAsset];
      },
      updateMany: async (value: unknown) => {
        events.push("mark-deleting");
        writes.push({ name: "asset-status", value });
        return { count: 1 };
      }
    },
    uploadIntent: {
      findMany: async () => input?.uploadIntentCreatedAt
        ? [{
            storageKey: input.asset?.storageKey ?? baseAsset.storageKey,
            createdAt: input.uploadIntentCreatedAt
          }]
        : []
    },
    feedPost: { count: count("feedPost", input?.feedPostCount) },
    feedComment: { count: count("feedComment") },
    adCampaign: { count: count("adCampaign") },
    adCampaignCreative: { count: count("adCampaignCreative") },
    businessArticle: { count: count("businessArticle") },
    chatAttachment: { count: count("chatAttachment") },
    mailAttachment: { count: count("mailAttachment") },
    groupForumPost: { count: count("groupForumPost") },
    groupAsset: { count: count("groupAsset") },
    marketListingPhoto: { count: count("marketListingPhoto") },
    scientologyCommendation: { count: count("scientologyCommendation") },
    authSecurityEvent: {
      create: async (value: unknown) => {
        events.push("create-security-event");
        writes.push({ name: "security-event", value });
        return { id: "security-event-1" };
      }
    },
    platformJob: {
      create: async (value: unknown) => {
        events.push("create-job");
        writes.push({ name: "job", value });
        return {};
      }
    },
    destructiveActionStorageObject: {
      createMany: async (value: unknown) => {
        events.push("create-manifest");
        writes.push({ name: "manifest", value });
        return { count: 4 };
      }
    },
    profile: {
      findUnique: async () => {
        events.push("read-profile");
        return { avatarUrl: "/api/media/assets/asset-a", bannerUrl: "/api/media/assets/banner-kept" };
      },
      update: async (value: unknown) => {
        events.push("clear-profile");
        writes.push({ name: "profile", value });
        return {};
      }
    },
    auditLog: {
      create: async (value: unknown) => {
        events.push("audit");
        writes.push({ name: "audit", value });
        return {};
      }
    }
  } as unknown as Prisma.TransactionClient;
  return { transaction, events, lockValues, writes };
}

test("queue transaction locks owner then asset and atomically creates the durable tombstone", async () => {
  const mock = queueTransaction();
  const result = await queueGalleryMediaDeletionWithinTransaction(mock.transaction, "owner-1", ["asset-a"]);

  assert.equal(result.kind, "QUEUED");
  assert.deepEqual(mock.events.slice(0, 4), ["find-request", "lock-user", "lock-assets", "find-request"]);
  assert.deepEqual(mock.lockValues[1], ["owner-1", "asset-a"]);
  assert.equal(mock.events.indexOf("create-request") < mock.events.indexOf("create-manifest"), true);
  assert.equal(mock.events.indexOf("create-manifest") < mock.events.indexOf("seal-request"), true);
  assert.equal(mock.events.indexOf("seal-request") < mock.events.indexOf("queue-request"), true);
  assert.equal(mock.events.indexOf("queue-request") < mock.events.indexOf("mark-deleting"), true);
  assert.equal(mock.events.indexOf("mark-deleting") < mock.events.indexOf("clear-profile"), true);
  assert.equal(mock.events.at(-1), "audit");
  assert.equal(mock.writes.some((write) => write.name === "manifest"), true);
  assert.equal(mock.writes.some((write) => write.name === "security-event"), true);
  assert.equal(mock.writes.some((write) => write.name === "profile"), true);
  assert.equal(mock.events.includes("delete-assets"), false);
});

test("queue schedules deletion after every presigned upload replay window", async () => {
  const signedAt = new Date();
  const mock = queueTransaction({
    asset: { ...baseAsset, storageKey: "upload-intents/owner/gallery/key" },
    uploadIntentCreatedAt: signedAt
  });
  const result = await queueGalleryMediaDeletionWithinTransaction(mock.transaction, "owner-1", ["asset-a"]);

  assert.equal(result.kind, "QUEUED");
  const jobWrite = mock.writes.find((write) => write.name === "job")?.value as any;
  const requestSeal = mock.writes.find((write) => write.name === "request-seal")?.value as any;
  const expected = new Date(
    signedAt.getTime() + (5 * 60 * 1000) + GALLERY_MEDIA_UPLOAD_REPLAY_SAFETY_MS
  );
  assert.equal(jobWrite.data.runAfter.toISOString(), expected.toISOString());
  assert.equal(requestSeal.data.result.uploadReplayFenceUntil, expected.toISOString());
});

test("duplicate deletion requests converge on the existing durable request", async () => {
  const mock = queueTransaction({
    existing: { id: "request-existing", platformJobId: "job-existing", status: DestructiveActionStatus.QUEUED }
  });
  const result = await queueGalleryMediaDeletionWithinTransaction(mock.transaction, "owner-1", ["asset-a"]);

  assert.equal(result.kind, "ALREADY_REQUESTED");
  assert.deepEqual(mock.events, ["find-request"]);
});

test("completed deletion replay succeeds after the asset rows have been removed", async () => {
  const mock = queueTransaction({
    existing: {
      id: "request-existing",
      platformJobId: "job-existing",
      status: DestructiveActionStatus.SUCCEEDED
    }
  });
  const result = await queueGalleryMediaDeletionWithinTransaction(mock.transaction, "owner-1", ["asset-a"]);

  assert.equal(result.kind, "ALREADY_REQUESTED");
  assert.equal(result.status, DestructiveActionStatus.SUCCEEDED);
  assert.deepEqual(mock.events, ["find-request"]);
});

test("queue rejects external live references before creating a request", async () => {
  const mock = queueTransaction({ feedPostCount: 1 });
  const result = await queueGalleryMediaDeletionWithinTransaction(mock.transaction, "owner-1", ["asset-a"]);

  assert.deepEqual(result, { kind: "IN_USE", inUseCategories: ["stream posts"] });
  assert.equal(mock.events.includes("create-request"), false);
  assert.equal(mock.events.includes("mark-deleting"), false);
});

test("queue rechecks system-image protection instead of trusting the gallery UI", async () => {
  const mock = queueTransaction({
    asset: { ...baseAsset, metadata: { ...baseAsset.metadata, source: "PROFILE_MEDIA" } }
  });
  const result = await queueGalleryMediaDeletionWithinTransaction(mock.transaction, "owner-1", ["asset-a"]);

  assert.deepEqual(result, { kind: "PROTECTED", protectedAssetIds: ["asset-a"] });
  assert.equal(mock.events.includes("create-request"), false);
});

test("payload parser requires exact version, sorted unique IDs, and matching target hash", () => {
  const targetHash = galleryMediaDeletionTargetHash("owner-1", ["asset-a", "asset-b"]);
  const valid = {
    version: 1,
    destructiveActionRequestId: "request-1",
    ownerUserId: "owner-1",
    mediaAssetIds: ["asset-a", "asset-b"],
    targetHash
  };

  assert.deepEqual(parseGalleryMediaDeletePayload(valid), valid);
  assert.equal(parseGalleryMediaDeletePayload({ ...valid, version: 2 }), null);
  assert.equal(parseGalleryMediaDeletePayload({ ...valid, mediaAssetIds: ["asset-b", "asset-a"] }), null);
  assert.equal(parseGalleryMediaDeletePayload({ ...valid, targetHash: "wrong" }), null);
});

function storageContext(renewed = true) {
  const events: string[] = [];
  return {
    events,
    context: {
      assertLease: async () => { events.push("assert-lease"); },
      renewLease: async () => {
        events.push("renew-lease");
        return renewed;
      }
    }
  };
}

const storageObject = {
  id: "object-1",
  storageKey: "gallery/asset-a.webp",
  access: DestructiveStorageAccess.PRIVATE,
  status: DestructiveStorageStatus.PLANNED
};

test("storage processing treats an already-absent object as verified success", async () => {
  const lease = storageContext();
  const updates: unknown[] = [];
  let deleteCalls = 0;
  const result = await processGalleryDeletionStorageObject(storageObject, lease.context, {
    verifyAbsent: async () => ({ ok: true }),
    deleteObject: async () => { deleteCalls += 1; },
    updateObject: async (_id, data) => { updates.push(data); }
  });

  assert.deepEqual(result, { ok: true, alreadyAbsent: true });
  assert.equal(deleteCalls, 0);
  assert.equal((updates[0] as { status: DestructiveStorageStatus }).status, DestructiveStorageStatus.VERIFIED);
});

test("storage processing records delete acknowledgement then independent verification", async () => {
  const lease = storageContext();
  const updates: Array<{ status: DestructiveStorageStatus }> = [];
  let verificationCall = 0;
  const result = await processGalleryDeletionStorageObject(storageObject, lease.context, {
    verifyAbsent: async () => ({ ok: ++verificationCall > 1, error: "still present" }),
    deleteObject: async () => undefined,
    updateObject: async (_id, data) => { updates.push(data as { status: DestructiveStorageStatus }); }
  });

  assert.deepEqual(result, { ok: true, alreadyAbsent: false });
  assert.deepEqual(updates.map((update) => update.status), [
    DestructiveStorageStatus.DELETE_ACKNOWLEDGED,
    DestructiveStorageStatus.VERIFIED
  ]);
});

test("storage deletion failure is durable and retryable", async () => {
  const lease = storageContext();
  const updates: Array<{ status: DestructiveStorageStatus }> = [];
  const result = await processGalleryDeletionStorageObject(storageObject, lease.context, {
    verifyAbsent: async () => ({ ok: false, error: "present" }),
    deleteObject: async () => { throw new Error("R2 unavailable"); },
    updateObject: async (_id, data) => { updates.push(data as { status: DestructiveStorageStatus }); }
  });

  assert.deepEqual(result, { ok: false, error: "R2 unavailable" });
  assert.equal(updates.at(-1)?.status, DestructiveStorageStatus.FAILED);
});

test("storage that remains present after deletion stays FAILED for retry", async () => {
  const lease = storageContext();
  const updates: Array<{ status: DestructiveStorageStatus }> = [];
  const result = await processGalleryDeletionStorageObject(storageObject, lease.context, {
    verifyAbsent: async () => ({ ok: false, error: "object still present" }),
    deleteObject: async () => undefined,
    updateObject: async (_id, data) => { updates.push(data as { status: DestructiveStorageStatus }); }
  });

  assert.deepEqual(result, { ok: false, error: "object still present" });
  assert.deepEqual(updates.map((update) => update.status), [
    DestructiveStorageStatus.DELETE_ACKNOWLEDGED,
    DestructiveStorageStatus.FAILED
  ]);
});

test("lease loss after an external delete is propagated instead of mislabeled as an R2 failure", async () => {
  let assertion = 0;
  const updates: unknown[] = [];
  const context = {
    assertLease: async () => {
      assertion += 1;
      if (assertion === 3) throw new Error("lease lost");
    },
    renewLease: async () => true
  };

  await assert.rejects(
    processGalleryDeletionStorageObject(storageObject, context, {
      verifyAbsent: async () => ({ ok: false, error: "present" }),
      deleteObject: async () => undefined,
      updateObject: async (_id, data) => { updates.push(data); }
    }),
    /lease lost/
  );
  assert.deepEqual(updates, []);
});

test("worker handler registration includes durable gallery media deletion", () => {
  assert.equal(typeof platformJobHandlers["gallery.media-delete.v1"], "function");
});

test("only the attempt that would exhaust a job enters terminal recovery", () => {
  assert.equal(galleryDeletionAttemptWillExhaust({ attempts: 6, maxAttempts: 8 }), false);
  assert.equal(galleryDeletionAttemptWillExhaust({ attempts: 7, maxAttempts: 8 }), true);
  assert.equal(galleryDeletionAttemptWillExhaust({ attempts: 8, maxAttempts: 8 }), true);
});

test("gallery deletion failures distinguish transient storage errors from terminal invariants", () => {
  const earlyAttempt = { attempts: 1, maxAttempts: 8 };
  const finalAttempt = { attempts: 7, maxAttempts: 8 };

  assert.equal(
    galleryDeletionFailureDisposition(earlyAttempt, "TRANSIENT_STORAGE"),
    "RETRY_CURRENT_JOB"
  );
  assert.equal(
    galleryDeletionFailureDisposition(finalAttempt, "TRANSIENT_STORAGE"),
    "CREATE_SUCCESSOR"
  );
  assert.equal(
    galleryDeletionFailureDisposition(earlyAttempt, "TERMINAL_INVARIANT"),
    "TERMINAL"
  );
});

test("automatic gallery deletion recovery has a hard successor limit", () => {
  assert.equal(galleryDeletionAutomaticRecoveryAvailable(null), true);
  assert.equal(galleryDeletionAutomaticRecoveryAvailable({ automaticRecoveryCount: 1 }), true);
  assert.equal(
    galleryDeletionAutomaticRecoveryAvailable({
      automaticRecoveryCount: GALLERY_MEDIA_DELETE_MAX_AUTOMATIC_RECOVERIES
    }),
    false
  );
});

function recoveryTransaction(input: {
  requestStatus: DestructiveActionStatus;
  jobStatus: PlatformJobStatus;
  replayStatus?: DestructiveActionStatus;
  requestResult?: Prisma.JsonValue;
}) {
  const events: string[] = [];
  const writes: Array<{ name: string; value: any }> = [];
  let lockCall = 0;
  const request = {
    id: "request-1",
    idempotencyKey: "delete-key",
    kind: "DELETE_MEDIA",
    status: input.requestStatus,
    targetType: "MediaAssetBatch",
    targetId: galleryMediaDeletionTargetHash("owner-1", ["asset-a"]),
    reason: "delete",
    requestedByUserId: "owner-1",
    confirmedByUserId: "owner-1",
    confirmationSecurityEventId: "security-original",
    platformJobId: "job-old",
    confirmedAt: new Date("2026-07-21T10:00:00.000Z"),
    startedAt: new Date("2026-07-21T10:01:00.000Z"),
    completedAt: null,
    failedAt: input.requestStatus === DestructiveActionStatus.FAILED
      ? new Date("2026-07-21T11:00:00.000Z")
      : null,
    error: "R2 unavailable",
    result: input.requestResult ?? { recoveryCount: 2 },
    retentionClass: RecordRetentionClass.VITAL,
    createdAt: new Date("2026-07-21T10:00:00.000Z"),
    updatedAt: new Date("2026-07-21T11:00:00.000Z")
  };
  const manifest = buildGalleryMediaDeletionManifestRows("request-1", [
    { ...baseAsset, status: MediaAssetStatus.DELETING }
  ]).map((row) => ({
    access: row.access,
    storageKey: row.storageKey,
    action: row.action,
    retentionClass: row.retentionClass
  }));
  const count = async () => 0;
  const transaction = {
    $queryRaw: async () => {
      lockCall += 1;
      if (lockCall === 1) return [{ id: "owner-1" }];
      if (lockCall === 2) return [{ id: "asset-a" }];
      return [{ id: "request-1", status: input.replayStatus ?? input.requestStatus }];
    },
    destructiveActionRequest: {
      findUnique: async () => input.replayStatus
        ? { id: "request-1", platformJobId: "job-new-by-other-worker", status: input.replayStatus }
        : request,
      updateMany: async (value: unknown) => {
        events.push("requeue-request");
        writes.push({ name: "request", value });
        return { count: 1 };
      }
    },
    platformJob: {
      findUnique: async () => ({
        id: "job-old",
        kind: "gallery.media-delete.v1",
        status: input.jobStatus,
        maxAttempts: 8
      }),
      create: async (value: unknown) => {
        events.push("create-successor-job");
        writes.push({ name: "job", value });
        return {};
      }
    },
    mediaAsset: {
      findMany: async () => [{ ...baseAsset, status: MediaAssetStatus.DELETING }]
    },
    uploadIntent: { findMany: async () => [] },
    feedPost: { count },
    feedComment: { count },
    adCampaign: { count },
    adCampaignCreative: { count },
    businessArticle: { count },
    chatAttachment: { count },
    mailAttachment: { count },
    groupForumPost: { count },
    groupAsset: { count },
    marketListingPhoto: { count },
    scientologyCommendation: { count },
    destructiveActionStorageObject: {
      findMany: async () => manifest
    },
    authSecurityEvent: {
      create: async (value: unknown) => {
        events.push("create-retry-security-event");
        writes.push({ name: "security", value });
        return { id: "security-retry" };
      }
    },
    auditLog: {
      create: async (value: unknown) => {
        events.push("audit-requeue");
        writes.push({ name: "audit", value });
        return {};
      }
    }
  } as unknown as Prisma.TransactionClient;

  return { transaction, events, writes, manifest };
}

test("confirmed retry reuses the request and manifest while linking a successor job", async () => {
  const mock = recoveryTransaction({
    requestStatus: DestructiveActionStatus.FAILED,
    jobStatus: PlatformJobStatus.FAILED
  });
  const runAfter = new Date("2026-07-21T12:00:00.000Z");
  const result = await requeueGalleryMediaDeletionWithinTransaction(mock.transaction, {
    requestId: "request-1",
    previousJobId: "job-old",
    ownerUserId: "owner-1",
    mediaAssetIds: ["asset-a"],
    expectedRequestStatuses: [DestructiveActionStatus.FAILED],
    mode: "CONFIRMED_RETRY",
    error: "Confirmed retry after R2 failure.",
    runAfter
  });

  assert.equal(result.kind, "REQUEUED");
  assert.equal(result.requestId, "request-1");
  assert.deepEqual(mock.events, [
    "create-retry-security-event",
    "create-successor-job",
    "requeue-request",
    "audit-requeue"
  ]);
  const requestWrite = mock.writes.find((write) => write.name === "request")?.value as any;
  const jobWrite = mock.writes.find((write) => write.name === "job")?.value as any;
  assert.equal(requestWrite.data.status, DestructiveActionStatus.QUEUED);
  assert.equal(requestWrite.where.confirmationSecurityEventId, "security-original");
  assert.equal(requestWrite.data.result.recoveryCount, 3);
  assert.equal(requestWrite.data.result.automaticRecoveryCount, 0);
  assert.equal(requestWrite.data.platformJobId, jobWrite.data.id);
  assert.equal(jobWrite.data.runAfter.toISOString(), runAfter.toISOString());
  assert.equal(mock.manifest.length, 4);
});

test("automatic terminal recovery requeues without fabricating a password confirmation", async () => {
  const mock = recoveryTransaction({
    requestStatus: DestructiveActionStatus.RUNNING,
    jobStatus: PlatformJobStatus.RUNNING
  });
  const result = await requeueGalleryMediaDeletionWithinTransaction(mock.transaction, {
    requestId: "request-1",
    previousJobId: "job-old",
    ownerUserId: "owner-1",
    mediaAssetIds: ["asset-a"],
    expectedRequestStatuses: [DestructiveActionStatus.RUNNING],
    mode: "AUTOMATIC_TERMINAL_RECOVERY",
    error: "R2 unavailable",
    runAfter: new Date("2026-07-21T13:00:00.000Z")
  });

  assert.equal(result.kind, "REQUEUED");
  assert.equal(mock.events.includes("create-retry-security-event"), false);
  assert.equal(mock.events.includes("audit-requeue"), true);
  const requestWrite = mock.writes.find((write) => write.name === "request")?.value as any;
  assert.equal(requestWrite.data.result.automaticRecoveryCount, 1);
});

test("automatic recovery refuses to create a successor after the bounded limit", async () => {
  const mock = recoveryTransaction({
    requestStatus: DestructiveActionStatus.RUNNING,
    jobStatus: PlatformJobStatus.RUNNING,
    requestResult: {
      recoveryCount: GALLERY_MEDIA_DELETE_MAX_AUTOMATIC_RECOVERIES,
      automaticRecoveryCount: GALLERY_MEDIA_DELETE_MAX_AUTOMATIC_RECOVERIES
    }
  });
  const result = await requeueGalleryMediaDeletionWithinTransaction(mock.transaction, {
    requestId: "request-1",
    previousJobId: "job-old",
    ownerUserId: "owner-1",
    mediaAssetIds: ["asset-a"],
    expectedRequestStatuses: [DestructiveActionStatus.RUNNING],
    mode: "AUTOMATIC_TERMINAL_RECOVERY",
    error: "R2 unavailable",
    runAfter: new Date("2026-07-21T13:00:00.000Z")
  });

  assert.equal(result.kind, "RECOVERY_LIMIT_REACHED");
  assert.deepEqual(mock.events, []);
});

test("recovery is idempotent when another worker already linked a successor", async () => {
  const mock = recoveryTransaction({
    requestStatus: DestructiveActionStatus.RUNNING,
    jobStatus: PlatformJobStatus.RUNNING,
    replayStatus: DestructiveActionStatus.QUEUED
  });
  const result = await requeueGalleryMediaDeletionWithinTransaction(mock.transaction, {
    requestId: "request-1",
    previousJobId: "job-old",
    ownerUserId: "owner-1",
    mediaAssetIds: ["asset-a"],
    expectedRequestStatuses: [DestructiveActionStatus.RUNNING],
    mode: "AUTOMATIC_TERMINAL_RECOVERY",
    error: "R2 unavailable",
    runAfter: new Date("2026-07-21T13:00:00.000Z")
  });

  assert.equal(result.kind, "ALREADY_REQUESTED");
  assert.equal(result.jobId, "job-new-by-other-worker");
  assert.deepEqual(mock.events, []);
});
