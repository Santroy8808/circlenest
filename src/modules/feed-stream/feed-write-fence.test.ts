import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { MediaAssetStatus, type Prisma } from "@prisma/client";
import { AccountDeletionFenceConflictError } from "@/lib/platform/account-deletion-fence";
import { assertFeedChildWriteAllowed } from "@/modules/feed-stream/feed-write-fence";

function fakeFeedWriteTransaction(input: { omitUserIds?: string[] } = {}) {
  const events: string[] = [];
  let rawCall = 0;
  const users = ["actor-1", "author-1", "target-1", "post-media-owner-1", "child-media-owner-1"];
  const tx = {
    $queryRaw: async () => {
      rawCall += 1;
      if (rawCall === 1) {
        events.push("post-locked");
        return [{
          id: "post-1",
          authorUserId: "author-1",
          targetProfileUserId: "target-1",
          mediaOwnerUserId: "post-media-owner-1"
        }];
      }
      if (rawCall === 2) {
        events.push("media-owners-locked");
        return users.map((id) => ({ id }));
      }
      if (rawCall === 3) {
        events.push("media-assets-locked");
        return [{
          id: "asset-1",
          ownerUserId: "child-media-owner-1",
          status: MediaAssetStatus.READY
        }];
      }
      events.push("users-locked");
      return users
        .filter((userId) => !(input.omitUserIds ?? []).includes(userId))
        .map((id) => ({ id, deactivatedAt: null }));
    },
    feedComment: { findFirst: async () => null },
    mediaAsset: {
      findMany: async () => [{ id: "asset-1", ownerUserId: "child-media-owner-1" }]
    },
    destructiveActionRequest: { findMany: async () => [] }
  } as unknown as Prisma.TransactionClient;
  return { tx, events };
}

test("feed child writes lock the post before sorted deletion-fence users", async () => {
  const { tx, events } = fakeFeedWriteTransaction();
  await assertFeedChildWriteAllowed(tx, {
    postId: "post-1",
    actorUserId: "actor-1",
    mediaAssetIds: ["asset-1"]
  });
  assert.deepEqual(events, [
    "post-locked",
    "media-owners-locked",
    "media-assets-locked",
    "users-locked"
  ]);
});

test("feed child writes fence linked media owners", async () => {
  const { tx } = fakeFeedWriteTransaction({ omitUserIds: ["child-media-owner-1"] });
  await assert.rejects(
    () => assertFeedChildWriteAllowed(tx, {
      postId: "post-1",
      actorUserId: "actor-1",
      mediaAssetIds: ["asset-1"]
    }),
    AccountDeletionFenceConflictError
  );
});

test("hold snapshots and feed child writers share the same post mutex", () => {
  const retention = readFileSync(resolve(
    "src/modules/feed-stream/feed-retention.service.ts"
  ), "utf8");
  const feed = readFileSync(resolve("src/modules/feed-stream/feed-stream.service.ts"), "utf8");
  const hashtags = readFileSync(resolve(
    "src/modules/feed-stream/hashtag-signals.service.ts"
  ), "utf8");
  const cleanup = readFileSync(resolve(
    "src/modules/admin-moderation/account-cleanup.service.ts"
  ), "utf8");

  assert.equal(retention.match(/await lockFeedPostForWrite\(tx, parsed\.data\.postId\)/g)?.length, 2);
  assert.match(retention, /const allowed = await assertFeedChildWriteAllowed\(tx,[\s\S]*?for \(const comment/);
  assert.ok((feed.match(/await assertFeed(?:Child|Comment)WriteAllowed\(tx,/g)?.length ?? 0) >= 7);
  assert.equal(hashtags.match(/await assertFeedChildWriteAllowed\(tx,/g)?.length, 2);

  const reconcile = cleanup.indexOf("async function reconcileAccountDeletionStorageSources");
  const feedPostLock = cleanup.indexOf('FROM "FeedPost"', reconcile);
  const userLock = cleanup.indexOf('FROM "User"', feedPostLock);
  assert.ok(feedPostLock > 0 && userLock > feedPostLock);
});
