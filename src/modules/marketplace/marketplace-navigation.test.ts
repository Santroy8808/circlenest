import assert from "node:assert/strict";
import test from "node:test";

import { MARKETPLACE_NAVIGATION, type MarketplaceNavigationItem } from "./marketplace-navigation";

function findItem(items: readonly MarketplaceNavigationItem[], id: string): MarketplaceNavigationItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const nested = item.children ? findItem(item.children, id) : undefined;
    if (nested) return nested;
  }
  return undefined;
}

test("marketplace navigation keeps the top-level directory compact", () => {
  assert.deepEqual(MARKETPLACE_NAVIGATION.map((item) => item.label), ["Buy", "Services", "Rentals", "Find", "Business"]);
});

test("marketplace navigation maps category leaves to existing listing filters", () => {
  assert.deepEqual(findItem(MARKETPLACE_NAVIGATION, "goods-furniture-decor-office")?.query, {
    kind: "GOODS",
    category: "Furniture & Decor",
    subcategory: "Office",
  });
  assert.deepEqual(findItem(MARKETPLACE_NAVIGATION, "find-job")?.query, { kind: "JOB" });
  assert.equal(findItem(MARKETPLACE_NAVIGATION, "find-directory")?.href, "/auditors");
});

test("marketplace navigation exposes the expanded practical taxonomy through collapsed parents", () => {
  assert.deepEqual(findItem(MARKETPLACE_NAVIGATION, "vehicle-rvs-campers")?.query, { kind: "VEHICLE", category: "RVs & Campers" });
  assert.deepEqual(findItem(MARKETPLACE_NAVIGATION, "service-technology-cybersecurity")?.query, { kind: "SERVICE", category: "Technology", subcategory: "Cybersecurity" });
  assert.deepEqual(findItem(MARKETPLACE_NAVIGATION, "rental-storage-parking-parking-space")?.query, { kind: "RENTAL", category: "Storage & Parking", subcategory: "Parking space" });
});
