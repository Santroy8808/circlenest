import { AuditOutcome, AuditSeverity, Prisma, RecordRetentionClass } from "@prisma/client";
import { prisma } from "@/lib/platform/db";

export type AuditInput = {
  operationId?: string;
  requestId?: string;
  actorUserId?: string;
  module: string;
  action: string;
  targetType?: string;
  targetId?: string;
  severity?: AuditSeverity | "info" | "warning" | "critical";
  outcome?: AuditOutcome;
  retentionClass?: RecordRetentionClass;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type AuditWriter = Pick<Prisma.TransactionClient, "auditLog">;

/**
 * Audit writes are mandatory for administrator commands. Pass the active
 * transaction client whenever the audited state change is transactional so the
 * mutation and its immutable VITAL audit record either both commit or both roll
 * back.
 */
export async function writeAuditLog(input: AuditInput, writer: AuditWriter = prisma) {
  return writer.auditLog.create({
    data: {
      operationId: input.operationId,
      requestId: input.requestId,
      actorUserId: input.actorUserId,
      module: input.module,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      severity: input.severity ?? "info",
      outcome: input.outcome ?? AuditOutcome.SUCCESS,
      retentionClass: input.retentionClass ?? RecordRetentionClass.VITAL,
      before: input.before as Prisma.InputJsonObject | undefined,
      after: input.after as Prisma.InputJsonObject | undefined,
      metadata: input.metadata as Prisma.InputJsonObject | undefined
    }
  });
}

export async function findAuditLogByOperationId(operationId: string, reader: AuditWriter = prisma) {
  return reader.auditLog.findUnique({ where: { operationId } });
}
