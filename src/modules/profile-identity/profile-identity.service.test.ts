import assert from "node:assert/strict";
import test from "node:test";
import { MediaAssetStatus } from "@prisma/client";
import {
  isProfileMediaMimeType,
  profileMediaAssetSelectionWhere
} from "@/modules/profile-identity/profile-identity.service";

test("profile media selection is owner-bound and accepts every ready image MIME type", () => {
  assert.deepEqual(profileMediaAssetSelectionWhere("owner-1", "asset-1"), {
    id: "asset-1",
    ownerUserId: "owner-1",
    status: MediaAssetStatus.READY,
    mimeType: { startsWith: "image/", mode: "insensitive" }
  });
  assert.equal(isProfileMediaMimeType("image/webp"), true);
  assert.equal(isProfileMediaMimeType(" IMAGE/PNG "), true);
  assert.equal(isProfileMediaMimeType("application/pdf"), false);
});
