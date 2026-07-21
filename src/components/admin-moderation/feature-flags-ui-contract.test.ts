import assert from "node:assert/strict";
import test from "node:test";
import type { RegisteredFeatureFlagView } from "@/modules/feature-flags/feature-flags.service";
import {
  buildFeatureFlagCommand,
  describeFeatureFlagMutationResult,
  isFeatureFlagCatalogResponse,
  isFeatureFlagMutationResponse,
  isRegisteredFeatureFlagView,
  serializeFeatureFlagIntent,
  type FeatureFlagPendingChange
} from "./feature-flags-ui-contract";

function flag(overrides: Partial<RegisteredFeatureFlagView> & Pick<RegisteredFeatureFlagView, "key" | "categoryKey">) {
  return {
    title: overrides.key,
    area: "Test",
    description: "Test feature",
    effectWhenDisabled: "Unavailable",
    enforcement: "Test",
    risk: "medium",
    defaultEnabled: true,
    enabled: true,
    version: 0,
    source: "default",
    overrideDescription: null,
    updatedAt: null,
    ...overrides
  } as RegisteredFeatureFlagView;
}

const featureChange: FeatureFlagPendingChange = {
  scope: "feature",
  key: "community.groups",
  title: "Groups",
  action: "set",
  enabled: false,
  effectWhenDisabled: "Groups are unavailable."
};

test("feature commands carry the current feature version and normalized exact intent", () => {
  const flags = [flag({ key: "community.groups", categoryKey: "community", version: 7 })];
  const first = buildFeatureFlagCommand(featureChange, "  Disable during review.\r\nTicket 42.  ", flags);
  const second = buildFeatureFlagCommand(featureChange, "Disable during review.\nTicket 42.", flags);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(first.command, {
    action: "set",
    key: "community.groups",
    enabled: false,
    reason: "Disable during review.\nTicket 42.",
    expectedVersion: 7
  });
  assert.equal(serializeFeatureFlagIntent(first.command), serializeFeatureFlagIntent(second.command));
});

test("a changed version or reason creates a different durable command intent", () => {
  const first = buildFeatureFlagCommand(
    featureChange,
    "Disable during review.",
    [flag({ key: "community.groups", categoryKey: "community", version: 7 })]
  );
  const changedVersion = buildFeatureFlagCommand(
    featureChange,
    "Disable during review.",
    [flag({ key: "community.groups", categoryKey: "community", version: 8 })]
  );
  const changedReason = buildFeatureFlagCommand(
    featureChange,
    "Disable after incident review.",
    [flag({ key: "community.groups", categoryKey: "community", version: 7 })]
  );

  assert.equal(first.ok, true);
  assert.equal(changedVersion.ok, true);
  assert.equal(changedReason.ok, true);
  if (!first.ok || !changedVersion.ok || !changedReason.ok) return;
  assert.notEqual(serializeFeatureFlagIntent(first.command), serializeFeatureFlagIntent(changedVersion.command));
  assert.notEqual(serializeFeatureFlagIntent(first.command), serializeFeatureFlagIntent(changedReason.command));
});

test("category commands include every current version in stable key order", () => {
  const change: FeatureFlagPendingChange = {
    scope: "category",
    key: "market-discovery",
    title: "Market, Publishing & Discovery",
    action: "set-category",
    enabled: false,
    effectWhenDisabled: "The category is unavailable."
  };
  const result = buildFeatureFlagCommand(change, "Pause category for review.", [
    flag({ key: "publishing.writers_corner", categoryKey: "market-discovery", version: 6 }),
    flag({ key: "marketplace.member_market", categoryKey: "market-discovery", version: 2 }),
    flag({ key: "directory.auditor_directory", categoryKey: "market-discovery", version: 4 }),
    flag({ key: "community.groups", categoryKey: "community", version: 9 })
  ]);

  assert.equal(result.ok, true);
  if (!result.ok || result.command.action !== "set-category") return;
  assert.deepEqual(Object.entries(result.command.expectedVersions), [
    ["directory.auditor_directory", 4],
    ["marketplace.member_market", 2],
    ["publishing.writers_corner", 6]
  ]);
});

test("catalog and mutation guards reject incomplete API responses", () => {
  const catalog = {
    catalogVersion: 1,
    flags: [flag({ key: "community.groups", categoryKey: "community", version: 3 })]
  };
  assert.equal(isFeatureFlagCatalogResponse(catalog), true);
  assert.equal(isFeatureFlagMutationResponse(catalog), false);
  assert.equal(isFeatureFlagMutationResponse({
    ...catalog,
    ok: true,
    receipt: { commandId: "feature-flag:123", auditLogId: "audit-1", replayed: true }
  }), true);
  assert.equal(isFeatureFlagMutationResponse({
    ...catalog,
    ok: true,
    receipt: { commandId: " ", auditLogId: "audit-1", replayed: true }
  }), false);
  assert.equal(isFeatureFlagMutationResponse({
    ...catalog,
    ok: true,
    receipt: { commandId: "feature-flag:123", auditLogId: "", replayed: false }
  }), false);
  assert.equal(isFeatureFlagCatalogResponse({ ...catalog, catalogVersion: 0 }), false);
});

test("catalog validation checks every flag field used by the interface", () => {
  const valid = flag({
    key: "community.groups",
    categoryKey: "community",
    title: "Groups",
    version: 3,
    source: "override",
    overrideDescription: "Temporary operational setting.",
    updatedAt: "2026-07-21T12:00:00.000Z"
  });
  assert.equal(isRegisteredFeatureFlagView(valid), true);

  const invalidValues: Array<[keyof RegisteredFeatureFlagView, unknown]> = [
    ["key", ""],
    ["title", 4],
    ["categoryKey", null],
    ["area", ""],
    ["description", false],
    ["effectWhenDisabled", ""],
    ["enforcement", 12],
    ["risk", "urgent"],
    ["defaultEnabled", "true"],
    ["enabled", 1],
    ["version", -1],
    ["source", "database"],
    ["overrideDescription", 42],
    ["updatedAt", "not-a-date"]
  ];
  for (const [field, value] of invalidValues) {
    assert.equal(isRegisteredFeatureFlagView({ ...valid, [field]: value }), false, `${field} must be validated`);
  }
});

test("success copy reports the canonical returned feature state rather than the request", () => {
  const message = describeFeatureFlagMutationResult(
    featureChange,
    [flag({
      key: "community.groups",
      categoryKey: "community",
      title: "Groups",
      enabled: true,
      source: "default"
    })],
    { commandId: "feature-flag:123", auditLogId: "audit-23", replayed: false }
  );

  assert.match(message, /The change was recorded\. Audit receipt: audit-23\./);
  assert.match(message, /Current state: Groups is on \(documented default\)\./);
  assert.equal(message.includes("Groups is off"), false);
});

test("replay copy identifies the prior receipt and reports a mixed canonical category", () => {
  const categoryChange: FeatureFlagPendingChange = {
    scope: "category",
    key: "market-discovery",
    title: "Market, Publishing & Discovery",
    action: "set-category",
    enabled: false,
    effectWhenDisabled: "The category is unavailable."
  };
  const message = describeFeatureFlagMutationResult(
    categoryChange,
    [
      flag({ key: "marketplace.member_market", categoryKey: "market-discovery", enabled: true }),
      flag({ key: "publishing.writers_corner", categoryKey: "market-discovery", enabled: false }),
      flag({ key: "directory.auditor_directory", categoryKey: "market-discovery", enabled: false })
    ],
    { commandId: "feature-flag:123", auditLogId: "audit-prior", replayed: true }
  );

  assert.match(message, /identical command was already applied earlier/);
  assert.match(message, /Prior command audit receipt: audit-prior\./);
  assert.match(message, /Current state: Market, Publishing & Discovery is mixed \(1 of 3 features on\)\./);
});
