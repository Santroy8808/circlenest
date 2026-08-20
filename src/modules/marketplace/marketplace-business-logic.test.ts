import assert from "node:assert/strict";
import test from "node:test";
import {
  MarketplaceListingEventType,
  MarketplaceListingStatus,
  MarketplaceSavedSearchFrequency,
} from "@prisma/client";

import { marketplaceFacetsFromAttributes, marketplaceStatusEvent } from "./marketplace-listings.service";
import { savedSearchDueAt } from "./marketplace-saved-search.service";

test("structured attributes become typed searchable facets", () => {
  assert.deepEqual(
    marketplaceFacetsFromAttributes({
      make: "Ford",
      mileage: 52_000,
      mileageUnit: "mi",
      furnished: true,
      amenities: ["Parking", "Laundry"],
      vin: "PRIVATEVIN123",
      showVin: false,
      legalComplianceAttested: true,
      longDescription: "x".repeat(241),
      empty: null,
    }),
    [
      { key: "make", valueText: "Ford", unit: undefined },
      { key: "mileage", valueNumber: 52_000, unit: "mi" },
      { key: "furnished", valueBoolean: true },
      { key: "amenities", valueText: "Parking" },
      { key: "amenities", valueText: "Laundry" },
    ],
  );
});

test("owner status actions map to durable listing events", () => {
  assert.equal(marketplaceStatusEvent(MarketplaceListingStatus.PAUSED), MarketplaceListingEventType.PAUSED);
  assert.equal(marketplaceStatusEvent(MarketplaceListingStatus.RESERVED), MarketplaceListingEventType.RESERVED);
  assert.equal(marketplaceStatusEvent(MarketplaceListingStatus.FULFILLED), MarketplaceListingEventType.FULFILLED);
  assert.equal(marketplaceStatusEvent(MarketplaceListingStatus.ACTIVE), null);
});

test("saved search schedules are deterministic", () => {
  const lastRun = new Date("2026-08-20T12:00:00.000Z");
  assert.equal(savedSearchDueAt(MarketplaceSavedSearchFrequency.NONE, lastRun), null);
  assert.equal(savedSearchDueAt(MarketplaceSavedSearchFrequency.IMMEDIATE, lastRun)?.toISOString(), "2026-08-20T12:15:00.000Z");
  assert.equal(savedSearchDueAt(MarketplaceSavedSearchFrequency.DAILY, lastRun)?.toISOString(), "2026-08-21T12:00:00.000Z");
  assert.equal(savedSearchDueAt(MarketplaceSavedSearchFrequency.WEEKLY, lastRun)?.toISOString(), "2026-08-27T12:00:00.000Z");
});
