import assert from "node:assert/strict";
import test from "node:test";
import { canViewerPromoteJob } from "@/modules/jobs/jobs.service";

test("job promotion requires both listing ownership and an advertising capability", () => {
  const base = {
    viewerUserId: "viewer",
    employerUserId: "viewer",
    canCreateGeneralAd: false
  };

  assert.equal(canViewerPromoteJob(base), false);
  assert.equal(canViewerPromoteJob({ ...base, canCreateGeneralAd: true }), true);
  assert.equal(
    canViewerPromoteJob({
      ...base,
      employerUserId: "someone-else",
      canCreateGeneralAd: true
    }),
    false
  );
});
