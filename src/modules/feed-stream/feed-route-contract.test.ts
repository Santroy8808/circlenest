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

test("Communicate posts default to the public Stream", () => {
  const client = readFileSync(resolve("src/components/feed/feed-client.tsx"), "utf8");
  const service = readFileSync(resolve("src/modules/feed-stream/feed-stream.service.ts"), "utf8");

  assert.match(client, /body: JSON\.stringify\(\{ body, visibility: FeedVisibility\.PUBLIC,/);
  assert.match(client, /feed-composer-visibility-chip/);
  assert.match(service, /visibility: FeedVisibility\.PUBLIC/);
});

test("feed post deletion uses authenticated admin authority instead of active display actor", () => {
  const route = readFileSync(resolve("src/app/api/feed/posts/[postId]/route.ts"), "utf8");

  assert.match(route, /import \{ isAdminRole \} from "@\/lib\/platform\/roles";/);
  assert.match(route, /const deleteActorUserId = isAdminRole\(session\.user\.role\) \? session\.user\.id : actor\.actorUserId;/);
  assert.match(route, /deleteFeedPost\(deleteActorUserId, params\.postId\)/);
});
