import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardAvailableWidgets } from "@/modules/dashboard/dashboard.service";

test("dashboard availability reflects enabled platform and membership features", () => {
  const widgets = buildDashboardAvailableWidgets({
    features: {
      "market.browse": true,
      "jobs.browse": true,
      "market.storefront": true
    },
    platformFeatures: {
      "marketplace.member_market": true,
      "communication.direct_messages": true,
      "community.groups": true,
      "media.personal_gallery": true
    }
  });

  assert.deepEqual(widgets, ["market", "jobs", "stream", "messages", "groups", "gallery", "business"]);
});

test("dashboard never exposes disabled feature widgets", () => {
  const widgets = buildDashboardAvailableWidgets({
    features: { "jobs.browse": false, "market.browse": false },
    platformFeatures: {
      "marketplace.member_market": false,
      "communication.direct_messages": false,
      "community.groups": false,
      "media.personal_gallery": false
    }
  });

  assert.deepEqual(widgets, ["stream"]);
});
