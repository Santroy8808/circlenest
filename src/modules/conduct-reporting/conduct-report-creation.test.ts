import assert from "node:assert/strict";
import test from "node:test";
import {
  ConductIncidentStatus,
  ConductIncidentSource,
  ConductLocationType,
  ConductReportStatus,
  ConductReportType,
  GroupMemberRole,
  Prisma,
  RecordRetentionClass,
  UserRole,
  type ConductIncident,
  type ConductReport
} from "@prisma/client";
import type { ConductContentSource } from "./source-resolver";
import {
  CONDUCT_REPORT_TRANSACTION_OPTIONS,
  conductReportCreationConcurrencyMessage,
  createManualConductReportRecord,
  lockAndRevalidateConductModerationRecipients,
  lockConductModerationMemberships,
  lockConductNotificationUsers,
  orderedConductNotificationUserIds,
  retryConductReportCreation
} from "./conduct-reporting.service";

const source: ConductContentSource = {
  locationType: ConductLocationType.MAIN_STREAM_POST,
  contentId: "post-1",
  authorUserId: "author-1",
  groupId: null,
  body: "Evidence",
  createdAt: new Date("2026-07-21T10:00:00.000Z"),
  updatedAt: new Date("2026-07-21T10:00:00.000Z"),
  permalink: "/stream/post-1",
  contextRootId: "post-1",
  evidenceSnapshot: {
    locationType: ConductLocationType.MAIN_STREAM_POST,
    contentId: "post-1",
    authorUserId: "author-1",
    groupId: null,
    body: "Evidence",
    createdAt: "2026-07-21T10:00:00.000Z",
    updatedAt: "2026-07-21T10:00:00.000Z",
    permalink: "/stream/post-1"
  },
  evidenceHash: "evidence-hash",
  fingerprint: "incident-fingerprint"
};

function incident(overrides: Partial<ConductIncident> = {}): ConductIncident {
  return {
    id: "incident-1",
    reference: "INC-1",
    source: ConductIncidentSource.MEMBER_REPORT,
    locationType: ConductLocationType.MAIN_STREAM_POST,
    groupId: null,
    subjectContentId: source.contentId,
    subjectAuthorUserId: source.authorUserId,
    permalink: source.permalink,
    fingerprint: source.fingerprint,
    evidenceSnapshot: source.evidenceSnapshot,
    evidenceHashes: [source.evidenceHash],
    evidenceContentIds: [source.contentId],
    policyCodes: [],
    status: ConductIncidentStatus.OPEN,
    version: 1,
    createdByUserId: "reporter-1",
    assignedModeratorUserId: null,
    modelMetadata: null,
    createdAt: new Date("2026-07-21T10:00:00.000Z"),
    updatedAt: new Date("2026-07-21T10:00:00.000Z"),
    ...overrides
  };
}

function report(): ConductReport {
  return {
    id: "report-new",
    reference: "RPT-NEW",
    incidentId: "incident-1",
    reportedUserId: source.authorUserId,
    reporterUserId: "reporter-1",
    type: ConductReportType.MANUAL,
    status: ConductReportStatus.ACTIVE,
    reasonCode: "HARASSMENT",
    context: null,
    policyCodes: [],
    evidenceContentIds: [source.contentId],
    algorithmicWeight: 1,
    resolvedByUserId: null,
    resolutionReason: null,
    version: 1,
    retentionClass: RecordRetentionClass.VITAL,
    createdAt: new Date("2026-07-21T10:00:00.000Z"),
    updatedAt: new Date("2026-07-21T10:00:00.000Z"),
    resolvedAt: null
  };
}

function retryableError(code: "P2034" | "P2002") {
  return new Prisma.PrismaClientKnownRequestError("retry", { code, clientVersion: "test" });
}

test("report notification users are locked together in stable order before conduct rows", async () => {
  assert.deepEqual(
    orderedConductNotificationUserIds(["user-z", "user-a", "user-z", null, undefined]),
    ["user-a", "user-z"]
  );
  const captured: Array<{ sql: string; values: unknown[] }> = [];
  const transaction = {
    $queryRaw: async (query: { sql: string; values: unknown[] }) => {
      captured.push(query);
      return [];
    }
  } as unknown as Prisma.TransactionClient;

  await lockConductNotificationUsers(transaction, ["user-z", "user-a", "user-z"]);
  const query = captured[0];
  assert.ok(query);
  assert.match(query.sql.replace(/\s+/g, " "), /FROM "User" .* ORDER BY "id" FOR SHARE/);
  assert.deepEqual(query.values, ["user-a", "user-z"]);
});

test("moderation memberships lock after users in stable order and recipients are revalidated", async () => {
  const lockOrder: string[] = [];
  const transaction = {
    $queryRaw: async (query: { sql: string; values: unknown[] }) => {
      const sql = query.sql.replace(/\s+/g, " ");
      if (sql.includes('FROM "User"')) {
        lockOrder.push("users");
        assert.match(sql, /ORDER BY "id" FOR SHARE/);
        return [
          { id: "reporter-1", role: UserRole.MEMBER, deactivatedAt: null },
          { id: "author-1", role: UserRole.MEMBER, deactivatedAt: null },
          { id: "admin-active", role: UserRole.ADMIN, deactivatedAt: null },
          { id: "admin-demoted", role: UserRole.MEMBER, deactivatedAt: null },
          { id: "admin-deactivated", role: UserRole.ADMIN, deactivatedAt: new Date() },
          { id: "group-owner", role: UserRole.MEMBER, deactivatedAt: null },
          { id: "group-demoted", role: UserRole.MEMBER, deactivatedAt: null },
          { id: "group-deactivated", role: UserRole.MEMBER, deactivatedAt: new Date() }
        ];
      }
      if (sql.includes('FROM "GroupMember"')) {
        lockOrder.push("memberships");
        assert.match(sql, /ORDER BY "userId" FOR SHARE/);
        assert.deepEqual(query.values, [
          "group-1",
          "author-1",
          "group-deactivated",
          "group-demoted",
          "group-owner"
        ]);
        return [
          { userId: "author-1", role: GroupMemberRole.OWNER },
          { userId: "group-deactivated", role: GroupMemberRole.MODERATOR },
          { userId: "group-demoted", role: GroupMemberRole.MEMBER },
          { userId: "group-owner", role: GroupMemberRole.OWNER }
        ];
      }
      return assert.fail(`Unexpected lock query: ${sql}`);
    }
  } as unknown as Prisma.TransactionClient;

  const recipients = await lockAndRevalidateConductModerationRecipients(transaction, {
    reporterUserId: "reporter-1",
    authorUserId: "author-1",
    groupId: "group-1",
    adminUserIds: ["admin-deactivated", "admin-demoted", "admin-active"],
    groupModeratorUserIds: ["group-owner", "group-demoted", "group-deactivated", "author-1"]
  });

  assert.deepEqual(lockOrder, ["users", "memberships"]);
  assert.deepEqual(recipients, ["admin-active", "group-owner"]);
});

test("no group-membership lock is attempted for platform-only moderation recipients", async () => {
  const transaction = {
    $queryRaw: async () => assert.fail("No GroupMember query is valid without a group or candidates.")
  } as unknown as Prisma.TransactionClient;
  assert.deepEqual(await lockConductModerationMemberships(transaction, null, ["admin-1"]), []);
  assert.deepEqual(await lockConductModerationMemberships(transaction, "group-1", []), []);
});

test("manual report creation uses a serializable transaction and bounded conflict retries", async () => {
  assert.equal(CONDUCT_REPORT_TRANSACTION_OPTIONS.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  for (const code of ["P2034", "P2002"] as const) {
    let attempts = 0;
    const result = await retryConductReportCreation(async () => {
      attempts += 1;
      if (attempts < 3) throw retryableError(code);
      return "created";
    });
    assert.equal(result, "created");
    assert.equal(attempts, 3);
  }

  let attempts = 0;
  await assert.rejects(() => retryConductReportCreation(async () => {
    attempts += 1;
    throw retryableError("P2034");
  }, 2), (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
  assert.equal(attempts, 2);
  assert.equal(
    conductReportCreationConcurrencyMessage(retryableError("P2034")),
    "The report queue changed while your report was being submitted. Refresh the item and try again."
  );
  assert.equal(conductReportCreationConcurrencyMessage(new Error("unexpected")), null);
});

test("adding a report to an existing incident locks first and advances aggregate version exactly once", async () => {
  const events: string[] = [];
  let incidentUpdates = 0;
  const existing = incident({ version: 7, status: ConductIncidentStatus.RESOLVED });
  const createdReport = report();
  const transaction = {
    $queryRaw: async (query: { sql: string; values: unknown[] }) => {
      events.push("incident-lock");
      assert.match(query.sql.replace(/\s+/g, " "), /FROM "ConductIncident" WHERE "fingerprint" = \? FOR UPDATE/);
      assert.deepEqual(query.values, [source.fingerprint]);
      return [{ id: existing.id }];
    },
    conductIncident: {
      findUnique: async () => {
        events.push("incident-read");
        return existing;
      },
      create: async () => assert.fail("existing incident must not be recreated"),
      update: async (args: { data: { status: ConductIncidentStatus; version: { increment: number } } }) => {
        events.push("incident-update");
        incidentUpdates += 1;
        assert.deepEqual(args.data, {
          status: ConductIncidentStatus.OPEN,
          version: { increment: 1 }
        });
        return incident({ version: 8, status: ConductIncidentStatus.OPEN });
      }
    },
    conductReport: {
      findFirst: async () => {
        events.push("duplicate-check");
        return null;
      },
      create: async () => {
        events.push("report-create");
        return createdReport;
      },
      findMany: async () => {
        events.push("aggregate-read");
        return [{ status: ConductReportStatus.RESOLVED }, { status: ConductReportStatus.ACTIVE }];
      }
    }
  } as unknown as Prisma.TransactionClient;

  const result = await createManualConductReportRecord(transaction, {
    source,
    reporterUserId: "reporter-1",
    reasonCode: "HARASSMENT",
    context: null
  });

  assert.equal(result.created, true);
  assert.equal(result.incident.version, 8);
  assert.equal(incidentUpdates, 1);
  assert.deepEqual(events, [
    "incident-lock",
    "incident-read",
    "duplicate-check",
    "report-create",
    "aggregate-read",
    "incident-update"
  ]);
});

test("the first report creates an OPEN version-one incident without a redundant aggregate bump", async () => {
  const events: string[] = [];
  const createdIncident = incident();
  const transaction = {
    $queryRaw: async () => {
      events.push("incident-lock");
      return [];
    },
    conductIncident: {
      findUnique: async () => assert.fail("no existing incident should be read"),
      create: async (args: { data: { status: ConductIncidentStatus } }) => {
        events.push("incident-create");
        assert.equal(args.data.status, ConductIncidentStatus.OPEN);
        return createdIncident;
      },
      update: async () => assert.fail("new incident version must not be incremented")
    },
    conductReport: {
      findFirst: async () => {
        events.push("duplicate-check");
        return null;
      },
      create: async () => {
        events.push("report-create");
        return report();
      },
      findMany: async () => assert.fail("single ACTIVE report already matches the new incident status")
    }
  } as unknown as Prisma.TransactionClient;

  const result = await createManualConductReportRecord(transaction, {
    source,
    reporterUserId: "reporter-1",
    reasonCode: "HARASSMENT",
    context: null
  });

  assert.equal(result.created, true);
  assert.equal(result.incident.version, 1);
  assert.equal(result.incident.status, ConductIncidentStatus.OPEN);
  assert.deepEqual(events, ["incident-lock", "incident-create", "duplicate-check", "report-create"]);
});

test("a duplicate manual report leaves the existing incident version unchanged", async () => {
  const existing = incident({ version: 12 });
  const duplicate = report();
  const transaction = {
    $queryRaw: async () => [{ id: existing.id }],
    conductIncident: {
      findUnique: async () => existing,
      create: async () => assert.fail("existing incident must not be recreated"),
      update: async () => assert.fail("duplicate report must not advance incident version")
    },
    conductReport: {
      findFirst: async () => duplicate,
      create: async () => assert.fail("duplicate report must not be recreated"),
      findMany: async () => assert.fail("duplicate report does not change the aggregate")
    }
  } as unknown as Prisma.TransactionClient;

  const result = await createManualConductReportRecord(transaction, {
    source,
    reporterUserId: "reporter-1",
    reasonCode: "HARASSMENT",
    context: null
  });
  assert.equal(result.created, false);
  assert.equal(result.duplicate.reference, duplicate.reference);
  assert.equal(existing.version, 12);
});
