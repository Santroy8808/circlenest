import {
  ConductIncidentStatus,
  ConductReportStatus,
  Prisma,
  UserRole,
  type AuditLog
} from "@prisma/client";
import { z } from "zod";
import { createCommandFingerprint, isMatchingCommandFingerprint } from "@/lib/platform/command-fingerprint";
import { prisma } from "@/lib/platform/db";
import {
  AdminTargetAuthorizationError,
  authorizeLockedAdminActor,
  lockAndAuthorizeAdminActor
} from "@/modules/admin-moderation/account-target-authorization";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import type { AdminCommandError, AdminCommandReceipt } from "@/modules/admin-moderation/admin-command.contract";
import { recomputeLockedConductIncidentStatus } from "@/modules/conduct-reporting/incident-status.service";

const MODULE_KEY = "conduct-reporting";
const TERMINAL_STATUSES = new Set<ConductReportStatus>([
  ConductReportStatus.RESOLVED,
  ConductReportStatus.DISMISSED
]);

const LEGAL_CONDUCT_TRANSITIONS: Readonly<Record<ConductReportStatus, readonly ConductReportStatus[]>> = {
  ACTIVE: [ConductReportStatus.UNDER_REVIEW, ConductReportStatus.DISMISSED],
  UNDER_REVIEW: [
    ConductReportStatus.ACTIVE,
    ConductReportStatus.RESOLVED,
    ConductReportStatus.DISMISSED
  ],
  DISPUTED: [],
  RESOLVED: [ConductReportStatus.UNDER_REVIEW],
  DISMISSED: [ConductReportStatus.UNDER_REVIEW],
  RESTRICTED: []
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
    note: z.string().trim().min(2).max(4000)
  })
});

const assignmentSchema = z.object({
  ...commandBase,
  action: z.literal("conduct-report.assign"),
  payload: z.object({
    assigneeUserId: z.string().trim().min(1).max(200).nullable(),
    expectedIncidentVersion: z.number().int().positive(),
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
  incidentVersion: number;
  assignedModeratorUserId: string | null;
  resolvedByUserId: string | null;
  resolutionReason: string | null;
  resolvedAt: string | null;
  version: number;
  updatedAt: string;
};

const snapshotIdSchema = z.string().min(1).max(200).refine(
  (value) => value.trim() === value,
  "Snapshot identifiers cannot contain surrounding whitespace."
);

const conductReportSnapshotSchema = z.object({
  id: snapshotIdSchema,
  reference: z.string().min(1).max(200),
  incidentId: snapshotIdSchema,
  status: z.nativeEnum(ConductReportStatus),
  incidentStatus: z.nativeEnum(ConductIncidentStatus),
  incidentVersion: z.number().int().positive(),
  assignedModeratorUserId: snapshotIdSchema.nullable(),
  resolvedByUserId: snapshotIdSchema.nullable(),
  resolutionReason: z.string().max(4000).nullable(),
  resolvedAt: z.string().datetime({ offset: true }).nullable(),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true })
}).strict();

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

export function canReopenConductReportWithGenericWorkflow(input: {
  from: ConductReportStatus;
  to: ConductReportStatus;
  hasLinkedDispute: boolean;
}) {
  return !(
    input.hasLinkedDispute &&
    input.to === ConductReportStatus.UNDER_REVIEW &&
    (input.from === ConductReportStatus.RESOLVED || input.from === ConductReportStatus.DISMISSED)
  );
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
  incident: { status: ConductIncidentStatus; assignedModeratorUserId: string | null; version: number };
}): ConductReportSnapshot {
  return {
    id: report.id,
    reference: report.reference,
    incidentId: report.incidentId,
    status: report.status,
    incidentStatus: report.incident.status,
    incidentVersion: report.incident.version,
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

export function isConductSerializableConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

export async function retryConductSerializable<T>(operation: () => Promise<T>, maxAttempts = 3) {
  const attempts = Math.min(5, Math.max(1, Math.trunc(maxAttempts)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isConductSerializableConflict(error)) throw error;
      if (attempt === attempts - 1) {
        throw new ConductCommandFailure(
          "VERSION_CONFLICT",
          "The conduct report changed repeatedly while this command was being applied. Refresh the report and try again.",
          true
        );
      }
    }
  }
  throw new ConductCommandFailure("VERSION_CONFLICT", "The conduct report could not be updated safely.", true);
}

export function incidentAssignmentVersionMatchesExpected(currentVersion: number, expectedVersion: number) {
  return currentVersion === expectedVersion;
}

export function orderedConductAdminUserIds(actorUserId: string, assigneeUserId: string | null) {
  return [...new Set([actorUserId, assigneeUserId].filter((value): value is string => Boolean(value?.trim())))]
    .sort();
}

type LockedConductAdminUser = { id: string; role: UserRole; deactivatedAt: Date | null };

async function lockConductCommandUsers(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  assigneeUserId?: string | null
) {
  if (assigneeUserId === undefined) {
    return [await lockAndAuthorizeAdminActor(transaction, actorUserId)] satisfies LockedConductAdminUser[];
  }
  const userIds = orderedConductAdminUserIds(actorUserId, assigneeUserId);
  const users = await transaction.$queryRaw<LockedConductAdminUser[]>(Prisma.sql`
    SELECT "id", "role", "deactivatedAt"
    FROM "User"
    WHERE "id" IN (${Prisma.join(userIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
  authorizeLockedAdminActor({ actorUserId, users });
  return users;
}

function requireLockedActiveAdminAssignee(users: readonly LockedConductAdminUser[], assigneeUserId?: string | null) {
  if (!assigneeUserId) return;
  const assignee = users.find((user) => user.id === assigneeUserId);
  if (!assignee || assignee.deactivatedAt || (assignee.role !== UserRole.ADMIN && assignee.role !== UserRole.GOD)) {
    throw new ConductCommandFailure("VALIDATION_FAILED", "Assign conduct review only to an active administrator.", false, "assigneeUserId");
  }
}

function replayFromAudit(
  audit: AuditLog | null,
  commandId: string,
  actorUserId: string,
  action: string,
  targetId: string,
  commandFingerprint: string
) {
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
  const storedSnapshot = conductReportSnapshotSchema.safeParse(audit.after);
  if (!storedSnapshot.success || storedSnapshot.data.id !== targetId) {
    throw new ConductCommandFailure("COMMAND_FAILED", "The stored command receipt is incomplete. An administrator must review the audit log.");
  }
  return {
    commandId,
    auditLogId: audit.id,
    status: "completed" as const,
    replayed: true,
    result: storedSnapshot.data
  } satisfies AdminCommandReceipt<ConductReportSnapshot>;
}

async function findReplay(
  commandId: string,
  actorUserId: string,
  action: string,
  targetId: string,
  commandFingerprint: string
) {
  return replayFromAudit(
    await prisma.auditLog.findUnique({ where: { operationId: commandId } }),
    commandId,
    actorUserId,
    action,
    targetId,
    commandFingerprint
  );
}

async function findReplayInTransaction(
  transaction: Prisma.TransactionClient,
  commandId: string,
  actorUserId: string,
  action: string,
  targetId: string,
  commandFingerprint: string
) {
  return replayFromAudit(
    await transaction.auditLog.findUnique({ where: { operationId: commandId } }),
    commandId,
    actorUserId,
    action,
    targetId,
    commandFingerprint
  );
}

async function lockConductIncident(transaction: Prisma.TransactionClient, incidentId: string) {
  await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "ConductIncident" WHERE "id" = ${incidentId} FOR UPDATE`
  );
}

async function lockConductReport(transaction: Prisma.TransactionClient, reportId: string) {
  await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "ConductReport" WHERE "id" = ${reportId} FOR UPDATE`
  );
}

async function lockConductTargetScope(
  transaction: Prisma.TransactionClient,
  reportId: string
) {
  const target = await transaction.conductReport.findUnique({ where: { id: reportId }, select: { incidentId: true } });
  if (!target) throw new ConductCommandFailure("TARGET_NOT_FOUND", "Conduct report not found.");
  await lockConductReport(transaction, reportId);
  await lockConductIncident(transaction, target.incidentId);
  return target.incidentId;
}

export async function lockConductCommandScope(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  reportId: string,
  assigneeUserId?: string | null
) {
  const users = await lockConductCommandUsers(transaction, actorUserId, assigneeUserId);
  requireLockedActiveAdminAssignee(users, assigneeUserId);
  return lockConductTargetScope(transaction, reportId);
}

export async function prepareConductCommand(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    reportId: string;
    assigneeUserId?: string | null;
    commandId: string;
    action: string;
    commandFingerprint: string;
  }
) {
  const users = await lockConductCommandUsers(transaction, input.actorUserId, input.assigneeUserId);
  const replay = await findReplayInTransaction(
    transaction,
    input.commandId,
    input.actorUserId,
    input.action,
    input.reportId,
    input.commandFingerprint
  );
  if (replay) return { replay, incidentId: null };
  requireLockedActiveAdminAssignee(users, input.assigneeUserId);
  return {
    replay: null,
    incidentId: await lockConductTargetScope(transaction, input.reportId)
  };
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
      note: command.payload.note
    }
  });

  try {
    const completed = await retryConductSerializable(() => prisma.$transaction(async (transaction) => {
      const prepared = await prepareConductCommand(transaction, {
        actorUserId,
        reportId: command.target.id,
        commandId: command.commandId,
        action: command.action,
        commandFingerprint
      });
      if (prepared.replay) {
        return {
          auditLogId: prepared.replay.auditLogId,
          result: prepared.replay.result,
          replayed: true
        };
      }
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
      if (
        command.payload.toStatus === ConductReportStatus.UNDER_REVIEW &&
        (current.status === ConductReportStatus.RESOLVED || current.status === ConductReportStatus.DISMISSED)
      ) {
        const linkedDispute = await transaction.conductDispute.findUnique({
          where: { reportId: current.id },
          select: { id: true }
        });
        if (!canReopenConductReportWithGenericWorkflow({
          from: current.status,
          to: command.payload.toStatus,
          hasLinkedDispute: Boolean(linkedDispute)
        })) {
          throw new ConductCommandFailure(
            "VALIDATION_FAILED",
            "A report with a linked dispute can only be reopened through the dedicated dispute workflow.",
            false,
            "toStatus"
          );
        }
      }
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
      await recomputeLockedConductIncidentStatus(transaction, current.incidentId);
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
      return { auditLogId: audit.id, result: after, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    return {
      ok: true as const,
      receipt: {
        commandId: command.commandId,
        auditLogId: completed.auditLogId,
        status: "completed" as const,
        replayed: completed.replayed,
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
    if (error instanceof AdminTargetAuthorizationError) {
      return failed(new ConductCommandFailure("FORBIDDEN", error.message));
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
      expectedIncidentVersion: command.payload.expectedIncidentVersion,
      note: command.payload.note
    }
  });

  try {
    const completed = await retryConductSerializable(() => prisma.$transaction(async (transaction) => {
      const prepared = await prepareConductCommand(transaction, {
        actorUserId,
        reportId: command.target.id,
        assigneeUserId: command.payload.assigneeUserId,
        commandId: command.commandId,
        action: command.action,
        commandFingerprint
      });
      if (prepared.replay) {
        return {
          auditLogId: prepared.replay.auditLogId,
          result: prepared.replay.result,
          replayed: true
        };
      }
      const current = await transaction.conductReport.findUnique({ where: { id: command.target.id }, include: { incident: true } });
      if (!current) throw new ConductCommandFailure("TARGET_NOT_FOUND", "Conduct report not found.");
      if (current.version !== command.expectedVersion) {
        throw new ConductCommandFailure("VERSION_CONFLICT", `Conduct report changed from version ${command.expectedVersion} to ${current.version}.`, true);
      }
      if (!incidentAssignmentVersionMatchesExpected(current.incident.version, command.payload.expectedIncidentVersion)) {
        throw new ConductCommandFailure(
          "VERSION_CONFLICT",
          "The incident assignment changed after this report was loaded. Refresh the report before assigning it.",
          true
        );
      }
      const changed = await transaction.conductReport.updateMany({
        where: { id: current.id, version: command.expectedVersion },
        data: { version: { increment: 1 } }
      });
      if (changed.count !== 1) throw new ConductCommandFailure("VERSION_CONFLICT", "Conduct report changed while this command was being applied.", true);
      const incidentChanged = await transaction.conductIncident.updateMany({
        where: { id: current.incidentId, version: command.payload.expectedIncidentVersion },
        data: { assignedModeratorUserId: command.payload.assigneeUserId, version: { increment: 1 } }
      });
      if (incidentChanged.count !== 1) {
        throw new ConductCommandFailure("VERSION_CONFLICT", "The incident assignment changed while this command was being applied.", true);
      }
      const updated = await transaction.conductReport.findUniqueOrThrow({ where: { id: current.id }, include: { incident: true } });
      const before = reportSnapshot(current);
      const after = reportSnapshot(updated);
      const metadata = {
        commandId: command.commandId,
        commandFingerprint,
        expectedIncidentVersion: command.payload.expectedIncidentVersion,
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
      return { auditLogId: audit.id, result: after, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    return {
      ok: true as const,
      receipt: {
        commandId: command.commandId,
        auditLogId: completed.auditLogId,
        status: "completed" as const,
        replayed: completed.replayed,
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
    if (error instanceof AdminTargetAuthorizationError) {
      return failed(new ConductCommandFailure("FORBIDDEN", error.message));
    }
    if (error instanceof ConductCommandFailure) return failed(error);
    throw error;
  }
}
