import assert from "node:assert/strict";
import test from "node:test";
import {
  moveGalleryVisibilityStorageObjects,
  type GalleryVisibilityStorageMoveOperations,
  type GalleryVisibilityStorageObject
} from "./gallery-visibility-storage-move";

const objects: GalleryVisibilityStorageObject[] = [
  { storageKey: "media/main.jpg", label: "photo", expectedSizeBytes: 120, expectedMimeType: "image/jpeg" },
  { storageKey: "media/thumb.jpg", label: "photo thumbnail", expectedMimeType: "image/jpeg" }
];

test("prepares and verifies every destination before deleting either source object", async () => {
  const events: string[] = [];
  const sourceObjects = new Set(objects.map((object) => object.storageKey));
  const destinationObjects = new Set<string>();
  const operations: GalleryVisibilityStorageMoveOperations = {
    async verifyDestination(object, access) {
      events.push(`verify:${access}:${object.storageKey}`);
      return destinationObjects.has(object.storageKey)
        ? { ok: true }
        : { ok: false, error: "Destination is missing." };
    },
    async copyDestination(object, sourceAccess, destinationAccess) {
      events.push(`copy:${sourceAccess}:${destinationAccess}:${object.storageKey}`);
      assert.equal(sourceObjects.has(object.storageKey), true);
      destinationObjects.add(object.storageKey);
    },
    async deleteSource(object, access) {
      events.push(`delete:${access}:${object.storageKey}`);
      sourceObjects.delete(object.storageKey);
    },
    async verifySourceAbsent(object, access) {
      events.push(`absent:${access}:${object.storageKey}`);
      return sourceObjects.has(object.storageKey)
        ? { ok: false, error: "Source still exists." }
        : { ok: true };
    }
  };

  const result = await moveGalleryVisibilityStorageObjects(
    { objects, sourceAccess: "private", destinationAccess: "public" },
    operations
  );

  assert.equal(result.ok, true);
  assert.deepEqual(events, [
    "verify:public:media/main.jpg",
    "copy:private:public:media/main.jpg",
    "verify:public:media/main.jpg",
    "verify:public:media/thumb.jpg",
    "copy:private:public:media/thumb.jpg",
    "verify:public:media/thumb.jpg",
    "delete:private:media/main.jpg",
    "absent:private:media/main.jpg",
    "delete:private:media/thumb.jpg",
    "absent:private:media/thumb.jpg"
  ]);
  assert.deepEqual(sourceObjects, new Set());
  assert.deepEqual(destinationObjects, new Set(objects.map((object) => object.storageKey)));
});

test("returns retryable progress without deleting sources when destination preparation is incomplete", async () => {
  const deletedStorageKeys: string[] = [];
  const verificationAttempts = new Map<string, number>();
  const operations: GalleryVisibilityStorageMoveOperations = {
    async verifyDestination(object) {
      const attempt = (verificationAttempts.get(object.storageKey) ?? 0) + 1;
      verificationAttempts.set(object.storageKey, attempt);
      if (object.storageKey === "media/main.jpg" && attempt === 2) return { ok: true };
      return { ok: false, error: "Destination is missing." };
    },
    async copyDestination() {},
    async deleteSource(object) {
      deletedStorageKeys.push(object.storageKey);
    },
    async verifySourceAbsent() {
      return { ok: true };
    }
  };

  const result = await moveGalleryVisibilityStorageObjects(
    { objects, sourceAccess: "private", destinationAccess: "public" },
    operations
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, true);
  assert.equal(result.progress.failedPhase, "VERIFY_DESTINATION");
  assert.equal(result.progress.failedStorageKey, "media/thumb.jpg");
  assert.deepEqual(result.progress.destinationVerifiedStorageKeys, ["media/main.jpg"]);
  assert.deepEqual(result.progress.sourceAbsentStorageKeys, []);
  assert.deepEqual(deletedStorageKeys, []);
});

test("retries a partially completed public-to-private move idempotently", async () => {
  const copiedStorageKeys: string[] = [];
  const deletedStorageKeys: string[] = [];
  const destinationObjects = new Set(objects.map((object) => object.storageKey));
  const sourceObjects = new Set(["media/thumb.jpg"]);
  const operations: GalleryVisibilityStorageMoveOperations = {
    async verifyDestination(object, access) {
      assert.equal(access, "private");
      return destinationObjects.has(object.storageKey)
        ? { ok: true }
        : { ok: false, error: "Destination is missing." };
    },
    async copyDestination(object) {
      copiedStorageKeys.push(object.storageKey);
    },
    async deleteSource(object, access) {
      assert.equal(access, "public");
      deletedStorageKeys.push(object.storageKey);
      sourceObjects.delete(object.storageKey);
    },
    async verifySourceAbsent(object, access) {
      assert.equal(access, "public");
      return sourceObjects.has(object.storageKey)
        ? { ok: false, error: "Source still exists." }
        : { ok: true };
    }
  };

  const result = await moveGalleryVisibilityStorageObjects(
    { objects, sourceAccess: "public", destinationAccess: "private" },
    operations
  );

  assert.equal(result.ok, true);
  assert.deepEqual(copiedStorageKeys, []);
  assert.deepEqual(deletedStorageKeys, ["media/main.jpg", "media/thumb.jpg"]);
  assert.deepEqual(sourceObjects, new Set());
});
