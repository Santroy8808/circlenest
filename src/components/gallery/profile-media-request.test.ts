import assert from "node:assert/strict";
import test from "node:test";
import { requestProfileMedia } from "./profile-media-request";

test("profile media request returns success and sends the exact typed command", async () => {
  let requestBody = "";
  const result = await requestProfileMedia(
    { mediaAssetId: "asset-1", target: "avatar" },
    async (_url, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        ok: true,
        mediaUrl: "/api/media/assets/asset-1",
        profile: { avatarUrl: "/api/media/assets/asset-1", bannerUrl: null }
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(JSON.parse(requestBody), { mediaAssetId: "asset-1", target: "avatar" });
});

test("profile media request preserves a stable JSON API error", async () => {
  const result = await requestProfileMedia(
    { mediaAssetId: "asset-1", target: "banner" },
    async () => new Response(JSON.stringify({ error: "That photo was not found in My Pics." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  );

  assert.deepEqual(result, { ok: false, error: "That photo was not found in My Pics." });
});

test("profile media request converts an HTML server failure into a safe message", async () => {
  const result = await requestProfileMedia(
    { mediaAssetId: "asset-1", target: "avatar" },
    async () => new Response("<html>Internal Server Error</html>", {
      status: 500,
      headers: { "Content-Type": "text/html" }
    })
  );

  assert.deepEqual(result, { ok: false, error: "Could not update profile image. Please try again." });
});

test("profile media request converts a network rejection into a safe message", async () => {
  const result = await requestProfileMedia(
    { mediaAssetId: "asset-1", target: "avatar" },
    async () => {
      throw new Error("connection reset");
    }
  );

  assert.deepEqual(result, { ok: false, error: "Could not update profile image. Please try again." });
});

test("profile media request rejects a malformed success response instead of reporting false success", async () => {
  const result = await requestProfileMedia(
    { mediaAssetId: "asset-1", target: "avatar" },
    async () => new Response("<html>Unexpected proxy response</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" }
    })
  );

  assert.deepEqual(result, { ok: false, error: "Could not update profile image. Please try again." });
});

test("profile media request rejects a success response for the wrong asset", async () => {
  const result = await requestProfileMedia(
    { mediaAssetId: "asset-1", target: "banner" },
    async () => new Response(JSON.stringify({
      ok: true,
      mediaUrl: "/api/media/assets/asset-2",
      profile: { avatarUrl: null, bannerUrl: "/api/media/assets/asset-2" }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  );

  assert.deepEqual(result, { ok: false, error: "Could not update profile image. Please try again." });
});
