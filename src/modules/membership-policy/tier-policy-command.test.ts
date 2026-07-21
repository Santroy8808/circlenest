import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

test("tier-policy mutations require caller idempotency and transaction-local GOD reauthentication", () => {
  const service = fs.readFileSync("src/modules/membership-policy/membership-policy.service.ts", "utf8");
  const route = fs.readFileSync("src/app/api/admin/tier-policy/route.ts", "utf8");

  assert.match(service, /commandId: string/);
  assert.doesNotMatch(service, /input\.commandId\?\.trim\(\) \|\| randomUUID\(\)/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /currentActor\.deactivatedAt/);
  assert.match(service, /verifyPassword\(input\.password, currentActor\.passwordHash\)/);
  assert.match(route, /admin:tier-policy:reauthentication/);
  assert.match(route, /commandId/);
});
