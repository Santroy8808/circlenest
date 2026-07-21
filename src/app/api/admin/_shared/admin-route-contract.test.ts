import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOWED_CONDUCT_ADMIN_COMMANDS,
  adminHistoryQueryFromSearchParams,
  adminRouteErrorStatus,
  hasCompleteExpectedVersions,
  hasValidCommandId,
  isAllowedConductAdminCommand,
  isValidExpectedVersion,
  isRecord
} from "@/app/api/admin/_shared/admin-route-contract";

test("administrator route errors use truthful HTTP status codes", () => {
  assert.equal(adminRouteErrorStatus("UNAUTHENTICATED"), 401);
  assert.equal(adminRouteErrorStatus("FORBIDDEN"), 403);
  assert.equal(adminRouteErrorStatus("REAUTHENTICATION_REQUIRED"), 403);
  assert.equal(adminRouteErrorStatus("TARGET_NOT_FOUND"), 404);
  assert.equal(adminRouteErrorStatus("VERSION_CONFLICT"), 409);
  assert.equal(adminRouteErrorStatus("COMMAND_ID_CONFLICT"), 409);
  assert.equal(adminRouteErrorStatus("VALIDATION_FAILED"), 422);
  assert.equal(adminRouteErrorStatus("INVALID_QUERY"), 422);
  assert.equal(adminRouteErrorStatus("COMMAND_FAILED"), 500);
});

test("optimistic admin mutations require complete nonnegative versions", () => {
  assert.equal(isValidExpectedVersion(0), true);
  assert.equal(isValidExpectedVersion(7), true);
  assert.equal(isValidExpectedVersion(-1), false);
  assert.equal(isValidExpectedVersion(1.5), false);
  assert.equal(hasCompleteExpectedVersions({ first: 0, second: 3 }, ["first", "second"]), true);
  assert.equal(hasCompleteExpectedVersions({ first: 0 }, ["first", "second"]), false);
});

test("administrator mutation envelopes require explicit durable command ids", () => {
  assert.equal(isRecord({ commandId: "command-123" }), true);
  assert.equal(isRecord([]), false);
  assert.equal(hasValidCommandId({ commandId: "command-123" }), true);
  assert.equal(hasValidCommandId({ commandId: "short" }), false);
  assert.equal(hasValidCommandId({}), false);
});

test("history query conversion retains only non-empty search fields", () => {
  const query = adminHistoryQueryFromSearchParams(
    new URLSearchParams("pageSize=50&module=uploads&search=&cursor=next-page")
  );
  assert.deepEqual(query, { pageSize: "50", module: "uploads", cursor: "next-page" });
});

test("conduct route exposes only atomic versioned administrator commands", () => {
  assert.deepEqual(ALLOWED_CONDUCT_ADMIN_COMMANDS, ["conduct-report.transition", "conduct-report.assign"]);
  for (const legacyAction of [
    "configure",
    "run",
    "approve-candidate",
    "dismiss-candidate",
    "assign-candidate",
    "restrict-pair",
    "override-dispute"
  ]) {
    assert.equal(isAllowedConductAdminCommand(legacyAction), false, `${legacyAction} must remain unreachable`);
  }
});
