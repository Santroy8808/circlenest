import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import {
  getCityLocationSearchLatencySnapshot,
  searchCityLocations,
  warmCityLocationSearchIndex
} from "./city-locations";

test("city search keeps complete world coverage and the keyboard-facing suggestion shape", () => {
  const index = warmCityLocationSearchIndex();
  assert.ok(index.recordCount > 130_000);

  const expectedCities = [
    ["austin", "Austin, Texas, United States"],
    ["new york", "New York, New York, United States"],
    ["sao paulo", "São Paulo, São Paulo, Brazil"],
    ["tokyo", "Tokyo, Tokyo, Japan"]
  ] as const;

  for (const [query, expectedLabel] of expectedCities) {
    const suggestions = searchCityLocations(query, 8);
    assert.equal(suggestions[0]?.label, expectedLabel);
    assert.deepEqual(Object.keys(suggestions[0] ?? {}).sort(), ["city", "country", "label", "region"]);
  }
});

test("city search includes cached platform values without allowing duplicate labels", () => {
  const suggestions = searchCityLocations("new arcadia", 8, [
    "New Arcadia, Test Region, Testland",
    "New Arcadia, Test Region, Testland"
  ]);
  assert.equal(suggestions[0]?.label, "New Arcadia, Test Region, Testland");
  assert.equal(suggestions.filter((suggestion) => suggestion.label === suggestions[0]?.label).length, 1);
});

test("warm indexed city searches stay within the typeahead latency budget", () => {
  warmCityLocationSearchIndex();
  const queries = [
    "austin",
    "london",
    "tokyo",
    "sydney",
    "berlin",
    "johannesburg",
    "buenos aires",
    "vancouver",
    "stockholm",
    "mexico city",
    "washington dc",
    "sao paulo"
  ];
  const durations = queries.map((query) => {
    const startedAt = performance.now();
    assert.ok(searchCityLocations(query, 8).length > 0);
    return performance.now() - startedAt;
  });
  const p95 = [...durations].sort((left, right) => left - right)[Math.ceil(durations.length * 0.95) - 1];
  const recorded = getCityLocationSearchLatencySnapshot();

  assert.ok(p95 < 100, `expected warm p95 below 100ms, received ${p95.toFixed(2)}ms`);
  assert.ok(recorded.sampleCount >= queries.length);
  assert.ok(recorded.p95Ms >= 0);
});
