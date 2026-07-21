import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const routeContracts = [
  ["src/app/api/writers/manuscripts/route.ts", "publishing.writers_corner", 1],
  ["src/app/api/writers/manuscripts/[manuscriptId]/route.ts", "publishing.writers_corner", 1],
  ["src/app/api/writers/manuscripts/[manuscriptId]/chapters/route.ts", "publishing.writers_corner", 1],
  ["src/app/api/writers/chapters/[chapterId]/route.ts", "publishing.writers_corner", 1],
  ["src/app/api/writers/manuscripts/[manuscriptId]/subscription/route.ts", "publishing.writers_corner", 2],
  ["src/app/api/mobile/writers/route.ts", "publishing.writers_corner", 2],
  ["src/app/api/auditors/profile/route.ts", "directory.auditor_directory", 1],
  ["src/app/api/mobile/auditors/route.ts", "directory.auditor_directory", 2]
] as const;

test("every Writers and Auditor API route enforces its registered platform feature", () => {
  for (const [relativePath, featureKey, expectedGuardCount] of routeContracts) {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8");
    const guard = new RegExp(`resolvePlatformApiFeatureAccess\\(\\"${featureKey.replace(".", "\\.")}\\"\\)`, "g");
    assert.equal(
      source.match(guard)?.length ?? 0,
      expectedGuardCount,
      `${relativePath} must enforce ${featureKey}`
    );
  }
});
