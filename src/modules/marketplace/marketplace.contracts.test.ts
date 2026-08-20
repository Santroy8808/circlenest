import assert from "node:assert/strict";
import test from "node:test";

import { marketplaceListingInputSchema, marketplaceSearchSchema } from "./marketplace.contracts";
import { MARKETPLACE_ATTRIBUTE_SCHEMAS, MARKETPLACE_TEMPLATES, parseMarketplaceAttributes } from "./marketplace-templates";

const baseListing = {
  kind: "GOODS" as const,
  intent: "OFFER" as const,
  title: "Solid oak dining table",
  summary: "Six-seat table in good condition.",
  description: "Solid oak dining table with removable center leaf and normal wear.",
  category: "Furniture & Equipment",
  attributes: { material: "Oak", length: 72, width: 40, dimensionUnit: "in" },
  priceType: "FIXED" as const,
  priceCents: 45_000,
  currency: "usd",
  publisher: { kind: "PERSONAL" as const },
  location: { countryCode: "us", region: "Texas", city: "Austin" },
  contact: { allowInAppMessages: true },
  mediaAssetIds: [],
};

test("listing contracts normalize location and currency while preserving in-app privacy defaults", () => {
  const listing = marketplaceListingInputSchema.parse(baseListing);
  assert.equal(listing.currency, "USD");
  assert.equal(listing.location.countryCode, "US");
  assert.equal(listing.contact.showEmail, false);
  assert.equal(listing.contact.allowInAppMessages, true);
});

test("listing contracts reject an incomplete public disclosure and invalid price range", () => {
  const result = marketplaceListingInputSchema.safeParse({
    ...baseListing,
    priceType: "RANGE",
    priceCents: null,
    priceMinCents: 100_000,
    priceMaxCents: 50_000,
    contact: { allowInAppMessages: false, showEmail: true },
  });
  assert.equal(result.success, false);
});

test("listing contracts require a country even when a listing is remote", () => {
  const result = marketplaceListingInputSchema.safeParse({
    ...baseListing,
    location: { remote: true },
  });
  assert.equal(result.success, false);
});

test("every listing kind has a versioned template and attribute validator", () => {
  assert.deepEqual(Object.keys(MARKETPLACE_TEMPLATES).sort(), ["AUDITOR", "GOODS", "JOB", "RENTAL", "SERVICE", "VEHICLE"]);
  assert.equal(MARKETPLACE_ATTRIBUTE_SCHEMAS.VEHICLE.parse({ year: 2022, make: "Ford", model: "F-150", mileage: 20_000 }).year, 2022);
  assert.throws(() => parseMarketplaceAttributes("RENTAL", { bedrooms: 2 }));
  assert.ok(MARKETPLACE_TEMPLATES.VEHICLE.fields.some((field) => field.key === "vin"));
  assert.ok(MARKETPLACE_TEMPLATES.RENTAL.fields.some((field) => field.key === "depositCents"));
  assert.ok(MARKETPLACE_TEMPLATES.JOB.fields.some((field) => field.key === "applicationMethod"));
  assert.ok(MARKETPLACE_TEMPLATES.AUDITOR.fields.some((field) => field.key === "qualificationsAttested"));
});

test("search contracts cap page size and validate price bounds", () => {
  assert.equal(marketplaceSearchSchema.parse({ limit: 48 }).limit, 48);
  assert.equal(marketplaceSearchSchema.safeParse({ limit: 49 }).success, false);
  assert.equal(marketplaceSearchSchema.safeParse({ minPriceCents: 500, maxPriceCents: 100 }).success, false);
});
