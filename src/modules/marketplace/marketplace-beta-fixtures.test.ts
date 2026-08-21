import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketplaceBetaFixtures, MARKETPLACE_BETA_TAG } from "./marketplace-beta-fixtures";
import { MARKETPLACE_TAXONOMY } from "./marketplace-taxonomy";

test("beta fixtures provide the requested number of listings for every primary category", () => {
  const perCategory = 3;
  const categoryCount = Object.values(MARKETPLACE_TAXONOMY).flat().length;
  const fixtures = buildMarketplaceBetaFixtures(perCategory, new Date("2026-08-21T12:00:00Z"));
  assert.equal(fixtures.length, categoryCount * perCategory);
  assert.equal(new Set(fixtures.map((fixture) => fixture.slug)).size, fixtures.length);
  for (const fixture of fixtures) {
    assert.equal(fixture.attributes.seedTag, MARKETPLACE_BETA_TAG);
    assert.match(fixture.countryCode, /^[A-Z]{2}$/);
    assert.ok(fixture.title.length > 12);
    assert.ok(fixture.summary.length > 20);
    assert.ok(fixture.imageUrl.startsWith("https://"));
  }
});

test("beta fixtures distribute inventory across listing kinds, intents, locations, and subcategories", () => {
  const fixtures = buildMarketplaceBetaFixtures(12, new Date("2026-08-21T12:00:00Z"));
  assert.deepEqual([...new Set(fixtures.map((fixture) => fixture.kind))].sort(), ["AUDITOR", "GOODS", "JOB", "RENTAL", "SERVICE", "VEHICLE"]);
  assert.ok(fixtures.some((fixture) => fixture.intent === "OFFER"));
  assert.ok(fixtures.some((fixture) => fixture.intent === "WANTED"));
  assert.ok(new Set(fixtures.map((fixture) => fixture.countryCode)).size >= 5);
  assert.ok(fixtures.some((fixture) => fixture.subcategory));
});

test("vehicle fixtures keep model details consistent with their category", () => {
  const fixtures = buildMarketplaceBetaFixtures(8, new Date("2026-08-21T12:00:00Z"));
  const truck = fixtures.find((fixture) => fixture.kind === "VEHICLE" && fixture.category === "Trucks" && fixture.intent === "OFFER");
  const suv = fixtures.find((fixture) => fixture.kind === "VEHICLE" && fixture.category === "SUVs & Crossovers" && fixture.intent === "OFFER");
  assert.ok(truck && suv);
  assert.match(truck.title, /Ford F-150|Chevrolet Silverado|Toyota Tacoma|Nissan Frontier|Ram 1500|GMC Sierra/);
  assert.match(suv.title, /Honda CR-V|Subaru Outback|Mazda CX-5|Hyundai Tucson|Kia Sportage|Toyota RAV4/);
  assert.equal(truck.attributes.make, truck.title.split(" ")[1]);
});
