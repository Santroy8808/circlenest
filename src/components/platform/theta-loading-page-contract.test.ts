import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("full-page loading uses the large ripple without changing navigation progress", () => {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  const loading = readFileSync(resolve("src/app/loading.tsx"), "utf8");
  const progress = readFileSync(resolve("src/components/platform/navigation-progress.tsx"), "utf8");

  assert.match(loading, /theta-loading-page/);
  assert.match(css, /\.theta-loading-page \.theta-loading\.is-lg \.theta-loading-mark/);
  assert.match(css, /theta-page-ripple/);
  assert.match(css, /width: clamp\(7\.25rem, 17vw, 11rem\)/);
  assert.match(progress, /navigation-progress-theta/);
  assert.doesNotMatch(progress, /theta-loading-page/);
});
