import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConductAssignmentIntent,
  buildConductTransitionIntent,
  conductCommandIdentity,
  conductAdminViewUrl,
  filterConductReports,
  isConductAdminView,
  isConductMutationForCommand,
  isConductMutationResponse,
  legalConductTransitions,
  legalConductTransitionsForReport,
  serializeConductCommandIntent,
  type ConductAdminView,
  type ConductReportView
} from "./conduct-review-ui-contract";

function report(overrides: Partial<ConductReportView> = {}): ConductReportView {
  return {
    id: "report-1",
    reference: "RPT-1001",
    type: "MANUAL",
    status: "ACTIVE",
    version: 4,
    reasonCode: "member_report",
    context: "Member supplied context.",
    policyCodes: ["COMM-1"],
    reportedMember: { id: "member-1", username: "member", label: "Member One (@member)" },
    reporterMember: { id: "member-2", username: "reporter", label: "Reporter Two (@reporter)" },
    resolvedByMember: null,
    resolutionReason: null,
    resolvedAt: null,
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-21T10:00:00.000Z",
    dispute: null,
    incident: {
      id: "incident-1",
      reference: "INC-1001",
      status: "OPEN",
      version: 3,
      source: "MEMBER_REPORT",
      locationType: "MAIN_STREAM_POST",
      subjectContentId: "post-1",
      subjectMember: { id: "member-1", username: "member", label: "Member One (@member)" },
      permalink: "/posts/post-1",
      contextSummary: "{\n  \"body\": \"Evidence\"\n}",
      policyCodes: ["COMM-1"],
      assignedModeratorUserId: null,
      assignedModerator: null,
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-21T10:00:00.000Z"
    },
    ...overrides
  };
}

function view(reports: ConductReportView[] = [report()]): ConductAdminView {
  return {
    generatedAt: "2026-07-21T12:00:00.000Z",
    reports,
    assignees: [
      { id: "admin-1", username: "admin", label: "Site Admin (@admin)", role: "ADMIN" },
      { id: "god-1", username: "owner", label: "Owner (@owner)", role: "GOD" }
    ]
  };
}

test("transition intents carry exact target, current version, legal states, and normalized text", () => {
  assert.deepEqual(legalConductTransitions("ACTIVE"), ["UNDER_REVIEW", "DISMISSED"]);
  const first = buildConductTransitionIntent(report(), {
    toStatus: "UNDER_REVIEW",
    reason: "  Human review requested.\r\nTicket 42.  ",
    note: "  Evidence checked.  "
  });
  const identical = buildConductTransitionIntent(report(), {
    toStatus: "UNDER_REVIEW",
    reason: "Human review requested.\nTicket 42.",
    note: "Evidence checked."
  });
  assert.equal(first.ok, true);
  assert.equal(identical.ok, true);
  if (!first.ok || !identical.ok) return;
  assert.deepEqual(first.command, {
    action: "conduct-report.transition",
    target: { type: "ConductReport", id: "report-1" },
    reason: "Human review requested.\nTicket 42.",
    expectedVersion: 4,
    payload: {
      fromStatus: "ACTIVE",
      toStatus: "UNDER_REVIEW",
      note: "Evidence checked."
    }
  });
  assert.equal(serializeConductCommandIntent(first.command), serializeConductCommandIntent(identical.command));
});

test("command identifiers are reused only for an identical normalized retry", () => {
  const built = buildConductTransitionIntent(report(), {
    toStatus: "UNDER_REVIEW",
    reason: "Human review requested.",
    note: "Evidence checked."
  });
  const changed = buildConductTransitionIntent(report(), {
    toStatus: "DISMISSED",
    reason: "Human review requested.",
    note: "Evidence checked."
  });
  assert.equal(built.ok, true);
  assert.equal(changed.ok, true);
  if (!built.ok || !changed.ok) return;
  let generated = 0;
  const first = conductCommandIdentity(null, built.command, () => `command-${++generated}`);
  const retry = conductCommandIdentity(first, built.command, () => `command-${++generated}`);
  const newIntent = conductCommandIdentity(retry, changed.command, () => `command-${++generated}`);
  assert.equal(first.commandId, "command-1");
  assert.equal(retry.commandId, "command-1");
  assert.equal(newIntent.commandId, "command-2");
  assert.equal(generated, 2);
});

test("transition intent rejects illegal paths and incomplete audit text", () => {
  assert.deepEqual(buildConductTransitionIntent(report(), {
    toStatus: "RESOLVED",
    reason: "This is a specific reason.",
    note: "Reviewed."
  }), { ok: false, error: "A report cannot move from Active to that status." });
  const shortReason = buildConductTransitionIntent(report(), {
    toStatus: "DISMISSED",
    reason: "too short",
    note: "Reviewed."
  });
  assert.equal(shortReason.ok, false);
  if (!shortReason.ok) assert.match(shortReason.error, /at least 10/);
});

test("linked disputes remove generic reopen actions from closed report controls", () => {
  const closedWithDispute = report({
    status: "RESOLVED",
    dispute: {
      reference: "DSP-1001",
      status: "OPEN"
    }
  });
  assert.deepEqual(legalConductTransitionsForReport(closedWithDispute), []);
  assert.deepEqual(buildConductTransitionIntent(closedWithDispute, {
    toStatus: "UNDER_REVIEW",
    reason: "A generic reopen is not permitted here.",
    note: "Use the dispute workflow."
  }), { ok: false, error: "A report cannot move from Resolved to that status." });
});

test("assignment intents allow an active administrator or unassignment but reject stale choices", () => {
  const current = report({
    incident: {
      ...report().incident,
      assignedModeratorUserId: "admin-1",
      assignedModerator: { id: "admin-1", username: "admin", label: "Site Admin (@admin)" }
    }
  });
  const unassign = buildConductAssignmentIntent(current, {
    assigneeUserId: null,
    reason: "Return this report to the shared queue.",
    note: "Reviewer handoff complete."
  }, view().assignees);
  assert.equal(unassign.ok, true);
  if (unassign.ok) {
    assert.equal(unassign.command.action, "conduct-report.assign");
    assert.deepEqual(unassign.command.target, { type: "ConductReport", id: "report-1" });
    assert.equal(unassign.command.expectedVersion, 4);
    assert.deepEqual(unassign.command.payload, {
      assigneeUserId: null,
      expectedIncidentVersion: 3,
      note: "Reviewer handoff complete."
    });
  }
  const inactive = buildConductAssignmentIntent(current, {
    assigneeUserId: "inactive-admin",
    reason: "Assign for investigation.",
    note: "Please review."
  }, view().assignees);
  assert.deepEqual(inactive, { ok: false, error: "Choose an active administrator from the current list." });
});

test("two reports sharing one incident carry the same assignment compare-and-set version", () => {
  const first = report({ id: "report-1", reference: "RPT-1001" });
  const second = report({ id: "report-2", reference: "RPT-1002", version: 8 });
  const initial = view([first, second]);
  const firstCommand = buildConductAssignmentIntent(first, {
    assigneeUserId: "admin-1",
    reason: "Assign the shared incident for review.",
    note: "Review both linked reports."
  }, initial.assignees);
  const secondCommand = buildConductAssignmentIntent(second, {
    assigneeUserId: "admin-1",
    reason: "Assign the shared incident for review.",
    note: "Review both linked reports."
  }, initial.assignees);
  assert.equal(firstCommand.ok, true);
  assert.equal(secondCommand.ok, true);
  if (!firstCommand.ok || !secondCommand.ok || firstCommand.command.action !== "conduct-report.assign" || secondCommand.command.action !== "conduct-report.assign") return;
  assert.equal(firstCommand.command.payload.expectedIncidentVersion, 3);
  assert.equal(secondCommand.command.payload.expectedIncidentVersion, 3);
});

test("report filtering searches operational fields and applies status and reviewer filters", () => {
  const assigned = report({
    id: "report-2",
    reference: "RPT-2002",
    status: "UNDER_REVIEW",
    reportedMember: { id: "member-3", username: "jules", label: "Jules (@jules)" },
    incident: {
      ...report().incident,
      id: "incident-2",
      reference: "INC-2002",
      source: "ADMIN_REPORT",
      assignedModeratorUserId: "admin-1",
      assignedModerator: { id: "admin-1", username: "admin", label: "Site Admin (@admin)" }
    }
  });
  const reports = [report(), assigned];
  assert.deepEqual(filterConductReports(reports, { query: "jules", status: "all", assignee: "all" }).map((item) => item.id), ["report-2"]);
  assert.deepEqual(filterConductReports(reports, { query: "", status: "UNDER_REVIEW", assignee: "admin-1" }).map((item) => item.id), ["report-2"]);
  assert.deepEqual(filterConductReports(reports, { query: "", status: "all", assignee: "unassigned" }).map((item) => item.id), ["report-1"]);
});

test("conduct refresh URLs preserve the current server-backed search and filters", () => {
  assert.equal(conductAdminViewUrl({ query: "  Jules & report  ", status: "UNDER_REVIEW", assignee: "admin-1" }),
    "/api/admin/conduct?limit=100&query=Jules+%26+report&status=UNDER_REVIEW&assignee=admin-1");
  assert.equal(conductAdminViewUrl({ query: "", status: "all", assignee: "all" }), "/api/admin/conduct?limit=100");
});

test("API guards accept complete report views and receipts and reject legacy or incomplete payloads", () => {
  assert.equal(isConductAdminView(view()), true);
  assert.equal(isConductAdminView({ config: {}, runs: [], candidates: [] }), false);
  assert.equal(isConductAdminView({ ...view(), reports: [{ ...report(), version: 0 }] }), false);
  const mutation = {
    ok: true,
    receipt: {
      commandId: "conduct-report:123",
      auditLogId: "audit-1",
      status: "completed",
      replayed: false,
      result: {
        id: "report-1",
        reference: "RPT-1001",
        incidentId: "incident-1",
        status: "UNDER_REVIEW",
        incidentStatus: "UNDER_REVIEW",
        incidentVersion: 4,
        assignedModeratorUserId: "admin-1",
        resolvedByUserId: null,
        resolutionReason: null,
        resolvedAt: null,
        version: 5,
        updatedAt: "2026-07-21T12:01:00.000Z"
      }
    }
  };
  assert.equal(isConductMutationResponse(mutation), true);
  const command = buildConductTransitionIntent(report(), {
    toStatus: "UNDER_REVIEW",
    reason: "Human review requested.",
    note: "Evidence checked."
  });
  assert.equal(command.ok, true);
  if (command.ok) {
    assert.equal(isConductMutationForCommand(mutation, "conduct-report:123", command.command), true);
    assert.equal(isConductMutationForCommand(mutation, "conduct-report:other", command.command), false);
    assert.equal(isConductMutationForCommand({
      ...mutation,
      receipt: { ...mutation.receipt, result: { ...mutation.receipt.result, id: "report-2" } }
    }, "conduct-report:123", command.command), false);
  }
  assert.equal(isConductMutationResponse({ ...mutation, receipt: { ...mutation.receipt, auditLogId: "" } }), false);
  assert.equal(isConductMutationResponse({ ...mutation, receipt: { ...mutation.receipt, result: { ...mutation.receipt.result, version: 0 } } }), false);
});
