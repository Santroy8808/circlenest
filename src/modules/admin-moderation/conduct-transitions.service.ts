import {
  ConductIncidentStatus,
  ConductReportStatus,
  Prisma,
  UserRole
} from "@prisma/client";
import { z } from "zod";
import { createCommandFingerprint, isMatchingCommandFingerprint } from "@/lib/platform/command-fingerprint";
import { prisma } from "@/lib/platform/db";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import type { AdminCommandError, AdminCommandReceipt } from "@/modules/admin-moderation/admin-command.contract";

const MODULE_KEY = "conduct-reporting";
const TERMINAL_STATUSES = new Set<ConductReportStatus>([
  ConductReportStatus.RESOLVED,
  ConductReportStatus.DISMISSED,
  ConductReportStatus.RESTRICTED
]);

const LEGAL_CONDUCT_TRANSITIONS: Readonly<Record<ConductReportStatus, readonly ConductReportStatus[]>> = {
  ACTIVE: [ConductReportStatus.UNDER_REVIEW, ConductReportStatus.DISMISSED],
  UNDER_REVIEW: [
    ConductReportStatus.ACTIVE,
    ConductReportStatus.DISPUTED,
    ConductReportStatus.RESOLVED,
    ConductReportStatus.DISMISSED,
    ConductReportStatus.RESTRICTED
  ],
  DISPUTED: [
    ConductReportStatus.UNDER_REVIEW,
    ConductReportStatus.RESOLVED,
    ConductReportStatus.DISMISSED,
    ConductReportStatus.RESTRICTED
  ],
  RESOLVED: [ConductReportStatus.UNDER_REVIEW],
  DISMISSED: [ConductReportStatus.UNDER_REVIEW],
  RESTRICTED: [ConductReportStatus.UNDER_REVIEW, ConductReportStatus.RESOLVED]
};

const commandBase = {
  commandId: z.string().trim().min(8).max(200),
  target: z.object({ type: z.literal("ConductReport"), id: z.string().trim().min(1).max(200) }),
  reason: z.string().trim().min(10).max(1000),
  expectedVersion: z.number().int().positive()
};

const transitionSchema = z.object({
  ...commandBase,
  action: z.literal("conduct-report.transition"),
  payload: z.object({
    fromStatus: z.nativeEnum(ConductReportStatus),
    toStatus: z.nativeEnum(ConductReportStatus),
    note: z.string().trim().min(2).max(4000),
    assigneeUserId: z.string().trim().min(1).max(200).nullable().optional()
  })
});

const assignmentSchema = z.object({
  ...commandBase,
  action: z.literal("conduct-report.assign"),
  payload: z.object({
    assigneeUserId: z.string().trim().min(1).max(200).nullable(),
    note: z.string().trim().min(2).max(4000)
  })
});

export type ConductReportTransitionCommand = z.input<typeof transitionSchema>;
export type ConductReportAssignmentCommand = z.input<typeof assignmentSchema>;

type ConductReportSnapshot = {
  id: string;
  reference: string;
  incidentId: string;
  status: ConductReportStatus;
  incidentStatus: ConductIncidentStatus;
  assignedModeratorUserId: string | null;
  resolvedByUserId: string | null;
  resolutionReason: string | null;
  resolvedAt: string | null;
  version: number;
  updatedAt: string;
};

class ConductCommandFailure extends Error {
  constructor(
    readonly code: AdminCommandError["code"],
    message: string,
    readonly retryable = false,
    readonly field?: string
  ) {
    super(message);
  }
}

export function canTransitionConductReport(from: ConductReportStatus, to: ConductReportStatus) {
  return LEGAL_CONDUCT_TRANSITIONS[from].includes(to);
}

export function deriveConductIncidentStatus(statuses: readonly ConductReportStatus[]): ConductIncidentStatus {
  if (statuses.includes(ConductReportStatus.RESTRICTED)) return ConductIncidentStatus.RESTRICTED;
  if (statuses.includes(ConductReportStatus.DISPUTED)) return ConductIncidentStatus.DISPUTED;
  if (statuses.includes(ConductReportStatus.UNDER_REVIEW)) return ConductIncidentStatus.UNDER_REVIEW;
  if (statuses.includes(ConductReportStatus.ACTIVE)) return ConductIncidentStatus.OPEN;
  if (statuses.includes(ConductReportStatus.RESOLVED)) return ConductIncidentStatus.RESOLVED;
  return ConductIncidentStatus.DISMISSED;
}

function reportSnapshot(report: {
  id: string;
  reference: string;
  incidentId: string;
  status: ConductReportStatus;
  resolvedByUserId: string | null;
  resolutionReason: string | null;
  resolvedAt: Date | null;
  version: number;
  updatedAt: Date;
  incident: { status: ConductIncidentStatus; assignedModeratorUserId: string | null };
}): ConductReportSnapshot {
  return {
    id: report.id,
    reference: report.reference,
    incidentId: report.incidentId,
    status: report.status,
    incidentStatus: report.incident.status,
    assignedModeratorUserId: report.incident.assignedModeratorUserId,
    resolvedByUserId: report.resolvedByUserId,
    resolutionReason: report.resolutionReason,
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    version: report.version,
    updatedAt: report.updatedAt.toISOString()
  };
}

function failed(error: ConductCommandFailure) {
  return {
    ok: false as const,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.field ? { field: error.field } : {})
    } satisfies AdminCommandError
  };
}

function invalid(message: string, field?: string) {
  return failed(new ConductCommandFailure("VALIDATION_FAILED", message, false, field));
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function requireActiveAdminAssignee(transaction: Prisma.TransactionClient, assigneeUserId: string | null | undefined) {
  if (assigneeUserId === undefined || assigneeUserId === null) return;
  const assignee = await transaction.user.findUnique({
    where: { id: assigneeUserId },
    select: { role: true, deactivatedAt: true }
  });
  if (!assignee || assignee.deactivatedAt || (assignee.role !== UserRole.ADMIN && assignee.role !== UserRole.GOD)) {
    throw new ConductCommandFailure("VALIDATION_FAILED", "Assign conduct review only to an active administrator.", false, "assigneeUserId");
  }
}

async function findReplay(
  commandId: string,
  actorUserId: string,
  action: string,
  targetId: string,
  commandFingerprint: string
) {
  const audit = await prisma.auditLog.findUnique({ where: { operationId: commandId } });
  if (!audit) return null;
  if (
    audit.module !== MODULE_KEY ||
    !isMatchingCommandFingerprint(audit, {
      actorUserId,
      action,
      target: { type: "ConductReport", id: targetId },
      fingerprint: commandFingerprint
    })
  ) {
    throw new ConductCommandFailure("VALIDATION_FAILED", "That command id has already been used for another administrator operation.");
  }
  if (!audit.after || typeof audit.after !== "object" || Array.isArray(audit.after)) {
    throw new ConductCommandFailure("COMMAND_FAILED", "The stored command receipt is incomplete. An administrator must review the audit log.");
  }
  return {
    commandId,
    auditLogId: audit.id,
    status: "completed" as const,
    replayed: true,
    result: audit.after as ConductReportSnapshot
  } satisfies AdminCommandReceipt<ConductReportSnapshot>;
}

async function recomputeIncidentStatus(transaction: Prisma.TransactionClient, incidentId: string) {
  const reports = await transaction.conductReport.findMany({ where: { incidentId }, select: { status: true } });
  const status = deriveConductIncidentStatus(reports.map((report) => report.status));
  return transaction.conductIncident.update({ where: { id: incidentId }, data: { status } });
}

async function lockConductIncident(transaction: Prisma.TransactionClient, incidentId: string) {
  await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "ConductIncident" WHERE "id" = ${incidentId} FOR UPDATE`
  );
}

export async function transitionConductReport(actorUserId: string, input: ConductReportTransitionCommand | unknown) {
  if (!(await isAdminUser(actorUserId))) return failed(new ConductCommandFailure("FORBIDDEN", "Admin access required."));
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Invalid conduct transition.", parsed.error.issues[0]?.path.join("."));
  const command = parsed.data;
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action: command.action,
    target: command.target,
    payload: {
      reason: command.reason,
      expectedVersion: command.expectedVersion,
      fromStatus: command.payload.fromStatus,
      toStatus: command.payload.toStatus,
      note: command.payload.note,
      assigneeUserId: command.payload.assigneeUserId
    }
  });

  try {
    const replay = await findReplay(command.commandId, actorUserId, command.action, command.target.id, commandFingerprint);
    if (replay) return { ok: true as const, receipt: replay };
    const completed = await prisma.$transaction(async (transaction) => {
      const target = await transaction.conductReport.findUnique({ where: { id: command.target.id }, select: { incidentId: true } });
      if (!target) throw new ConductCommandFailure("TARGET_NOT_FOUND", "Conduct report not found.");
      await lockConductIncident(transaction, target.incidentId);
      const current = await transaction.conductReport.findUnique({ where: { id: command.target.id }, include: { incident: true } });
      if (!current) throw new ConductCommandFailure("TARGET_NOT_FOUND", "Conduct report not found.");
      if (current.version !== command.expectedVersion) {
        throw new ConductCommandFailure("VERSION_CONFLICT", `Conduct report changed from version ${command.expectedVersion} to ${current.version}.`, true);
      }
      if (current.status !== command.payload.fromStatus) {
        throw new ConductCommandFailure("VERSION_CONFLICT", `Conduct report is now ${current.status}, not ${command.payload.fromStatus}.`, true);
      }
      if (!canTransitionConductReport(current.status, command.payload.toStatus)) {
        throw new ConductCommandFailure("VALIDATION_FAILED", `A conduct report cannot move from ${current.status} to ${command.payload.toStatus}.`, false, "toStatus");
      }
      await requireActiveAdminAssignee(transaction, command.payload.assigneeUserId);
      const terminal = TERMINAL_STATUSES.has(command.payload.toStatus);
      const changed = await transaction.conductReport.updateMany({
        where: { id: current.id, version: command.expectedVersion, status: command.payload.fromStatus },
        data: {
          status: command.payload.toStatus,
          resolvedByUserId: terminal ? actorUserId : null,
          resolutionReason: terminal ? command.payload.note : null,
          resolvedAt: terminal ? new Date() : null,
          version: { increment: 1 }
        }
      });
      if (changed.count !== 1) throw new ConductCommandFailure("VERSION_CONFLICT", "Conduct report changed while this command was being applied.", true);
      if (command.payload.assigneeUserId !== undefined) {
        await transaction.conductIncident.update({
          where: { id: current.incidentId },
          data: { assignedModeratorUserId: command.payload.assigneeUserId }
        });
      }
      await recomputeIncidentStatus(transaction, current.incidentId);
      const updated = await transaction.conductReport.findUniqueOrThrow({ where: { id: current.id }, include: { incident: true } });
      const before = reportSnapshot(current);
      const after = reportSnapshot(updated);
      const metadata = {
        commandId: command.commandId,
        commandFingerprint,
        fromStatus: current.status,
        toStatus: updated.status,
        note: command.payload.note,
        reason: command.reason,
        assignedModeratorUserId: updated.incident.assignedModeratorUserId
      } satisfies Prisma.InputJsonObject;
      await transaction.conductEvent.create({
        data: {
          incidentId: current.incidentId,
          reportId: current.id,
          actorUserId,
          type: "report.status.transitioned",
          metadata
        }
      });
      await transaction.adminAction.create({
        data: { actorUserId, actionKey: "conduct-reports", module: MODULE_KEY, status: "completed", metadata }
      });
      const audit = await transaction.auditLog.create({
        data: {
          operationId: command.commandId,
          requestId: command.commandId,
          actorUserId,
          module: MODULE_KEY,
          action: command.action,
          targetType: "ConductReport",
          targetId: current.id,
          severity: terminal ? "warning" : "info",
          outcome: "SUCCESS",
          before: before as Prisma.InputJsonObject,
          after: after as Prisma.InputJsonObject,
          metadata
        }
      });
      return { auditLogId: audit.id, result: after };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return {
      ok: true as const,
      receipt: {
        commandId: command.commandId,
        auditLogId: completed.auditLogId,
        status: "completed" as const,
        replayed: false,
        result: completed.result
      } satisfies AdminCommandReceipt<ConductReportSnapshot>
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      try {
        const replay = await findReplay(command.commandId, actorUserId, command.action, command.target.id, commandFingerprint);
        if (replay) return { ok: true as const, receipt: replay };
      } catch (replayError) {
        if (replayError instanceof ConductCommandFailure) return failed(replayError);
        throw replayError;
      }
    }
    if (error instanceof ConductCommandFailure) return failed(error);
    throw error;
  }
}

export async function assignConductReport(actorUserId: string, input: ConductReportAssignmentCommand | unknown) {
  if (!(await isAdminUser(actorUserId))) return failed(new ConductCommandFailure("FORBIDDEN", "Admin access required."));
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Invalid conduct assignment.", parsed.error.issues[0]?.path.join("."));
  const command = parsed.data;
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action: command.action,
    target: command.target,
    payload: {
      reason: command.reason,
      expectedVersion: command.expectedVersion,
      assigneeUserId: command.payload.assigneeUserId,
      note: command.payload.note
    }
  });

  try {
    const replay = await findReplay(command.commandId, actorUserId, command.action, command.target.id, commandFingerprint);
    if (replay) return { ok: true as const, receipt: replay };
    const completed = await prisma.$transaction(async (transaction) => {
      const target = await transaction.conductReport.findUnique({ where: { id: command.target.id }, select: { incidentId: true } });
      if (!target) throw new ConductCommandFailure("TARGET_NOT_FOUND", "Conduct report not found.");
      await lockConductIncident(transaction, target.incidentId);
      const current = await transaction.conductReport.findUnique({ where: { id: command.target.id }, include: { incident: true } });
      if (!current) throw new ConductCommandFailure("TARGET_NOT_FOUND", "Conduct report not found.");
      if (current.version !== command.expectedVersion) {
        throw new ConductCommandFailure("VERSION_CONFLICT", `Conduct report changed from version ${command.expectedVersion} to ${current.version}.`, true);
      }
      await requireActiveAdminAssignee(transaction, command.payload.assigneeUserId);
      const changed = await transaction.conductReport.updateMany({
        where: { id: current.id, version: command.expectedVersion },
        data: { version: { increment: 1 } }
      });
      if (changed.count !== 1) throw new ConductCommandFailure("VERSION_CONFLICT", "Conduct report changed while this command was being applied.", true);
      await transaction.conductIncident.update({
        where: { id: current.incidentId },
        data: { assignedModeratorUserId: command.payload.assigneeUserId }
      });
      const updated = await transaction.conductReport.findUniqueOrThrow({ where: { id: current.id }, include: { incident: true } });
      const before = reportSnapshot(current);
      const after = reportSnapshot(updated);
      const metadata = {
        commandId: command.commandId,
        commandFingerprint,
        previousAssigneeUserId: current.incident.assignedModeratorUserId,
        assignedModeratorUserId: updated.incident.assignedModeratorUserId,
        note: command.payload.note,
        reason: command.reason
      } satisfies Prisma.InputJsonObject;
      await transaction.conductEvent.create({
        data: { incidentId: current.incidentId, reportId: current.id, actorUserId, type: "report.assignment.changed", metadata }
      });
      await transaction.adminAction.create({ data: { actorUserId, actionKey: "conduct-reports", module: MODULE_KEY, status: "completed", metadata } });
      const audit = await transaction.auditLog.create({
        data: {
          operationId: command.commandId,
          requestId: command.commandId,
          actorUserId,
          module: MODULE_KEY,
          action: command.action,
          targetType: "ConductReport",
          targetId: current.id,
          outcome: "SUCCESS",
          before: before as Prisma.InputJsonObject,
          after: after as Prisma.InputJsonObject,
          metadata
        }
      });
      return { auditLogId: audit.id, result: after };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return {
      ok: true as const,
      receipt: {
        commandId: command.commandId,
        auditLogId: completed.auditLogId,
        status: "completed" as const,
        replayed: false,
        result: completed.result
      } satisfies AdminCommandReceipt<ConductReportSnapshot>
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      try {
        const replay = await findReplay(command.commandId, actorUserId, command.action, command.target.id, commandFingerprint);
        if (replay) return { ok: true as const, receipt: replay };
      } catch (replayError) {
        if (replayError instanceof ConductCommandFailure) return failed(replayError);
        throw replayError;
      }
    }
    if (error instanceof ConductCommandFailure) return failed(error);
    throw error;
  }
}
