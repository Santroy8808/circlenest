import assert from "node:assert/strict";
import test from "node:test";
import { MediaAssetStatus, Prisma } from "@prisma/client";
import {
  isProfileMediaMimeType,
  profileMediaAssetSelectionWhere,
  selectProfileMediaWithinTransaction
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

test("profile media selection locks the owner before the asset and validates before writing", async () => {
  const events: string[] = [];
  let lockCall = 0;
  const transaction = {
    $queryRaw: async () => {
      lockCall += 1;
      events.push(lockCall === 1 ? "lock-user" : "lock-asset");
      return [{ id: lockCall === 1 ? "owner-1" : "asset-1" }];
    },
    user: {
      findUnique: async () => {
        events.push("read-user");
        return { id: "owner-1", username: "owner", profile: null };
      }
    },
    mediaAsset: {
      findFirst: async () => {
        events.push("read-asset");
        return { id: "asset-1", mimeType: "image/webp" };
      }
    },
    profile: {
      upsert: async () => {
        events.push("write-profile");
        return {
          userId: "owner-1",
          avatarUrl: "/api/media/assets/asset-1",
          bannerUrl: null,
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        };
      }
    }
  } as unknown as Prisma.TransactionClient;

  const result = await selectProfileMediaWithinTransaction(transaction, "owner-1", {
    mediaAssetId: "asset-1",
    target: "avatar"
  });

  assert.equal(result.kind, "SELECTED");
  assert.deepEqual(events, ["lock-user", "lock-asset", "read-user", "read-asset", "write-profile"]);
});
