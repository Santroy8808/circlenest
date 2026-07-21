import assert from "node:assert/strict";
import test from "node:test";
import { parseFeedStreamMode } from "@/modules/feed-stream/feed-route-contract";

test("Stream route defaults to public and accepts only implemented filters", () => {
  assert.deepEqual(parseFeedStreamMode(null), { ok: true, mode: "public" });
  assert.deepEqual(parseFeedStreamMode("friends"), { ok: true, mode: "friends" });
  assert.deepEqual(parseFeedStreamMode("pics"), { ok: false, error: "Unknown Stream filter." });
  assert.deepEqual(parseFeedStreamMode("groups"), { ok: false, error: "Unknown Stream filter." });
});
