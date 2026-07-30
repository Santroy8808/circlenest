import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  finalizeThetaCommUpload,
  removePendingThetaCommUpload,
  thetaCommStoredObject,
  writePendingThetaCommPart
} from "@/modules/theta-comm/blob-storage";

test("server-local encrypted chunks assemble with checksum and path confinement", async () => {
  const previousRoot = process.env.THETA_COMM_STORAGE_ROOT;
  const root = await mkdtemp(join(tmpdir(), "theta-comm-storage-"));
  process.env.THETA_COMM_STORAGE_ROOT = root;
  try {
    const uploadId = "upload_test_123";
    const first = Buffer.from("opaque-ciphertext-part-one");
    const second = Buffer.from("opaque-ciphertext-part-two");
    const ciphertext = Buffer.concat([first, second]);
    await writePendingThetaCommPart(uploadId, 1, first);
    await writePendingThetaCommPart(uploadId, 2, second);
    await finalizeThetaCommUpload({
      uploadId,
      storageKey: "v2/account/2026-07-29/ciphertext.bin",
      totalChunks: 2,
      expectedSizeBytes: BigInt(ciphertext.length),
      ciphertextSha256: createHash("sha256").update(ciphertext).digest("hex")
    });
    const stored = await thetaCommStoredObject(
      "v2/account/2026-07-29/ciphertext.bin"
    );
    assert.deepEqual(await readFile(stored.filePath), ciphertext);
    await assert.rejects(() => thetaCommStoredObject("../../outside.bin"));

    const rejectedUploadId = "upload_bad_hash_123";
    await writePendingThetaCommPart(rejectedUploadId, 1, first);
    await assert.rejects(() =>
      finalizeThetaCommUpload({
        uploadId: rejectedUploadId,
        storageKey: "v2/account/2026-07-29/rejected.bin",
        totalChunks: 1,
        expectedSizeBytes: BigInt(first.length),
        ciphertextSha256: "0".repeat(64)
      })
    );
    await removePendingThetaCommUpload(uploadId);
    await removePendingThetaCommUpload(rejectedUploadId);
  } finally {
    if (previousRoot === undefined) {
      delete process.env.THETA_COMM_STORAGE_ROOT;
    } else {
      process.env.THETA_COMM_STORAGE_ROOT = previousRoot;
    }
    await rm(root, { recursive: true, force: true });
  }
});
