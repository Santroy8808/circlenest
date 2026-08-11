import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { updateFeedCommentSchema, updateFeedPostSchema } from "@/modules/feed-stream/types";

test("feed edit contracts allow an empty body for media-only content", () => {
  assert.deepEqual(updateFeedPostSchema.safeParse({ body: "" }).success, true);
  assert.deepEqual(updateFeedCommentSchema.safeParse({ body: "" }).success, true);
});

test("feed edit contracts enforce the existing post and comment limits", () => {
  assert.equal(updateFeedPostSchema.safeParse({ body: "a".repeat(4001) }).success, false);
  assert.equal(updateFeedCommentSchema.safeParse({ body: "a".repeat(2001) }).success, false);
});

test("feed displays edit controls only through the author identity and keeps replies in place", () => {
  const client = readFileSync(resolve("src/components/feed/feed-client.tsx"), "utf8");

  assert.match(client, /composerIdentity\.id === post\.author\.id/);
  assert.match(client, /currentUserId === comment\.author\.id/);
  assert.match(client, /updateCommentBodyTree\(post\.comments, payload\.comment!\)/);
  assert.match(client, /method: "PUT"/);
  assert.match(client, /\/api\/feed\/comments\/\$\{commentId\}/);
});
