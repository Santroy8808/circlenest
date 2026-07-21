import assert from "node:assert/strict";
import test from "node:test";
import {
  ConductIncidentStatus,
  ConductLocationType,
  ConductReportStatus,
  ConductReviewStatus,
  GroupMemberRole,
  Prisma,
  UserRole
} from "@prisma/client";
import {
  ConductCandidateOperationError,
  CONDUCT_ADMIN_VIEW_TRANSACTION_OPTIONS,
  buildRankedConductReportQuery,
  candidateOperationFailure,
  createApprovedCandidateReportRecord,
  lockAndAuthorizeConductCandidate
} from "./admin.service";

function normalizedSql(query: { sql: string }) {
  return query.sql.replace(/\s+/g, " ").trim();
}

test("admin conduct search ranks reports directly without pre-capping matching members", () => {
  const query = buildRankedConductReportQuery({ take: 37, query: "Example Member" });
  const sql = normalizedSql(query);

  assert.match(sql, /FROM "ConductReport" AS report/);
  assert.match(sql, /INNER JOIN "ConductIncident" AS incident/);
  assert.match(sql, /EXISTS \( SELECT 1 FROM "User" AS member LEFT JOIN "Profile" AS profile/);
  assert.match(sql, /report\."reportedUserId"/);
  assert.match(sql, /report\."reporterUserId"/);
  assert.match(sql, /report\."resolvedByUserId"/);
  assert.match(sql, /incident\."subjectAuthorUserId"/);
  assert.match(sql, /incident\."assignedModeratorUserId"/);
  assert.match(sql, /CASE WHEN report\."reference" ILIKE \?/);
  assert.match(sql, /END AS "relevance"/);
  assert.match(sql, /ORDER BY "relevance" ASC, report\."updatedAt" DESC, report\."id" DESC LIMIT \?/);
  assert.equal(query.values.at(-1), 37);
  assert.equal(sql.includes("LIMIT 100"), false);
  assert.equal(
    CONDUCT_ADMIN_VIEW_TRANSACTION_OPTIONS.isolationLevel,
    Prisma.TransactionIsolationLevel.RepeatableRead
  );
});

test("admin conduct ranked search applies report and incident filters in the same bounded query", () => {
  const query = buildRankedConductReportQuery({
    take: 12,
    query: "main stream post",
    status: ConductReportStatus.ACTIVE,
    assigneeUserId: null
  });
  const sql = normalizedSql(query);

  assert.match(sql, /report\."status"::text = \?/);
  assert.match(sql, /incident\."assignedModeratorUserId" IS NULL/);
  assert.match(sql, /incident\."locationType"::text = \?/);
  assert.equal(query.values.at(-1), 12);
});

test("admin conduct search treats SQL wildcard characters as literal member input", () => {
  const query = buildRankedConductReportQuery({ take: 5, query: "50%_off" });
  assert.equal(query.values.includes("50\\%\\_off"), true);
  assert.equal(query.values.includes("50\\%\\_off%"), true);
  assert.equal(query.values.includes("%50\\%\\_off%"), true);
});

test("candidate approval serializes on the incident and advances its aggregate version once", async () => {
  const events: string[] = [];
  let incidentUpdates = 0;
  const candidate = {
    id: "candidate-1",
    reference: "CAN-1",
    status: ConductReviewStatus.PENDING,
    incidentId: null,
    locationType: ConductLocationType.MAIN_STREAM_POST,
    contentId: "post-1",
    authorUserId: "author-1",
    groupId: null,
    permalink: "/stream/post-1",
    contextSnapshot: { body: "evidence" },
    evidenceHashes: ["hash"],
    policyCodes: ["policy"],
    providerResult: null
  };
  const existingIncident = {
    id: "incident-1",
    reference: "INC-1",
    version: 9,
    status: ConductIncidentStatus.RESOLVED
  };
  const createdReport = {
    id: "report-1",
    reference: "RPT-1",
    incidentId: existingIncident.id,
    status: ConductReportStatus.UNDER_REVIEW
  };
  const transaction = {
    $queryRaw: async (query: { sql: string; values: unknown[] }) => {
      if (query.sql.includes('FROM "User"')) {
        events.push("users-lock");
        assert.deepEqual(query.values, ["admin-1", "author-1"]);
        return [
          { id: "admin-1", role: UserRole.ADMIN, deactivatedAt: null },
          { id: "author-1", role: UserRole.MEMBER, deactivatedAt: null }
        ];
      }
      if (query.sql.includes("ConductReviewCandidate")) {
        events.push("candidate-lock");
        return [{ id: candidate.id }];
      }
      events.push("incident-lock");
      return [{ id: existingIncident.id }];
    },
    conductReviewCandidate: {
      findUnique: async () => {
        events.push("candidate-read");
        return candidate;
      }
    },
    conductIncident: {
      findUnique: async () => {
        events.push("incident-read");
        return existingIncident;
      },
      create: async () => assert.fail("existing incident must not be recreated"),
      update: async (args: { data: { status: ConductIncidentStatus; version: { increment: number } } }) => {
        events.push("incident-update");
        incidentUpdates += 1;
        assert.deepEqual(args.data, {
          status: ConductIncidentStatus.UNDER_REVIEW,
          version: { increment: 1 }
        });
        return { ...existingIncident, version: 10, status: ConductIncidentStatus.UNDER_REVIEW };
      }
    },
    conductReport: {
      findFirst: async () => {
        events.push("report-read");
        return null;
      },
      create: async (args: { data: { status: ConductReportStatus; context: string } }) => {
        events.push("report-create");
        assert.equal(args.data.status, ConductReportStatus.UNDER_REVIEW);
        assert.equal(args.data.context, "Reviewed by a moderator");
        return createdReport;
      },
      findMany: async () => {
        events.push("aggregate-read");
        return [{ status: ConductReportStatus.RESOLVED }, { status: ConductReportStatus.UNDER_REVIEW }];
      }
    }
  } as unknown as Prisma.TransactionClient;

  const result = await createApprovedCandidateReportRecord(
    transaction,
    candidate,
    "admin-1",
    "Reviewed by a moderator"
  );

  assert.equal(result.replayed, false);
  assert.equal(result.incident.version, 10);
  assert.equal(incidentUpdates, 1);
  assert.deepEqual(events, [
    "users-lock",
    "candidate-lock",
    "candidate-read",
    "incident-lock",
    "incident-read",
    "report-read",
    "report-create",
    "aggregate-read",
    "incident-update"
  ]);
});

test("candidate approval keeps a newly created incident at version one", async () => {
  const candidate = {
    id: "candidate-new",
    reference: "CAN-NEW",
    status: ConductReviewStatus.PENDING,
    incidentId: null,
    locationType: ConductLocationType.MAIN_STREAM_POST,
    contentId: "post-new",
    authorUserId: "author-1",
    groupId: null,
    permalink: "/stream/post-new",
    contextSnapshot: { body: "evidence" },
    evidenceHashes: ["hash"],
    policyCodes: [],
    providerResult: null
  };
  const newIncident = {
    id: "incident-new",
    reference: "INC-NEW",
    version: 1,
    status: ConductIncidentStatus.UNDER_REVIEW
  };
  const transaction = {
    $queryRaw: async (query: { sql: string }) => {
      if (query.sql.includes('FROM "User"')) {
        return [
          { id: "admin-1", role: UserRole.ADMIN, deactivatedAt: null },
          { id: "author-1", role: UserRole.MEMBER, deactivatedAt: null }
        ];
      }
      if (query.sql.includes("ConductReviewCandidate")) return [{ id: candidate.id }];
      return [];
    },
    conductReviewCandidate: { findUnique: async () => candidate },
    conductIncident: {
      findUnique: async () => assert.fail("a missing incident must not be read"),
      create: async (args: { data: { status: ConductIncidentStatus } }) => {
        assert.equal(args.data.status, ConductIncidentStatus.UNDER_REVIEW);
        return newIncident;
      },
      update: async () => assert.fail("new incident version must not be incremented")
    },
    conductReport: {
      findFirst: async () => null,
      create: async () => ({
        id: "report-new",
        reference: "RPT-NEW",
        incidentId: newIncident.id,
        status: ConductReportStatus.UNDER_REVIEW
      }),
      findMany: async () => assert.fail("new incident status is derived during creation")
    }
  } as unknown as Prisma.TransactionClient;

  const result = await createApprovedCandidateReportRecord(
    transaction,
    candidate,
    "admin-1",
    "Reviewed by a moderator"
  );
  assert.equal(result.replayed, false);
  assert.equal(result.incident.version, 1);
  assert.equal(result.incident.status, ConductIncidentStatus.UNDER_REVIEW);
});

test("candidate approval reauthorizes the locked actor and refuses completed candidates", async () => {
  let candidateReads = 0;
  const activeCandidate = {
    id: "candidate-1",
    authorUserId: "author-1",
    groupId: null,
    locationType: ConductLocationType.MAIN_STREAM_POST
  };
  const inactiveActorTransaction = {
    $queryRaw: async () => [
      { id: "admin-1", role: UserRole.ADMIN, deactivatedAt: new Date("2026-07-21T11:00:00.000Z") },
      { id: "author-1", role: UserRole.MEMBER, deactivatedAt: null }
    ],
    conductReviewCandidate: {
      findUnique: async () => {
        candidateReads += 1;
        return null;
      }
    }
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(
    () => createApprovedCandidateReportRecord(
      inactiveActorTransaction,
      activeCandidate,
      "admin-1",
      "Reviewed by a moderator"
    ),
    (error: unknown) => error instanceof ConductCandidateOperationError
  );
  assert.equal(candidateReads, 0);

  const dismissedCandidateTransaction = {
    $queryRaw: async (query: { sql: string }) => query.sql.includes('FROM "User"')
      ? [
          { id: "admin-1", role: UserRole.ADMIN, deactivatedAt: null },
          { id: "author-1", role: UserRole.MEMBER, deactivatedAt: null }
        ]
      : [{ id: "locked" }],
    conductReviewCandidate: {
      findUnique: async () => ({
        id: "candidate-dismissed",
        status: ConductReviewStatus.DISMISSED,
        incidentId: null,
        authorUserId: "author-1",
        groupId: null,
        locationType: ConductLocationType.MAIN_STREAM_POST
      })
    }
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(
    () => createApprovedCandidateReportRecord(
      dismissedCandidateTransaction,
      {
        id: "candidate-dismissed",
        authorUserId: "author-1",
        groupId: null,
        locationType: ConductLocationType.MAIN_STREAM_POST
      },
      "admin-1",
      "Reviewed by a moderator"
    ),
    (error: unknown) => error instanceof ConductCandidateOperationError
      && error.message === "That review candidate has already been completed."
  );
});

test("an already-approved candidate replays without locking or mutating its incident", async () => {
  const candidate = {
    id: "candidate-approved",
    reference: "CAN-APPROVED",
    status: ConductReviewStatus.APPROVED,
    incidentId: "incident-1",
    authorUserId: "author-1",
    groupId: null,
    locationType: ConductLocationType.MAIN_STREAM_POST
  };
  let incidentReads = 0;
  let reportReads = 0;
  const transaction = {
    $queryRaw: async (query: { sql: string }) => {
      if (query.sql.includes('FROM "User"')) {
        return [
          { id: "admin-1", role: UserRole.ADMIN, deactivatedAt: null },
          { id: "author-1", role: UserRole.MEMBER, deactivatedAt: null }
        ];
      }
      if (query.sql.includes("ConductReviewCandidate")) return [{ id: candidate.id }];
      return assert.fail("replay must not acquire the incident mutation lock");
    },
    conductReviewCandidate: { findUnique: async () => candidate },
    conductIncident: {
      findUnique: async () => {
        incidentReads += 1;
        return { id: "incident-1", reference: "INC-1", version: 5 };
      },
      create: async () => assert.fail("replay must not create an incident"),
      update: async () => assert.fail("replay must not advance incident version")
    },
    conductReport: {
      findFirst: async () => {
        reportReads += 1;
        return { id: "report-1", reference: "RPT-1", incidentId: "incident-1" };
      },
      create: async () => assert.fail("replay must not create a report"),
      findMany: async () => assert.fail("replay must not recompute the aggregate")
    }
  } as unknown as Prisma.TransactionClient;

  const result = await createApprovedCandidateReportRecord(
    transaction,
    candidate,
    "admin-1",
    "Reviewed by a moderator"
  );
  assert.equal(result.replayed, true);
  assert.equal(incidentReads, 1);
  assert.equal(reportReads, 1);
});

test("candidate assignment locks users and group authority in stable order before the candidate", async () => {
  const events: string[] = [];
  const candidate = {
    id: "candidate-group",
    authorUserId: "author-1",
    groupId: "group-1",
    locationType: ConductLocationType.GROUP_FORUM_POST,
    status: ConductReviewStatus.PENDING
  };
  const transaction = {
    $queryRaw: async (query: { sql: string; values: unknown[] }) => {
      if (query.sql.includes('FROM "User"')) {
        events.push("users-lock");
        assert.deepEqual(query.values, ["a-moderator", "z-admin"]);
        return [
          { id: "a-moderator", role: UserRole.MEMBER, deactivatedAt: null },
          { id: "z-admin", role: UserRole.ADMIN, deactivatedAt: null }
        ];
      }
      if (query.sql.includes('FROM "GroupMember"')) {
        events.push("memberships-lock");
        assert.deepEqual(query.values, ["group-1", "a-moderator", "z-admin"]);
        return [{ userId: "a-moderator", role: GroupMemberRole.MODERATOR }];
      }
      events.push("candidate-lock");
      return [{ id: candidate.id }];
    },
    conductReviewCandidate: {
      findUnique: async () => {
        events.push("candidate-read");
        return candidate;
      }
    }
  } as unknown as Prisma.TransactionClient;

  const locked = await lockAndAuthorizeConductCandidate(transaction, "z-admin", candidate, {
    assigneeUserId: "a-moderator"
  });
  assert.equal(locked.id, candidate.id);
  assert.deepEqual(events, ["users-lock", "memberships-lock", "candidate-lock", "candidate-read"]);
});

test("candidate assignment rejects an active user without platform or matching group authority", async () => {
  const candidate = {
    id: "candidate-group",
    authorUserId: "author-1",
    groupId: "group-1",
    locationType: ConductLocationType.GROUP_FORUM_POST,
    status: ConductReviewStatus.PENDING
  };
  const transaction = {
    $queryRaw: async (query: { sql: string }) => {
      if (query.sql.includes('FROM "User"')) {
        return [
          { id: "admin-1", role: UserRole.ADMIN, deactivatedAt: null },
          { id: "ordinary-1", role: UserRole.MEMBER, deactivatedAt: null }
        ];
      }
      if (query.sql.includes('FROM "GroupMember"')) return [];
      return [{ id: candidate.id }];
    },
    conductReviewCandidate: { findUnique: async () => candidate }
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    () => lockAndAuthorizeConductCandidate(transaction, "admin-1", candidate, {
      assigneeUserId: "ordinary-1"
    }),
    (error: unknown) => error instanceof ConductCandidateOperationError
      && error.message.includes("qualified moderator")
  );
});

test("candidate approval rejects an inactive subject before incident work", async () => {
  const candidate = {
    id: "candidate-inactive-subject",
    authorUserId: "author-inactive",
    groupId: null,
    locationType: ConductLocationType.MAIN_STREAM_POST,
    status: ConductReviewStatus.PENDING,
    incidentId: null
  };
  const transaction = {
    $queryRaw: async (query: { sql: string }) => {
      if (query.sql.includes('FROM "User"')) {
        return [
          { id: "admin-1", role: UserRole.ADMIN, deactivatedAt: null },
          { id: "author-inactive", role: UserRole.MEMBER, deactivatedAt: new Date("2026-07-21T12:00:00.000Z") }
        ];
      }
      if (query.sql.includes('FROM "ConductReviewCandidate"')) return [{ id: candidate.id }];
      return assert.fail("inactive candidate subjects must be rejected before incident locking");
    },
    conductReviewCandidate: { findUnique: async () => candidate }
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    () => createApprovedCandidateReportRecord(
      transaction,
      candidate,
      "admin-1",
      "Reviewed by a moderator"
    ),
    (error: unknown) => error instanceof ConductCandidateOperationError
      && error.message === "The account named by that review candidate is no longer active."
  );
});

test("candidate operations normalize exhausted serialization and uniqueness conflicts", () => {
  for (const code of ["P2034", "P2002"] as const) {
    const error = new Prisma.PrismaClientKnownRequestError("retry exhausted", {
      code,
      clientVersion: "test"
    });
    assert.deepEqual(candidateOperationFailure(error), {
      ok: false,
      error: "The review candidate changed while this request was being applied. Refresh it and try again."
    });
  }
});
