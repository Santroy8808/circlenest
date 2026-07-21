import assert from "node:assert/strict";
import test from "node:test";
import { ConductIncidentStatus, ConductReportStatus, FeedbackTicketStatus, Prisma, UserRole } from "@prisma/client";
import { CONDUCT_REPORT_STATUSES, legalConductTransitions } from "@/components/admin-moderation/conduct-review-ui-contract";
import { AdminTargetAuthorizationError } from "./account-target-authorization";
import { canTransitionFeedbackTicket } from "./feedback-tickets.service";
import { deriveConductIncidentStatus } from "@/modules/conduct-reporting/incident-status.service";
import {
  canTransitionConductReport,
  canReopenConductReportWithGenericWorkflow,
  incidentAssignmentVersionMatchesExpected,
  lockConductCommandScope,
  orderedConductAdminUserIds,
  prepareConductCommand,
  retryConductSerializable
} from "./conduct-transitions.service";

test("feedback tickets allow only the defined workflow transitions", () => {
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.OPEN, FeedbackTicketStatus.IN_REVIEW), true);
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.IN_REVIEW, FeedbackTicketStatus.RESOLVED), true);
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.RESOLVED, FeedbackTicketStatus.IN_REVIEW), true);
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.CLOSED, FeedbackTicketStatus.OPEN), true);
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.OPEN, FeedbackTicketStatus.RESOLVED), false);
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.CLOSED, FeedbackTicketStatus.RESOLVED), false);
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.OPEN, FeedbackTicketStatus.OPEN), false);
});

test("generic conduct transitions expose only truthful report status operations", () => {
  assert.equal(canTransitionConductReport(ConductReportStatus.ACTIVE, ConductReportStatus.UNDER_REVIEW), true);
  assert.equal(canTransitionConductReport(ConductReportStatus.UNDER_REVIEW, ConductReportStatus.RESOLVED), true);
  assert.equal(canTransitionConductReport(ConductReportStatus.RESOLVED, ConductReportStatus.UNDER_REVIEW), true);
  assert.equal(canTransitionConductReport(ConductReportStatus.UNDER_REVIEW, ConductReportStatus.DISPUTED), false);
  assert.equal(canTransitionConductReport(ConductReportStatus.DISPUTED, ConductReportStatus.RESOLVED), false);
  assert.equal(canTransitionConductReport(ConductReportStatus.UNDER_REVIEW, ConductReportStatus.RESTRICTED), false);
  assert.equal(canTransitionConductReport(ConductReportStatus.RESTRICTED, ConductReportStatus.UNDER_REVIEW), false);
  assert.equal(canTransitionConductReport(ConductReportStatus.ACTIVE, ConductReportStatus.RESOLVED), false);
  assert.equal(canTransitionConductReport(ConductReportStatus.DISMISSED, ConductReportStatus.RESTRICTED), false);
});

test("client and server conduct transition policies remain in exact parity", () => {
  for (const from of CONDUCT_REPORT_STATUSES) {
    for (const to of CONDUCT_REPORT_STATUSES) {
      assert.equal(
        legalConductTransitions(from).includes(to),
        canTransitionConductReport(from as ConductReportStatus, to as ConductReportStatus),
        `${from} -> ${to}`
      );
    }
  }
});

test("closed reports with a linked dispute cannot use the generic reopen workflow", () => {
  assert.equal(canReopenConductReportWithGenericWorkflow({
    from: ConductReportStatus.RESOLVED,
    to: ConductReportStatus.UNDER_REVIEW,
    hasLinkedDispute: true
  }), false);
  assert.equal(canReopenConductReportWithGenericWorkflow({
    from: ConductReportStatus.DISMISSED,
    to: ConductReportStatus.UNDER_REVIEW,
    hasLinkedDispute: true
  }), false);
  assert.equal(canReopenConductReportWithGenericWorkflow({
    from: ConductReportStatus.RESOLVED,
    to: ConductReportStatus.UNDER_REVIEW,
    hasLinkedDispute: false
  }), true);
});

test("incident assignment compare-and-set detects an intervening assignment write", () => {
  assert.equal(incidentAssignmentVersionMatchesExpected(7, 7), true);
  assert.equal(incidentAssignmentVersionMatchesExpected(8, 7), false);
});

function serializationConflict() {
  return new Prisma.PrismaClientKnownRequestError("serialization conflict", {
    code: "P2034",
    clientVersion: "test"
  });
}

const conductReplayFingerprint = "f".repeat(64);
const validConductReplaySnapshot = {
  id: "report-1",
  reference: "RPT-1",
  incidentId: "incident-1",
  status: ConductReportStatus.UNDER_REVIEW,
  incidentStatus: ConductIncidentStatus.UNDER_REVIEW,
  incidentVersion: 2,
  assignedModeratorUserId: null,
  resolvedByUserId: null,
  resolutionReason: null,
  resolvedAt: null,
  version: 2,
  updatedAt: "2026-07-21T12:00:00.000Z"
};

function conductReplayTransaction(
  after: unknown,
  auditOverrides: Record<string, unknown> = {}
) {
  let targetRead = false;
  const transaction = {
    $queryRaw: async () => [{ id: "admin", role: UserRole.ADMIN, deactivatedAt: null }],
    auditLog: {
      findUnique: async () => ({
        id: "audit-1",
        actorUserId: "admin",
        module: "conduct-reporting",
        action: "conduct-report.transition",
        targetType: "ConductReport",
        targetId: "report-1",
        metadata: { commandFingerprint: conductReplayFingerprint },
        after,
        ...auditOverrides
      })
    },
    conductReport: {
      findUnique: async () => {
        targetRead = true;
        return { incidentId: "incident-1" };
      }
    }
  } as unknown as Prisma.TransactionClient;
  return { transaction, targetWasRead: () => targetRead };
}

function prepareStoredConductReplay(transaction: Prisma.TransactionClient) {
  return prepareConductCommand(transaction, {
    actorUserId: "admin",
    reportId: "report-1",
    commandId: "conduct-command-1",
    action: "conduct-report.transition",
    commandFingerprint: conductReplayFingerprint
  });
}

function normalizedSql(query: unknown) {
  if (!query || typeof query !== "object") return "";
  const sql = (query as { sql?: unknown }).sql;
  return typeof sql === "string" ? sql.replace(/\s+/g, " ").trim() : "";
}

test("conduct serializable retries are bounded and report exhaustion as a retryable conflict", async () => {
  let attempts = 0;
  const result = await retryConductSerializable(async () => {
    attempts += 1;
    if (attempts < 3) throw serializationConflict();
    return "completed";
  });
  assert.equal(result, "completed");
  assert.equal(attempts, 3);

  attempts = 0;
  await assert.rejects(
    () => retryConductSerializable(async () => {
      attempts += 1;
      throw serializationConflict();
    }),
    (error) => error instanceof Error &&
      (error as Error & { code?: string; retryable?: boolean }).code === "VERSION_CONFLICT" &&
      (error as Error & { code?: string; retryable?: boolean }).retryable === true
  );
  assert.equal(attempts, 3);
});

test("a concurrent identical command is recovered as a durable replay after serialization retry", async () => {
  let attempts = 0;
  const { transaction, targetWasRead } = conductReplayTransaction(validConductReplaySnapshot);

  const prepared = await retryConductSerializable(async () => {
    attempts += 1;
    if (attempts === 1) throw serializationConflict();
    return prepareStoredConductReplay(transaction);
  });

  assert.equal(attempts, 2);
  assert.equal(prepared.replay?.replayed, true);
  assert.equal(prepared.replay?.auditLogId, "audit-1");
  assert.deepEqual(prepared.replay?.result, validConductReplaySnapshot);
  assert.equal(targetWasRead(), false, "durable replay must return before stale report/version checks");
});

test("durable conduct replays reject malformed stored snapshots before target work", async () => {
  const malformedSnapshots: Array<[string, unknown]> = [
    ["blank report id", { ...validConductReplaySnapshot, id: "" }],
    ["different report id", { ...validConductReplaySnapshot, id: "report-2" }],
    ["blank incident id", { ...validConductReplaySnapshot, incidentId: " " }],
    ["blank reference", { ...validConductReplaySnapshot, reference: "" }],
    ["unknown report status", { ...validConductReplaySnapshot, status: "NOT_A_STATUS" }],
    ["unknown incident status", { ...validConductReplaySnapshot, incidentStatus: "NOT_A_STATUS" }],
    ["invalid report version", { ...validConductReplaySnapshot, version: 0 }],
    ["wrong report version type", { ...validConductReplaySnapshot, version: "2" }],
    ["invalid incident version", { ...validConductReplaySnapshot, incidentVersion: 1.5 }],
    ["invalid optional user id", { ...validConductReplaySnapshot, assignedModeratorUserId: " " }],
    ["invalid resolver id", { ...validConductReplaySnapshot, resolvedByUserId: "" }],
    ["invalid resolution timestamp", { ...validConductReplaySnapshot, resolvedAt: "yesterday" }],
    ["invalid update timestamp", { ...validConductReplaySnapshot, updatedAt: "yesterday" }],
    ["unexpected stored field", { ...validConductReplaySnapshot, unexpected: true }]
  ];

  for (const [label, snapshot] of malformedSnapshots) {
    const { transaction, targetWasRead } = conductReplayTransaction(snapshot);
    await assert.rejects(
      () => prepareStoredConductReplay(transaction),
      (error) => error instanceof Error &&
        (error as Error & { code?: string; retryable?: boolean }).code === "COMMAND_FAILED" &&
        (error as Error & { code?: string; retryable?: boolean }).retryable === false,
      label
    );
    assert.equal(targetWasRead(), false, `${label}: malformed receipts must fail before conduct target work`);
  }
});

test("a reused conduct command id remains a validation conflict even when its stored receipt is malformed", async () => {
  const { transaction, targetWasRead } = conductReplayTransaction(null, {
    metadata: { commandFingerprint: "different-command" }
  });
  await assert.rejects(
    () => prepareStoredConductReplay(transaction),
    (error) => error instanceof Error &&
      (error as Error & { code?: string; retryable?: boolean }).code === "VALIDATION_FAILED" &&
      (error as Error & { code?: string; retryable?: boolean }).retryable === false
  );
  assert.equal(targetWasRead(), false, "command-id conflicts must fail before conduct target work");
});

test("conduct command locking reauthorizes actor then aligns report and incident locks with dispute flows", async () => {
  const events: string[] = [];
  let lockCount = 0;
  const transaction = {
    $queryRaw: async (query: unknown) => {
      lockCount += 1;
      const sql = normalizedSql(query);
      events.push(
        sql.includes('FROM "User"')
          ? "lock-actor"
          : sql.includes('FROM "ConductReport"')
            ? "lock-report"
            : sql.includes('FROM "ConductIncident"')
              ? "lock-incident"
              : `unexpected:${sql}`
      );
      return lockCount === 1
        ? [{ id: "admin", role: UserRole.ADMIN, deactivatedAt: null }]
        : [{ id: lockCount === 2 ? "report-1" : "incident-1" }];
    },
    conductReport: {
      findUnique: async () => {
        events.push("resolve-incident");
        return { incidentId: "incident-1" };
      }
    }
  } as unknown as Prisma.TransactionClient;

  assert.equal(await lockConductCommandScope(transaction, "admin", "report-1"), "incident-1");
  assert.deepEqual(events, ["lock-actor", "resolve-incident", "lock-report", "lock-incident"]);
});

test("conduct command locking stops before the target when the current actor lost admin access", async () => {
  let targetRead = false;
  const transaction = {
    $queryRaw: async () => [{ id: "former-admin", role: UserRole.MEMBER, deactivatedAt: null }],
    conductReport: {
      findUnique: async () => {
        targetRead = true;
        return { incidentId: "incident-1" };
      }
    }
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    () => lockConductCommandScope(transaction, "former-admin", "report-1"),
    (error) => error instanceof AdminTargetAuthorizationError && error.code === "ACTOR_UNAVAILABLE"
  );
  assert.equal(targetRead, false);
});

test("assignment locks actor and assignee together in stable order and permits GOD or self assignment", async () => {
  assert.deepEqual(orderedConductAdminUserIds("user-z", "user-a"), ["user-a", "user-z"]);
  assert.deepEqual(orderedConductAdminUserIds("admin", "admin"), ["admin"]);
  assert.deepEqual(orderedConductAdminUserIds("admin", null), ["admin"]);

  let lockCount = 0;
  const transaction = {
    $queryRaw: async () => {
      lockCount += 1;
      if (lockCount === 1) {
        return [
          { id: "admin", role: UserRole.ADMIN, deactivatedAt: null },
          { id: "god", role: UserRole.GOD, deactivatedAt: null }
        ];
      }
      return [{ id: lockCount === 2 ? "report-1" : "incident-1" }];
    },
    conductReport: { findUnique: async () => ({ incidentId: "incident-1" }) }
  } as unknown as Prisma.TransactionClient;
  assert.equal(await lockConductCommandScope(transaction, "admin", "report-1", "god"), "incident-1");

  lockCount = 0;
  const selfTransaction = {
    $queryRaw: async () => {
      lockCount += 1;
      return lockCount === 1
        ? [{ id: "admin", role: UserRole.ADMIN, deactivatedAt: null }]
        : [{ id: lockCount === 2 ? "report-1" : "incident-1" }];
    },
    conductReport: { findUnique: async () => ({ incidentId: "incident-1" }) }
  } as unknown as Prisma.TransactionClient;
  assert.equal(await lockConductCommandScope(selfTransaction, "admin", "report-1", "admin"), "incident-1");
});

test("assignment rejects a deactivated assignee before reading or locking conduct targets", async () => {
  let targetRead = false;
  const transaction = {
    $queryRaw: async () => [
      { id: "admin", role: UserRole.ADMIN, deactivatedAt: null },
      { id: "former-reviewer", role: UserRole.ADMIN, deactivatedAt: new Date() }
    ],
    conductReport: {
      findUnique: async () => {
        targetRead = true;
        return { incidentId: "incident-1" };
      }
    }
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(
    () => lockConductCommandScope(transaction, "admin", "report-1", "former-reviewer"),
    (error) => error instanceof Error &&
      (error as Error & { code?: string }).code === "VALIDATION_FAILED"
  );
  assert.equal(targetRead, false);
});

test("incident status is recomputed from every linked report with safety-first precedence", () => {
  assert.equal(deriveConductIncidentStatus([ConductReportStatus.DISMISSED]), ConductIncidentStatus.DISMISSED);
  assert.equal(
    deriveConductIncidentStatus([ConductReportStatus.RESOLVED, ConductReportStatus.DISMISSED]),
    ConductIncidentStatus.RESOLVED
  );
  assert.equal(
    deriveConductIncidentStatus([ConductReportStatus.ACTIVE, ConductReportStatus.RESOLVED]),
    ConductIncidentStatus.OPEN
  );
  assert.equal(
    deriveConductIncidentStatus([ConductReportStatus.UNDER_REVIEW, ConductReportStatus.ACTIVE]),
    ConductIncidentStatus.UNDER_REVIEW
  );
  assert.equal(
    deriveConductIncidentStatus([ConductReportStatus.DISPUTED, ConductReportStatus.UNDER_REVIEW]),
    ConductIncidentStatus.DISPUTED
  );
  assert.equal(
    deriveConductIncidentStatus([ConductReportStatus.RESTRICTED, ConductReportStatus.DISPUTED]),
    ConductIncidentStatus.RESTRICTED
  );
});
