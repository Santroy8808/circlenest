import assert from "node:assert/strict";
import test from "node:test";
import { MediaAssetStatus, MediaVisibility, Prisma } from "@prisma/client";
import { updateGalleryAssetSettingsWithinTransaction } from "@/modules/gallery-media-storage/gallery-media-storage.service";

const asset = {
  id: "asset-1",
  ownerUserId: "owner-1",
  storageKey: "gallery/asset-1.webp",
  publicUrl: null,
  mimeType: "image/webp",
  sizeBytes: BigInt(2048),
  originalName: "photo.webp",
  status: MediaAssetStatus.READY,
  visibility: MediaVisibility.PRIVATE,
  metadata: {
    source: "GALLERY",
    thumbnailStorageKey: "gallery/asset-1-thumb.webp"
  },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const successfulMove = {
  ok: true as const,
  progress: {
    destinationVerifiedStorageKeys: [asset.storageKey, asset.metadata.thumbnailStorageKey],
    sourceAbsentStorageKeys: [asset.storageKey, asset.metadata.thumbnailStorageKey],
    pendingStorageKeys: [],
    failedStorageKey: null,
    failedPhase: null
  }
};

function transactionMock(options?: { readyAsset?: boolean; savedCount?: number }) {
  const events: string[] = [];
  const lockValues: unknown[][] = [];
  let lockCall = 0;
  let savedWhere: unknown;
  const transaction = {
    $queryRaw: async (query: { values: unknown[] }) => {
      lockCall += 1;
      events.push(lockCall === 1 ? "lock-user" : "lock-asset");
      lockValues.push(query.values);
      return [{ id: lockCall === 1 ? "owner-1" : "asset-1" }];
    },
    mediaAsset: {
      findFirst: async (query: unknown) => {
        events.push("read-ready-asset");
        savedWhere = query;
        return options?.readyAsset === false ? null : asset;
      },
      updateMany: async (query: { where: unknown }) => {
        events.push("save-visibility");
        savedWhere = query.where;
        return { count: options?.savedCount ?? 1 };
      }
    }
  } as unknown as Prisma.TransactionClient;
  return {
    transaction,
    events,
    lockValues,
    savedWhere: () => savedWhere
  };
}

test("visibility move uses the shared User to MediaAsset lock order before touching R2", async () => {
  const mock = transactionMock();
  const result = await updateGalleryAssetSettingsWithinTransaction(
    mock.transaction,
    "owner-1",
    { mediaAssetId: "asset-1", visibility: MediaVisibility.PUBLIC, commentsEnabled: true },
    async () => {
      mock.events.push("move-storage");
      return successfulMove;
    }
  );

  assert.equal(result.kind, "UPDATED");
  assert.deepEqual(mock.events, [
    "lock-user",
    "lock-asset",
    "read-ready-asset",
    "move-storage",
    "save-visibility"
  ]);
  assert.deepEqual(mock.lockValues[1], ["asset-1", "owner-1"]);
  assert.deepEqual(mock.savedWhere(), {
    id: "asset-1",
    ownerUserId: "owner-1",
    status: MediaAssetStatus.READY
  });
});

test("a DELETING asset cannot start or resume a visibility storage move", async () => {
  const mock = transactionMock({ readyAsset: false });
  let moveCalls = 0;
  const result = await updateGalleryAssetSettingsWithinTransaction(
    mock.transaction,
    "owner-1",
    { mediaAssetId: "asset-1", visibility: MediaVisibility.PUBLIC, commentsEnabled: true },
    async () => {
      moveCalls += 1;
      return successfulMove;
    }
  );

  assert.deepEqual(result, { kind: "NOT_FOUND" });
  assert.equal(moveCalls, 0);
  assert.equal(mock.events.includes("save-visibility"), false);
});

test("the asset lock remains in the transaction while storage is moving", async () => {
  const mock = transactionMock();
  let releaseMove: (() => void) | undefined;
  const moveGate = new Promise<void>((resolve) => { releaseMove = resolve; });
  const pending = updateGalleryAssetSettingsWithinTransaction(
    mock.transaction,
    "owner-1",
    { mediaAssetId: "asset-1", visibility: MediaVisibility.PUBLIC, commentsEnabled: true },
    async () => {
      mock.events.push("move-started");
      await moveGate;
      mock.events.push("move-finished");
      return successfulMove;
    }
  );

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(mock.events, ["lock-user", "lock-asset", "read-ready-asset", "move-started"]);
  assert.equal(mock.events.includes("save-visibility"), false);

  releaseMove?.();
  const result = await pending;
  assert.equal(result.kind, "UPDATED");
  assert.deepEqual(mock.events.slice(-2), ["move-finished", "save-visibility"]);
});

test("an incomplete storage move never changes the database visibility", async () => {
  const mock = transactionMock();
  const result = await updateGalleryAssetSettingsWithinTransaction(
    mock.transaction,
    "owner-1",
    { mediaAssetId: "asset-1", visibility: MediaVisibility.PUBLIC, commentsEnabled: true },
    async () => ({
      ok: false,
      code: "GALLERY_STORAGE_MOVE_INCOMPLETE",
      retryable: true,
      error: "copy failed",
      progress: {
        destinationVerifiedStorageKeys: [],
        sourceAbsentStorageKeys: [],
        pendingStorageKeys: [asset.storageKey],
        failedStorageKey: asset.storageKey,
        failedPhase: "COPY_DESTINATION"
      }
    })
  );

  assert.equal(result.kind, "STORAGE_MOVE_INCOMPLETE");
  assert.equal(mock.events.includes("save-visibility"), false);
});

test("the final visibility save is a READY-state compare-and-set", async () => {
  const mock = transactionMock({ savedCount: 0 });
  const result = await updateGalleryAssetSettingsWithinTransaction(
    mock.transaction,
    "owner-1",
    { mediaAssetId: "asset-1", visibility: MediaVisibility.PUBLIC, commentsEnabled: true },
    async () => successfulMove
  );

  assert.deepEqual(result, { kind: "NO_LONGER_READY" });
  assert.deepEqual(mock.savedWhere(), {
    id: "asset-1",
    ownerUserId: "owner-1",
    status: MediaAssetStatus.READY
  });
});
