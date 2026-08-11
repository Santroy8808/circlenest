import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultDashboardConfiguration,
  dashboardVisibleSlots,
  isStreamDashboardFocus,
  normalizeDashboardConfiguration,
  swapDashboardWidgets
} from "@/modules/dashboard/types";

test("dashboard default uses four useful starting widgets", () => {
  const configuration = createDefaultDashboardConfiguration();

  assert.equal(configuration.layout, "quad");
  assert.deepEqual(configuration.slots.map((slot) => slot.widget), ["market", "jobs", "messages", "stream"]);
});

test("dashboard configuration rejects malformed persisted data", () => {
  const configuration = normalizeDashboardConfiguration({ layout: "all" });

  assert.equal(configuration.layout, "quad");
  assert.equal(configuration.primarySlot, "a");
});

test("dashboard configuration removes duplicate and unavailable widgets", () => {
  const configuration = normalizeDashboardConfiguration(
    {
      version: 1,
      layout: "single",
      primarySlot: "b",
      slots: [
        { id: "a", widget: "market" },
        { id: "b", widget: "market" },
        { id: "c", widget: "business" },
        { id: "d", widget: "stream" }
      ]
    },
    ["market", "jobs", "stream"]
  );

  assert.equal(configuration.layout, "single");
  assert.equal(configuration.primarySlot, "b");
  assert.equal(new Set(configuration.slots.map((slot) => slot.widget)).size, 3);
  assert.equal(configuration.slots.some((slot) => slot.widget === "business"), false);
});

test("dashboard visible slots respect the configured layout", () => {
  const configuration = createDefaultDashboardConfiguration();

  assert.equal(dashboardVisibleSlots(configuration).length, 4);
  assert.equal(dashboardVisibleSlots({ ...configuration, layout: "stacked" }).length, 2);
  assert.deepEqual(
    dashboardVisibleSlots({ ...configuration, layout: "single", primarySlot: "c" }).map((slot) => slot.id),
    ["c"]
  );
});

test("a single stream widget opens the normal Stream experience", () => {
  const configuration = createDefaultDashboardConfiguration();
  const streamSlot = configuration.slots.find((slot) => slot.widget === "stream");

  assert.ok(streamSlot);
  assert.equal(isStreamDashboardFocus({ ...configuration, layout: "single", primarySlot: streamSlot.id }), true);
  assert.equal(isStreamDashboardFocus({ ...configuration, layout: "quad", primarySlot: streamSlot.id }), false);
});

test("dashboard widget swaps retain the configured slot positions", () => {
  const configuration = createDefaultDashboardConfiguration();
  const swapped = swapDashboardWidgets(configuration, "a", "d");

  assert.deepEqual(swapped.slots.map((slot) => slot.widget), ["stream", "jobs", "messages", "market"]);
  assert.equal(configuration.slots[0]?.widget, "market");
});
