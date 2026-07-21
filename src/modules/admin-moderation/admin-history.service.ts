import { createHash, randomUUID } from "node:crypto";
import {
  AuditOutcome,
  AuditSeverity,
  LogLevel,
  Prisma,
  RecordRetentionClass,
  UserRole
} from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { isAdminRole } from "@/lib/platform/roles";

const DEFAULT_PAGE_SIZE = 25;
export const MAX_ADMIN_HISTORY_PAGE_SIZE = 100;
export const MAX_ADMIN_HISTORY_EXPORT_RECORDS = 2_000;
export const MAX_ADMIN_HISTORY_EXPORT_BYTES = 5 * 1024 * 1024;

const optionalSearchText = z.string().trim().min(1).max(180).optional();
const optionalDateTime = z
  .union([z.date(), z.string().datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)))
  .optional();

const paginationShape = {
  cursor: z.string().trim().min(1).max(500).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_ADMIN_HISTORY_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)
} as const;

const timeRangeShape = {
  from: optionalDateTime,
  to: optionalDateTime
} as const;

function validateTimeRange(value: { from?: Date; to?: Date }, context: z.RefinementCtx) {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["to"],
      message: "The end of the history range must be on or after the start."
    });
  }
}

const adminAuditHistoryQueryObject = z.object({
    ...paginationShape,
    ...timeRangeShape,
    actor: optionalSearchText,
    target: optionalSearchText,
    action: optionalSearchText,
    module: optionalSearchText,
    search: optionalSearchText,
    severity: z.nativeEnum(AuditSeverity).optional(),
    outcome: z.nativeEnum(AuditOutcome).optional(),
    retentionClass: z.nativeEnum(RecordRetentionClass).optional()
  });
export const adminAuditHistoryQuerySchema = adminAuditHistoryQueryObject.superRefine(validateTimeRange);

const adminDiagnosticHistoryQueryObject = z.object({
    ...paginationShape,
    ...timeRangeShape,
    actor: optionalSearchText,
    module: optionalSearchText,
    search: optionalSearchText,
    level: z.nativeEnum(LogLevel).optional()
  });
export const adminDiagnosticHistoryQuerySchema = adminDiagnosticHistoryQueryObject.superRefine(validateTimeRange);

const auditExportFilterSchema = adminAuditHistoryQueryObject.omit({ cursor: true, pageSize: true }).superRefine(validateTimeRange);
const diagnosticExportFilterSchema = adminDiagnosticHistoryQueryObject
  .omit({ cursor: true, pageSize: true })
  .superRefine(validateTimeRange);

export const adminHistoryExportSchema = z.object({
  recordTypes: z.array(z.enum(["AUDIT", "DIAGNOSTIC"])).min(1).max(2).transform((values) => [...new Set(values)]),
  format: z.enum(["CSV", "NDJSON"]).default("CSV"),
  limit: z.coerce.number().int().min(1).max(MAX_ADMIN_HISTORY_EXPORT_RECORDS).default(1_000),
  includePayloads: z.boolean().default(false),
  audit: auditExportFilterSchema.optional(),
  diagnostics: diagnosticExportFilterSchema.optional()
});

export type AdminAuditHistoryQuery = z.input<typeof adminAuditHistoryQuerySchema>;
export type AdminDiagnosticHistoryQuery = z.input<typeof adminDiagnosticHistoryQuerySchema>;
export type AdminHistoryExportRequest = z.input<typeof adminHistoryExportSchema>;

type AdminHistoryActor = {
  id: string;
  username: string;
  email: string;
  profile: { displayName: string | null } | null;
};

type AuditHistoryRecord = {
  recordType: "AUDIT";
  id: string;
  operationId: string;
  requestId: string | null;
  actorUserId: string | null;
  actor: AdminHistoryActor | null;
  module: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  severity: AuditSeverity;
  outcome: AuditOutcome;
  retentionClass: RecordRetentionClass;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
};

type DiagnosticHistoryRecord = {
  recordType: "DIAGNOSTIC";
  id: string;
  level: LogLevel;
  module: string;
  message: string;
  context: Prisma.JsonValue | null;
  requestId: string | null;
  userId: string | null;
  actor: AdminHistoryActor | null;
  createdAt: string;
};

type HistoryRecord = AuditHistoryRecord | DiagnosticHistoryRecord;

type HistoryPage<T> = {
  records: T[];
  pageSize: number;
  nextCursor: string | null;
  totalMatching: number;
};

type ServiceFailure = {
  ok: false;
  code: "FORBIDDEN" | "INVALID_QUERY";
  error: string;
};

export type AdminHistoryReader = Pick<Prisma.TransactionClient, "user" | "auditLog" | "diagnosticLog">;

const actorSelect = {
  id: true,
  username: true,
  email: true,
  profile: { select: { displayName: true } }
} satisfies Prisma.UserSelect;

const auditSelect = {
  id: true,
  operationId: true,
  requestId: true,
  actorUserId: true,
  actor: { select: actorSelect },
  module: true,
  action: true,
  targetType: true,
  targetId: true,
  severity: true,
  outcome: true,
  retentionClass: true,
  before: true,
  after: true,
  metadata: true,
  createdAt: true
} satisfies Prisma.AuditLogSelect;

const diagnosticSelect = {
  id: true,
  level: true,
  module: true,
  message: true,
  context: true,
  requestId: true,
  userId: true,
  user: { select: actorSelect },
  createdAt: true
} satisfies Prisma.DiagnosticLogSelect;

type SelectedAudit = Prisma.AuditLogGetPayload<{ select: typeof auditSelect }>;
type SelectedDiagnostic = Prisma.DiagnosticLogGetPayload<{ select: typeof diagnosticSelect }>;

export function canReadAdminHistory(role: UserRole | null | undefined, deactivatedAt: Date | null | undefined) {
  return isAdminRole(role) && !deactivatedAt;
}

async function authorizeHistoryReader(actorUserId: string | undefined, reader: AdminHistoryReader) {
  if (!actorUserId) return null;
  const actor = await reader.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, role: true, deactivatedAt: true }
  });
  return actor && canReadAdminHistory(actor.role, actor.deactivatedAt) ? actor : null;
}

type HistoryCursor = { v: 1; id: string };

export function encodeAdminHistoryCursor(id: string) {
  return Buffer.from(JSON.stringify({ v: 1, id } satisfies HistoryCursor), "utf8").toString("base64url");
}

export function decodeAdminHistoryCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<HistoryCursor>;
    return value.v === 1 && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 191
      ? value.id
      : null;
  } catch {
    return null;
  }
}

function dateWhere(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
  return from || to ? { gte: from, lte: to } : undefined;
}

function actorWhere(search: string): Prisma.UserNullableRelationFilter {
  return {
    is: {
      OR: [
        { id: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { profile: { is: { displayName: { contains: search, mode: "insensitive" } } } }
      ]
    }
  };
}

export function buildAdminAuditHistoryWhere(
  filter: z.output<typeof adminAuditHistoryQuerySchema>
): Prisma.AuditLogWhereInput {
  const AND: Prisma.AuditLogWhereInput[] = [];
  if (filter.actor) AND.push({ actor: actorWhere(filter.actor) });
  if (filter.target) {
    AND.push({
      OR: [
        { targetType: { contains: filter.target, mode: "insensitive" } },
        { targetId: { contains: filter.target, mode: "insensitive" } }
      ]
    });
  }
  if (filter.action) AND.push({ action: { contains: filter.action, mode: "insensitive" } });
  if (filter.module) AND.push({ module: { contains: filter.module, mode: "insensitive" } });
  if (filter.search) {
    AND.push({
      OR: [
        { operationId: { contains: filter.search, mode: "insensitive" } },
        { requestId: { contains: filter.search, mode: "insensitive" } },
        { module: { contains: filter.search, mode: "insensitive" } },
        { action: { contains: filter.search, mode: "insensitive" } },
        { targetType: { contains: filter.search, mode: "insensitive" } },
        { targetId: { contains: filter.search, mode: "insensitive" } },
        { actor: actorWhere(filter.search) }
      ]
    });
  }
  const createdAt = dateWhere(filter.from, filter.to);
  if (createdAt) AND.push({ createdAt });
  if (filter.severity) AND.push({ severity: filter.severity });
  if (filter.outcome) AND.push({ outcome: filter.outcome });
  if (filter.retentionClass) AND.push({ retentionClass: filter.retentionClass });
  return AND.length ? { AND } : {};
}

export function buildAdminDiagnosticHistoryWhere(
  filter: z.output<typeof adminDiagnosticHistoryQuerySchema>
): Prisma.DiagnosticLogWhereInput {
  const AND: Prisma.DiagnosticLogWhereInput[] = [];
  if (filter.actor) AND.push({ user: actorWhere(filter.actor) });
  if (filter.module) AND.push({ module: { contains: filter.module, mode: "insensitive" } });
  if (filter.search) {
    AND.push({
      OR: [
        { requestId: { contains: filter.search, mode: "insensitive" } },
        { module: { contains: filter.search, mode: "insensitive" } },
        { message: { contains: filter.search, mode: "insensitive" } },
        { user: actorWhere(filter.search) }
      ]
    });
  }
  const createdAt = dateWhere(filter.from, filter.to);
  if (createdAt) AND.push({ createdAt });
  if (filter.level) AND.push({ level: filter.level });
  return AND.length ? { AND } : {};
}

function toAuditRecord(record: SelectedAudit): AuditHistoryRecord {
  return { recordType: "AUDIT", ...record, createdAt: record.createdAt.toISOString() };
}

function toDiagnosticRecord(record: SelectedDiagnostic): DiagnosticHistoryRecord {
  const { user, ...rest } = record;
  return { recordType: "DIAGNOSTIC", ...rest, actor: user, createdAt: record.createdAt.toISOString() };
}

function invalidCursorFailure(): ServiceFailure {
  return { ok: false, code: "INVALID_QUERY", error: "That history cursor is invalid or expired." };
}

function invalidQueryFailure(error: z.ZodError): ServiceFailure {
  return { ok: false, code: "INVALID_QUERY", error: error.issues[0]?.message ?? "Invalid history query." };
}

export async function queryAdminAuditHistory(
  actorUserId: string | undefined,
  input: AdminAuditHistoryQuery,
  reader: AdminHistoryReader = prisma
): Promise<ServiceFailure | { ok: true; page: HistoryPage<AuditHistoryRecord> }> {
  if (!(await authorizeHistoryReader(actorUserId, reader))) {
    return { ok: false, code: "FORBIDDEN", error: "Admin access required." };
  }
  const parsed = adminAuditHistoryQuerySchema.safeParse(input);
  if (!parsed.success) return invalidQueryFailure(parsed.error);
  const cursorId = decodeAdminHistoryCursor(parsed.data.cursor);
  if (parsed.data.cursor && !cursorId) return invalidCursorFailure();
  const where = buildAdminAuditHistoryWhere(parsed.data);
  const [rows, totalMatching] = await Promise.all([
    reader.auditLog.findMany({
      where,
      select: auditSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: parsed.data.pageSize + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {})
    }),
    reader.auditLog.count({ where })
  ]);
  const hasMore = rows.length > parsed.data.pageSize;
  const pageRows = hasMore ? rows.slice(0, parsed.data.pageSize) : rows;
  return {
    ok: true,
    page: {
      records: pageRows.map(toAuditRecord),
      pageSize: parsed.data.pageSize,
      nextCursor: hasMore ? encodeAdminHistoryCursor(pageRows.at(-1)!.id) : null,
      totalMatching
    }
  };
}

export async function queryAdminDiagnosticHistory(
  actorUserId: string | undefined,
  input: AdminDiagnosticHistoryQuery,
  reader: AdminHistoryReader = prisma
): Promise<ServiceFailure | { ok: true; page: HistoryPage<DiagnosticHistoryRecord> }> {
  if (!(await authorizeHistoryReader(actorUserId, reader))) {
    return { ok: false, code: "FORBIDDEN", error: "Admin access required." };
  }
  const parsed = adminDiagnosticHistoryQuerySchema.safeParse(input);
  if (!parsed.success) return invalidQueryFailure(parsed.error);
  const cursorId = decodeAdminHistoryCursor(parsed.data.cursor);
  if (parsed.data.cursor && !cursorId) return invalidCursorFailure();
  const where = buildAdminDiagnosticHistoryWhere(parsed.data);
  const [rows, totalMatching] = await Promise.all([
    reader.diagnosticLog.findMany({
      where,
      select: diagnosticSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: parsed.data.pageSize + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {})
    }),
    reader.diagnosticLog.count({ where })
  ]);
  const hasMore = rows.length > parsed.data.pageSize;
  const pageRows = hasMore ? rows.slice(0, parsed.data.pageSize) : rows;
  return {
    ok: true,
    page: {
      records: pageRows.map(toDiagnosticRecord),
      pageSize: parsed.data.pageSize,
      nextCursor: hasMore ? encodeAdminHistoryCursor(pageRows.at(-1)!.id) : null,
      totalMatching
    }
  };
}

type ExportRow = Record<string, string | number | boolean | null>;

function jsonCell(value: Prisma.JsonValue | null) {
  return value === null ? null : JSON.stringify(value);
}

function toExportRow(record: HistoryRecord, includePayloads: boolean): ExportRow {
  if (record.recordType === "AUDIT") {
    return {
      recordType: record.recordType,
      id: record.id,
      createdAt: record.createdAt,
      level: record.severity,
      outcome: record.outcome,
      module: record.module,
      action: record.action,
      message: null,
      actorUserId: record.actorUserId,
      actorUsername: record.actor?.username ?? null,
      actorEmail: record.actor?.email ?? null,
      targetType: record.targetType,
      targetId: record.targetId,
      requestId: record.requestId,
      operationId: record.operationId,
      retentionClass: record.retentionClass,
      before: includePayloads ? jsonCell(record.before) : null,
      after: includePayloads ? jsonCell(record.after) : null,
      metadata: includePayloads ? jsonCell(record.metadata) : null
    };
  }
  return {
    recordType: record.recordType,
    id: record.id,
    createdAt: record.createdAt,
    level: record.level,
    outcome: null,
    module: record.module,
    action: null,
    message: record.message,
    actorUserId: record.userId,
    actorUsername: record.actor?.username ?? null,
    actorEmail: record.actor?.email ?? null,
    targetType: null,
    targetId: null,
    requestId: record.requestId,
    operationId: null,
    retentionClass: null,
    before: null,
    after: null,
    metadata: includePayloads ? jsonCell(record.context) : null
  };
}

const exportColumns = [
  "recordType",
  "id",
  "createdAt",
  "level",
  "outcome",
  "module",
  "action",
  "message",
  "actorUserId",
  "actorUsername",
  "actorEmail",
  "targetType",
  "targetId",
  "requestId",
  "operationId",
  "retentionClass",
  "before",
  "after",
  "metadata"
] as const;

function spreadsheetSafe(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: ExportRow[string]) {
  if (value === null) return "";
  const safeValue = spreadsheetSafe(String(value));
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replaceAll('"', '""')}"` : safeValue;
}

export function serializeAdminHistoryExport(
  records: HistoryRecord[],
  format: "CSV" | "NDJSON",
  includePayloads: boolean,
  maxBytes = MAX_ADMIN_HISTORY_EXPORT_BYTES
) {
  const prefix = format === "CSV" ? `${exportColumns.join(",")}\r\n` : "";
  let content = prefix;
  let exportedCount = 0;
  for (const record of records) {
    const row = toExportRow(record, includePayloads);
    const line =
      format === "CSV"
        ? `${exportColumns.map((column) => csvCell(row[column] ?? null)).join(",")}\r\n`
        : `${JSON.stringify(row)}\n`;
    if (Buffer.byteLength(content, "utf8") + Buffer.byteLength(line, "utf8") > maxBytes) break;
    content += line;
    exportedCount += 1;
  }
  return { content, exportedCount, byteLimited: exportedCount < records.length };
}

export async function exportAdminHistory(
  actorUserId: string | undefined,
  input: AdminHistoryExportRequest
): Promise<
  | ServiceFailure
  | {
      ok: true;
      export: {
        exportId: string;
        fileName: string;
        mimeType: string;
        content: string;
        sha256: string;
        recordCount: number;
        truncated: boolean;
      };
    }
> {
  const parsed = adminHistoryExportSchema.safeParse(input);
  if (!parsed.success) return invalidQueryFailure(parsed.error);

  return prisma.$transaction(async (transaction) => {
    if (!(await authorizeHistoryReader(actorUserId, transaction))) {
      return { ok: false as const, code: "FORBIDDEN" as const, error: "Admin access required." };
    }

    const limit = parsed.data.limit;
    const records: HistoryRecord[] = [];
    let recordLimited = false;
    if (parsed.data.recordTypes.includes("AUDIT")) {
      const auditFilter = adminAuditHistoryQuerySchema.parse({ ...(parsed.data.audit ?? {}), pageSize: 1 });
      const auditRows = await transaction.auditLog.findMany({
        where: buildAdminAuditHistoryWhere(auditFilter),
        select: auditSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1
      });
      recordLimited ||= auditRows.length > limit;
      records.push(...auditRows.slice(0, limit).map(toAuditRecord));
    }
    if (parsed.data.recordTypes.includes("DIAGNOSTIC")) {
      const diagnosticFilter = adminDiagnosticHistoryQuerySchema.parse({
        ...(parsed.data.diagnostics ?? {}),
        pageSize: 1
      });
      const diagnosticRows = await transaction.diagnosticLog.findMany({
        where: buildAdminDiagnosticHistoryWhere(diagnosticFilter),
        select: diagnosticSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1
      });
      recordLimited ||= diagnosticRows.length > limit;
      records.push(...diagnosticRows.slice(0, limit).map(toDiagnosticRecord));
    }
    records.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    recordLimited ||= records.length > limit;
    const selectedRecords = records.slice(0, limit);
    const serialized = serializeAdminHistoryExport(
      selectedRecords,
      parsed.data.format,
      parsed.data.includePayloads
    );
    const exportId = randomUUID();
    const sha256 = createHash("sha256").update(serialized.content, "utf8").digest("hex");

    await writeAuditLog(
      {
        operationId: exportId,
        actorUserId,
        module: "admin-history",
        action: "history.exported",
        targetType: "AdminHistoryExport",
        targetId: exportId,
        retentionClass: RecordRetentionClass.VITAL,
        metadata: {
          recordTypes: parsed.data.recordTypes,
          format: parsed.data.format,
          requestedLimit: limit,
          recordCount: serialized.exportedCount,
          truncated: recordLimited || serialized.byteLimited,
          includePayloads: parsed.data.includePayloads,
          sha256
        }
      },
      transaction
    );

    const date = new Date().toISOString().slice(0, 10);
    return {
      ok: true as const,
      export: {
        exportId,
        fileName: `theta-space-admin-history-${date}.${parsed.data.format === "CSV" ? "csv" : "ndjson"}`,
        mimeType: parsed.data.format === "CSV" ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8",
        content: serialized.content,
        sha256,
        recordCount: serialized.exportedCount,
        truncated: recordLimited || serialized.byteLimited
      }
    };
  });
}
