import assert from "node:assert/strict";
import test from "node:test";
import { ConductIncidentStatus, ConductReportStatus, Prisma } from "@prisma/client";
import { recomputeLockedConductIncidentStatus } from "./incident-status.service";
import {
  availableConductDisputeReporterUserId,
  conductDisputeConcurrencyMessage,
  conductDisputeOpeningParticipantUserIds,
  conductDisputeReporterNotificationUserId,
  lockConductDisputeTargetRows,
  orderedConductDisputeUserIds,
  retryConductDisputeSerializable
} from "./disputes.service";

function serializationConflict() {
  return new Prisma.PrismaClientKnownRequestError("serialization conflict", {
    code: "P2034",
    clientVersion: "test"
  });
}

function normalizedSql(query: unknown) {
  if (!query || typeof query !== "object") return "";
  const sql = (query as { sql?: unknown }).sql;
  return typeof sql === "string" ? sql.replace(/\s+/g, " ").trim() : "";
}

test("dispute transactions retry serialization conflicts only within a fixed bound", async () => {
  let attempts = 0;
  const completed = await retryConductDisputeSerializable(async () => {
    attempts += 1;
    if (attempts < 3) throw serializationConflict();
    return "completed";
  });
  assert.equal(completed, "completed");
  assert.equal(attempts, 3);

  attempts = 0;
  await assert.rejects(() => retryConductDisputeSerializable(async () => {
    attempts += 1;
    throw serializationConflict();
  }));
  assert.equal(attempts, 3);
  assert.equal(
    conductDisputeConcurrencyMessage(serializationConflict()),
    "The dispute changed while this request was being applied. Refresh it and try again."
  );
  assert.equal(conductDisputeConcurrencyMessage(new Error("unexpected")), null);
});

test("all involved dispute users are deduplicated and locked in stable identifier order", () => {
  assert.deepEqual(
    orderedConductDisputeUserIds(["reporter", "actor", null, "participant", "actor", undefined]),
    ["actor", "participant", "reporter"]
  );
});

test("opening a dispute includes only an active available report author as the second required participant", () => {
  const activeUsers = [
    { id: "subject", deactivatedAt: null },
    { id: "reporter", deactivatedAt: null }
  ];
  assert.equal(availableConductDisputeReporterUserId(activeUsers, "reporter"), "reporter");
  assert.deepEqual(
    conductDisputeOpeningParticipantUserIds(activeUsers, "subject", "reporter"),
    ["reporter", "subject"]
  );
  assert.equal(conductDisputeReporterNotificationUserId(activeUsers, "subject", "reporter"), "reporter");

  const deactivatedReporter = [
    { id: "subject", deactivatedAt: null },
    { id: "reporter", deactivatedAt: new Date("2026-07-21T12:00:00.000Z") }
  ];
  assert.equal(availableConductDisputeReporterUserId(deactivatedReporter, "reporter"), null);
  assert.deepEqual(
    conductDisputeOpeningParticipantUserIds(deactivatedReporter, "subject", "reporter"),
    ["subject"]
  );
  assert.equal(conductDisputeReporterNotificationUserId(deactivatedReporter, "subject", "reporter"), null);
  assert.deepEqual(
    conductDisputeOpeningParticipantUserIds([{ id: "subject", deactivatedAt: null }], "subject", "deleted-reporter"),
    ["subject"]
  );
  assert.equal(
    conductDisputeReporterNotificationUserId([{ id: "subject", deactivatedAt: null }], "subject", "deleted-reporter"),
    null
  );
  assert.deepEqual(
    conductDisputeOpeningParticipantUserIds([{ id: "subject", deactivatedAt: null }], "subject", null),
    ["subject"]
  );
  assert.equal(conductDisputeReporterNotificationUserId(activeUsers, "subject", "subject"), null);
});

test("dispute target locks use report then incident then dispute and participant order", async () => {
  const statements: string[] = [];
  const transaction = {
    $queryRaw: async (query: unknown) => {
      statements.push(normalizedSql(query));
      return [];
    }
  } as unknown as Prisma.TransactionClient;

  await lockConductDisputeTargetRows(transaction, {
    reportId: "report-1",
    incidentId: "incident-1",
    disputeId: "dispute-1"
  });

  assert.deepEqual(statements.map((statement) => {
    if (statement.includes('FROM "ConductReport"')) return "report";
    if (statement.includes('FROM "ConductIncident"')) return "incident";
    if (statement.includes('FROM "ConductDisputeParticipant"')) return "participants";
    if (statement.includes('FROM "ConductDispute"')) return "dispute";
    return "unknown";
  }), ["report", "incident", "dispute", "participants"]);
  assert.ok(statements.every((statement) => statement.includes("FOR UPDATE")));
});

test("one locked aggregate recompute considers every linked report and increments once", async () => {
  const updates: unknown[] = [];
  const transaction = {
    conductReport: {
      findMany: async () => [
        { status: ConductReportStatus.RESOLVED },
        { status: ConductReportStatus.ACTIVE }
      ]
    },
    conductIncident: {
      update: async (input: unknown) => {
        updates.push(input);
        return { id: "incident-1" };
      }
    }
  } as unknown as Prisma.TransactionClient;

  await recomputeLockedConductIncidentStatus(transaction, "incident-1");
  assert.deepEqual(updates, [{
    where: { id: "incident-1" },
    data: { status: ConductIncidentStatus.OPEN, version: { increment: 1 } }
  }]);
});
