import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { parseFeedStreamMode } from "@/modules/feed-stream/feed-route-contract";

test("Stream route defaults to public and accepts only implemented filters", () => {
  assert.deepEqual(parseFeedStreamMode(null), { ok: true, mode: "public" });
  assert.deepEqual(parseFeedStreamMode("friends"), { ok: true, mode: "friends" });
  assert.deepEqual(parseFeedStreamMode("pics"), { ok: false, error: "Unknown Stream filter." });
  assert.deepEqual(parseFeedStreamMode("groups"), { ok: false, error: "Unknown Stream filter." });
});

test("feed post deletion uses authenticated admin authority instead of active display actor", () => {
  const route = readFileSync(resolve("src/app/api/feed/posts/[postId]/route.ts"), "utf8");

  assert.match(route, /import \{ isAdminRole \} from "@\/lib\/platform\/roles";/);
  assert.match(route, /const deleteActorUserId = isAdminRole\(session\.user\.role\) \? session\.user\.id : actor\.actorUserId;/);
  assert.match(route, /deleteFeedPost\(deleteActorUserId, params\.postId\)/);
});
