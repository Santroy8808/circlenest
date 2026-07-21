import assert from "node:assert/strict";
import test from "node:test";
import {
  requestGalleryAssetDeletion
} from "./gallery-deletion-request";
import { galleryDeletionStatusMessage } from "./gallery-deletion-status";

test("gallery deletion accepts the durable queued contract without claiming completion", async () => {
  let requestBody = "";
  const result = await requestGalleryAssetDeletion(
    { mediaAssetIds: ["asset-1"], deletePassword: "DELETE" },
    async (_url, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        ok: true,
        status: "queued",
        destructiveActionRequestId: "request-1",
        platformJobId: "job-1",
        mediaAssetIds: ["asset-1"]
      }), { status: 202, headers: { "Content-Type": "application/json" } });
    }
  );

  assert.deepEqual(result, {
    ok: true,
    status: "queued",
    destructiveActionRequestId: "request-1",
    platformJobId: "job-1",
    mediaAssetIds: ["asset-1"]
  });
  assert.deepEqual(JSON.parse(requestBody), {
    mediaAssetIds: ["asset-1"],
    deletePassword: "DELETE"
  });
  assert.match(galleryDeletionStatusMessage("queued", 1), /hidden while secure storage removal is verified/i);
});

test("gallery deletion rejects the obsolete immediate-delete response", async () => {
  const result = await requestGalleryAssetDeletion(
    { mediaAssetIds: ["asset-1"], deletePassword: "DELETE" },
    async () => new Response(JSON.stringify({ deletedCount: 0, deletedMediaAssetIds: [] }), { status: 200 })
  );

  assert.deepEqual(result, { ok: false, error: "Could not queue photo deletion. Please try again." });
});

test("gallery deletion accepts a completed replay after its worker job was retired", async () => {
  const result = await requestGalleryAssetDeletion(
    { mediaAssetIds: ["asset-1"], deletePassword: "DELETE" },
    async () => new Response(JSON.stringify({
      ok: true,
      status: "completed",
      destructiveActionRequestId: "request-1",
      platformJobId: null,
      mediaAssetIds: ["asset-1"]
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  );

  assert.deepEqual(result, {
    ok: true,
    status: "completed",
    destructiveActionRequestId: "request-1",
    platformJobId: null,
    mediaAssetIds: ["asset-1"]
  });
});

test("gallery deletion rejects a success response for a different photo", async () => {
  const result = await requestGalleryAssetDeletion(
    { mediaAssetIds: ["asset-1"], deletePassword: "DELETE" },
    async () => new Response(JSON.stringify({
      ok: true,
      status: "queued",
      destructiveActionRequestId: "request-1",
      platformJobId: "job-1",
      mediaAssetIds: ["asset-2"]
    }), { status: 202, headers: { "Content-Type": "application/json" } })
  );

  assert.deepEqual(result, { ok: false, error: "Could not queue photo deletion. Please try again." });
});

test("gallery deletion preserves safe JSON failures and masks proxy HTML", async () => {
  const jsonFailure = await requestGalleryAssetDeletion(
    { mediaAssetIds: ["asset-1"], deletePassword: "wrong" },
    async () => new Response(JSON.stringify({ error: "DELETE password is required." }), { status: 403 })
  );
  const htmlFailure = await requestGalleryAssetDeletion(
    { mediaAssetIds: ["asset-1"], deletePassword: "DELETE" },
    async () => new Response("<html>proxy failure</html>", { status: 500 })
  );

  assert.deepEqual(jsonFailure, { ok: false, error: "DELETE password is required." });
  assert.deepEqual(htmlFailure, { ok: false, error: "Could not queue photo deletion. Please try again." });
});
