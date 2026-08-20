import assert from "node:assert/strict";
import test from "node:test";
import { selectOldestAssetsForStorageArchive } from "@/modules/membership-policy/membership-storage-archive.service";

test("storage downgrade archives the oldest files needed to return active storage to the target quota", () => {
  const oldestToNewest = [
    { id: "oldest", sizeBytes: BigInt(300) },
    { id: "middle", sizeBytes: BigInt(200) },
    { id: "newest", sizeBytes: BigInt(150) }
  ];

  const result = selectOldestAssetsForStorageArchive(oldestToNewest, BigInt(400));

  assert.equal(result.totalBytes, BigInt(650));
  assert.equal(result.selectedBytes, BigInt(300));
  assert.deepEqual(result.selected.map((asset) => asset.id), ["oldest"]);
});

test("storage downgrade does not archive files when active storage already fits the target quota", () => {
  const result = selectOldestAssetsForStorageArchive([
    { id: "older", sizeBytes: BigInt(100) },
    { id: "newer", sizeBytes: BigInt(100) }
  ], BigInt(200));

  assert.equal(result.selectedBytes, BigInt(0));
  assert.deepEqual(result.selected, []);
});
