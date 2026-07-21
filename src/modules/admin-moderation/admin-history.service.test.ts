import assert from "node:assert/strict";
import test from "node:test";
import { AuditOutcome, AuditSeverity, LogLevel, RecordRetentionClass, UserRole } from "@prisma/client";
import {
  MAX_ADMIN_HISTORY_EXPORT_RECORDS,
  type AdminHistoryReader,
  adminAuditHistoryQuerySchema,
  adminHistoryExportSchema,
  buildAdminAuditHistoryWhere,
  buildAdminDiagnosticHistoryWhere,
  canReadAdminHistory,
  decodeAdminHistoryCursor,
  encodeAdminHistoryCursor,
  queryAdminAuditHistory,
  serializeAdminHistoryExport
} from "@/modules/admin-moderation/admin-history.service";

test("history access accepts only active existing administrator roles", () => {
  assert.equal(canReadAdminHistory(UserRole.ADMIN, null), true);
  assert.equal(canReadAdminHistory(UserRole.GOD, null), true);
  assert.equal(canReadAdminHistory(UserRole.MEMBER, null), false);
  assert.equal(canReadAdminHistory(UserRole.ADMIN, new Date()), false);
});

test("history query validates bounded pages, cursors, and chronological ranges", () => {
  assert.equal(adminAuditHistoryQuerySchema.safeParse({ pageSize: 100 }).success, true);
  assert.equal(adminAuditHistoryQuerySchema.safeParse({ pageSize: 101 }).success, false);
  assert.equal(
    adminAuditHistoryQuerySchema.safeParse({ from: "2026-07-22T00:00:00.000Z", to: "2026-07-21T00:00:00.000Z" })
      .success,
    false
  );
  const cursor = encodeAdminHistoryCursor("audit-record-id");
  assert.equal(decodeAdminHistoryCursor(cursor), "audit-record-id");
  assert.equal(decodeAdminHistoryCursor("not-a-cursor"), null);
});

test("audit and diagnostic filters cover actor, target, action, module, and time", () => {
  const audit = adminAuditHistoryQuerySchema.parse({
    actor: "operator",
    target: "member-10",
    action: "suspend",
    module: "accounts",
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-07-21T23:59:59.999Z",
    severity: AuditSeverity.warning,
    outcome: AuditOutcome.SUCCESS,
    retentionClass: RecordRetentionClass.VITAL
  });
  const auditWhere = buildAdminAuditHistoryWhere(audit);
  assert.equal(Array.isArray(auditWhere.AND), true);
  assert.equal((auditWhere.AND as unknown[]).length, 8);

  const diagnosticWhere = buildAdminDiagnosticHistoryWhere({
    pageSize: 25,
    actor: "operator",
    module: "storage",
    search: "timeout",
    level: LogLevel.error,
    from: new Date("2026-07-01T00:00:00.000Z"),
    to: new Date("2026-07-21T23:59:59.999Z")
  });
  assert.equal(Array.isArray(diagnosticWhere.AND), true);
  assert.equal((diagnosticWhere.AND as unknown[]).length, 5);
});

test("exports are record bounded and spreadsheet-safe", () => {
  assert.equal(adminHistoryExportSchema.safeParse({ recordTypes: ["AUDIT"], limit: MAX_ADMIN_HISTORY_EXPORT_RECORDS }).success, true);
  assert.equal(
    adminHistoryExportSchema.safeParse({ recordTypes: ["AUDIT"], limit: MAX_ADMIN_HISTORY_EXPORT_RECORDS + 1 }).success,
    false
  );

  const serialized = serializeAdminHistoryExport(
    [
      {
        recordType: "DIAGNOSTIC",
        id: "diagnostic-1",
        level: LogLevel.error,
        module: "uploads",
        message: "=HYPERLINK(\"https://example.invalid\")",
        context: null,
        requestId: "request-1",
        userId: null,
        actor: null,
        createdAt: "2026-07-21T12:00:00.000Z"
      }
    ],
    "CSV",
    false
  );
  assert.equal(serialized.exportedCount, 1);
  assert.match(serialized.content, /'=HYPERLINK/);

  const byteLimited = serializeAdminHistoryExport(
    [
      {
        recordType: "DIAGNOSTIC",
        id: "diagnostic-2",
        level: LogLevel.info,
        module: "test",
        message: "A very long diagnostic message",
        context: null,
        requestId: null,
        userId: null,
        actor: null,
        createdAt: "2026-07-21T12:00:00.000Z"
      }
    ],
    "NDJSON",
    false,
    10
  );
  assert.equal(byteLimited.exportedCount, 0);
  assert.equal(byteLimited.byteLimited, true);
});

test("audit query authorizes the actor and returns a stable bounded page", async () => {
  const rows = ["newest", "middle", "oldest"].map((id, index) => ({
    id,
    operationId: `operation-${id}`,
    requestId: null,
    actorUserId: "admin-1",
    actor: {
      id: "admin-1",
      username: "operator",
      email: "operator@example.test",
      profile: { displayName: "Operator" }
    },
    module: "accounts",
    action: "account.reviewed",
    targetType: "User",
    targetId: "member-1",
    severity: AuditSeverity.info,
    outcome: AuditOutcome.SUCCESS,
    retentionClass: RecordRetentionClass.VITAL,
    before: null,
    after: null,
    metadata: null,
    createdAt: new Date(`2026-07-21T12:00:0${2 - index}.000Z`)
  }));
  const reader = {
    user: {
      findUnique: async () => ({ id: "admin-1", role: UserRole.ADMIN, deactivatedAt: null })
    },
    auditLog: {
      findMany: async () => rows,
      count: async () => 10
    },
    diagnosticLog: {}
  } as unknown as AdminHistoryReader;
  const result = await queryAdminAuditHistory("admin-1", { pageSize: 2 }, reader);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.page.records.map((record) => record.id), ["newest", "middle"]);
  assert.equal(result.page.totalMatching, 10);
  assert.equal(decodeAdminHistoryCursor(result.page.nextCursor ?? ""), "middle");
});

test("audit query rejects a deactivated administrator before reading history", async () => {
  let historyRead = false;
  const reader = {
    user: {
      findUnique: async () => ({ id: "admin-1", role: UserRole.ADMIN, deactivatedAt: new Date() })
    },
    auditLog: {
      findMany: async () => {
        historyRead = true;
        return [];
      },
      count: async () => 0
    },
    diagnosticLog: {}
  } as unknown as AdminHistoryReader;
  const result = await queryAdminAuditHistory("admin-1", {}, reader);
  assert.deepEqual(result, { ok: false, code: "FORBIDDEN", error: "Admin access required." });
  assert.equal(historyRead, false);
});
