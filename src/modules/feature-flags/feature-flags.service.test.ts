import assert from "node:assert/strict";
import test from "node:test";
import {
  FEATURE_FLAG_CATEGORIES,
  FEATURE_FLAG_DEFINITIONS,
  getFeatureFlagCategory,
  getRegisteredFeatureFlag,
  isFeatureFlagVersionMatch
} from "./feature-flags.service";

test("the feature registry has unique keys and every feature belongs to a registered category", () => {
  const keys = FEATURE_FLAG_DEFINITIONS.map((definition) => definition.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const definition of FEATURE_FLAG_DEFINITIONS) {
    assert.equal(getRegisteredFeatureFlag(definition.key)?.key, definition.key);
    assert.ok(FEATURE_FLAG_CATEGORIES.some((category) => category.key === definition.categoryKey));
  }
  assert.equal(getRegisteredFeatureFlag("unregistered.feature"), null);
  assert.equal(getFeatureFlagCategory("unregistered-category"), null);
});

test("optimistic feature versions accept the current version and reject stale versions", () => {
  assert.equal(isFeatureFlagVersionMatch(undefined, 7), true);
  assert.equal(isFeatureFlagVersionMatch(7, 7), true);
  assert.equal(isFeatureFlagVersionMatch(6, 7), false);
});
