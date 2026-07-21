import assert from "node:assert/strict";
import test from "node:test";
import { platformApiFeatureAccessDecision } from "@/modules/feature-flags/api-feature-access";

test("enabled Writers and Auditor features permit their API contracts", () => {
  assert.deepEqual(platformApiFeatureAccessDecision("publishing.writers_corner", true), { allowed: true });
  assert.deepEqual(platformApiFeatureAccessDecision("directory.auditor_directory", true), { allowed: true });
});

test("disabled platform features return stable truthful service-unavailable contracts", () => {
  assert.deepEqual(platformApiFeatureAccessDecision("publishing.writers_corner", false), {
    allowed: false,
    status: 503,
    code: "FEATURE_UNAVAILABLE",
    error: "Writers Corner is temporarily unavailable."
  });
  assert.deepEqual(platformApiFeatureAccessDecision("directory.auditor_directory", false), {
    allowed: false,
    status: 503,
    code: "FEATURE_UNAVAILABLE",
    error: "Auditor Directory is temporarily unavailable."
  });
});
