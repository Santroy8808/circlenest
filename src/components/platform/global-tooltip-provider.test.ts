import assert from "node:assert/strict";
import test from "node:test";
import { tooltipActionDescription } from "@/components/platform/global-tooltip-provider";

test("icon labels resolve to brief action descriptions", () => {
  assert.equal(tooltipActionDescription("Close"), "Close this panel.");
  assert.equal(tooltipActionDescription("Comment"), "Open the discussion and add a comment.");
  assert.equal(
    tooltipActionDescription("Share post"),
    "Share this post by link or echo it to your stream."
  );
  assert.equal(
    tooltipActionDescription("Post options"),
    "Open additional options for this post."
  );
});
