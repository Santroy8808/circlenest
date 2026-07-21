import assert from "node:assert/strict";
import test from "node:test";
import { ConductReportStatus } from "@prisma/client";
import { readConductAdminQuery } from "./conduct-admin-query";

test("conduct GET query defaults to a bounded latest report view", () => {
  assert.deepEqual(readConductAdminQuery(new URLSearchParams()), {
    ok: true,
    query: { take: 100 }
  });
});

test("conduct GET query parses supported report filters", () => {
  const parsed = readConductAdminQuery(new URLSearchParams({
    limit: "25",
    query: "  RPT-1001  ",
    status: "under_review",
    assignee: "admin-1"
  }));
  assert.deepEqual(parsed, {
    ok: true,
    query: {
      take: 25,
      status: ConductReportStatus.UNDER_REVIEW,
      assigneeUserId: "admin-1",
      query: "RPT-1001"
    }
  });
  assert.deepEqual(readConductAdminQuery(new URLSearchParams({ assignee: "unassigned" })), {
    ok: true,
    query: { take: 100, assigneeUserId: null }
  });
});

test("conduct GET query rejects unbounded or unknown values", () => {
  assert.deepEqual(readConductAdminQuery(new URLSearchParams({ limit: "101" })), {
    ok: false,
    error: "Limit must be a whole number from 1 to 100.",
    field: "limit"
  });
  assert.deepEqual(readConductAdminQuery(new URLSearchParams({ status: "pending" })), {
    ok: false,
    error: "Choose a valid conduct report status.",
    field: "status"
  });
  const longQuery = "x".repeat(121);
  assert.equal(readConductAdminQuery(new URLSearchParams({ query: longQuery })).ok, false);
});
