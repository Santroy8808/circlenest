import assert from "node:assert/strict";
import test from "node:test";
import { safeReadProductionEnv } from "@/lib/platform/env";

test("production destructive actions require an explicitly configured delete password", () => {
  const missing = safeReadProductionEnv({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://localhost/test"
  });
  assert.equal(missing.success, false);
  assert.equal(
    missing.success ? false : missing.error.issues.some((issue) => issue.path.join(".") === "DELETE_PASSWORD"),
    true
  );

  const explicit = safeReadProductionEnv({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://localhost/test",
    DELETE_PASSWORD: "DELETE"
  });
  assert.equal(
    explicit.success ? false : explicit.error.issues.some((issue) => issue.path.join(".") === "DELETE_PASSWORD"),
    false
  );
});
