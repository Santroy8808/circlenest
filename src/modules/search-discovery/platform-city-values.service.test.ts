import assert from "node:assert/strict";
import test from "node:test";
import { filterPlatformCityValues, platformCityCacheKey } from "./platform-city-values.service";

test("platform location cache coalesces successive typeahead queries by prefix", () => {
  assert.equal(platformCityCacheKey("Austin"), "au");
  assert.equal(platformCityCacheKey("Au"), platformCityCacheKey("Austin"));
  assert.equal(platformCityCacheKey(" São Paulo "), "sa");
});

test("cached platform locations are filtered for the current full query", () => {
  const values = ["Austin, Texas, United States", "Auburn, Alabama, United States", "Boston, Massachusetts, United States"];
  assert.deepEqual(filterPlatformCityValues(values, "austi"), ["Austin, Texas, United States"]);
  assert.deepEqual(filterPlatformCityValues(values, "texas"), ["Austin, Texas, United States"]);
});
