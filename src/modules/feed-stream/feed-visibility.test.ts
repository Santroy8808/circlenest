import assert from "node:assert/strict";
import test from "node:test";
import { FeedVisibility } from "@prisma/client";
import {
  isPublicStreamVisibility,
  publicStreamVisibilityFilter
} from "@/modules/feed-stream/feed-visibility";

test("public stream visibility reads both current and legacy rows", () => {
  assert.deepEqual(publicStreamVisibilityFilter(), {
    in: [FeedVisibility.PUBLIC, FeedVisibility.MEMBERS]
  });
  assert.equal(isPublicStreamVisibility(FeedVisibility.PUBLIC), true);
  assert.equal(isPublicStreamVisibility(FeedVisibility.MEMBERS), true);
  assert.equal(isPublicStreamVisibility(FeedVisibility.FRIENDS), false);
  assert.equal(isPublicStreamVisibility(FeedVisibility.PRIVATE), false);
});
