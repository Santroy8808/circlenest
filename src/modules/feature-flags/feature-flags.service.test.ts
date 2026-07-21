import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  FEATURE_FLAG_CATEGORIES,
  FEATURE_FLAG_DEFINITIONS,
  canLockedActorManageFeatureFlags,
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

test("feature mutations re-authorize the locked current actor snapshot", () => {
  assert.equal(canLockedActorManageFeatureFlags({ role: UserRole.ADMIN, deactivatedAt: null }), true);
  assert.equal(canLockedActorManageFeatureFlags({ role: UserRole.GOD, deactivatedAt: null }), true);
  assert.equal(canLockedActorManageFeatureFlags({ role: UserRole.MEMBER, deactivatedAt: null }), false);
  assert.equal(canLockedActorManageFeatureFlags({ role: UserRole.ADMIN, deactivatedAt: new Date() }), false);
  assert.equal(canLockedActorManageFeatureFlags(null), false);
});
