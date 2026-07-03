import "./load-next-env";

import { randomUUID } from "node:crypto";

import { createPresignedR2PutUrl, deleteR2Object, isR2Configured, readR2Config, verifyR2Object } from "../src/lib/platform/r2";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

async function main() {
  const r2 = readR2Config();

  if (!isR2Configured(r2)) {
    throw new Error("Cloudflare R2 is not configured for this environment.");
  }

  const storageKey = `smoke-tests/r2/${Date.now()}-${randomUUID()}.png`;
  const mimeType = "image/png";
  const uploadUrl = await createPresignedR2PutUrl({
    storageKey,
    mimeType,
    sizeBytes: onePixelPng.byteLength,
    expiresInSeconds: 120
  });

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": mimeType
    },
    body: onePixelPng
  });

  if (!uploadResponse.ok) {
    throw new Error(`R2 presigned upload failed with HTTP ${uploadResponse.status}.`);
  }

  const verified = await verifyR2Object({
    storageKey,
    expectedSizeBytes: onePixelPng.byteLength,
    expectedMimeType: mimeType,
    label: "R2 smoke image"
  });

  if (!verified.ok) {
    throw new Error(verified.error);
  }

  await deleteR2Object(storageKey);

  console.info("[r2-smoke] presigned upload ok");
  console.info("[r2-smoke] object verification ok");
  console.info("[r2-smoke] cleanup ok");
}

main().catch((error) => {
  console.error("[r2-smoke] failed");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
