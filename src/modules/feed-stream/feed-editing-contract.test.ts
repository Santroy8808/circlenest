import assert from "node:assert/strict";
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
