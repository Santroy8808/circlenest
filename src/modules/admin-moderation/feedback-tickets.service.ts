import { FeedbackTicketStatus, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { createCommandFingerprint, isMatchingCommandFingerprint } from "@/lib/platform/command-fingerprint";
import { prisma } from "@/lib/platform/db";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import type {
  AdminFeedbackTicketAssignmentCommand,
  AdminFeedbackTicketNoteCommand,
  AdminFeedbackTicketTransitionCommand
} from "@/modules/admin-moderation/types";
import type { AdminCommandError, AdminCommandReceipt } from "@/modules/admin-moderation/admin-command.contract";

const MODULE_KEY = "admin-moderation";
const TERMINAL_STATUSES = new Set<FeedbackTicketStatus>([FeedbackTicketStatus.RESOLVED, FeedbackTicketStatus.CLOSED]);

const LEGAL_FEEDBACK_TRANSITIONS: Readonly<Record<FeedbackTicketStatus, readonly FeedbackTicketStatus[]>> = {
  OPEN: [FeedbackTicketStatus.IN_REVIEW, FeedbackTicketStatus.CLOSED],
  IN_REVIEW: [FeedbackTicketStatus.OPEN, FeedbackTicketStatus.RESOLVED, FeedbackTicketStatus.CLOSED],
  RESOLVED: [FeedbackTicketStatus.IN_REVIEW, FeedbackTicketStatus.CLOSED],
  CLOSED: [FeedbackTicketStatus.OPEN]
};

const commandBase = {
  commandId: z.string().trim().min(8).max(200),
  target: z.object({ type: z.literal("FeedbackTicket"), id: z.string().trim().min(1).max(200) }),
  reason: z.string().trim().min(10).max(1000),
  expectedVersion: z.number().int().positive()
};

const transitionSchema = z.object({
  ...commandBase,
  action: z.literal("feedback-ticket.transition"),
  payload: z.object({
    fromStatus: z.nativeEnum(FeedbackTicketStatus),
    toStatus: z.nativeEnum(FeedbackTicketStatus),
    note: z.string().trim().min(2).max(4000),
    assigneeUserId: z.string().trim().min(1).max(200).nullable().optional()
  })
});

const assignmentSchema = z.object({
  ...commandBase,
  action: z.literal("feedback-ticket.assign"),
  payload: z.object({
    assigneeUserId: z.string().trim().min(1).max(200).nullable(),
    note: z.string().trim().min(2).max(4000)
  })
});

const noteSchema = z.object({
  ...commandBase,
  action: z.literal("feedback-ticket.note"),
  payload: z.object({ note: z.string().trim().min(2).max(4000) })
});

type FeedbackTicketSnapshot = {
  id: string;
  publicId: string;
  status: FeedbackTicketStatus;
  assignedToUserId: string | null;
  resolvedByUserId: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  version: number;
  updatedAt: string;
};

class FeedbackCommandFailure extends Error {
  constructor(
    readonly code: AdminCommandError["code"],
    message: string,
    readonly retryable = false,
    readonly field?: string
  ) {
    super(message);
  }
}

export function canTransitionFeedbackTicket(from: FeedbackTicketStatus, to: FeedbackTicketStatus) {
  return LEGAL_FEEDBACK_TRANSITIONS[from].includes(to);
}

function ticketSnapshot(ticket: {
  id: string;
  publicId: string;
  status: FeedbackTicketStatus;
  assignedToUserId: string | null;
  resolvedByUserId: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
  version: number;
  updatedAt: Date;
}): FeedbackTicketSnapshot {
  return {
    id: ticket.id,
    publicId: ticket.publicId,
    status: ticket.status,
    assignedToUserId: ticket.assignedToUserId,
    resolvedByUserId: ticket.resolvedByUserId,
    resolution: ticket.resolution,
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    version: ticket.version,
    updatedAt: ticket.updatedAt.toISOString()
  };
}

function failed(error: FeedbackCommandFailure) {
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
  return failed(new FeedbackCommandFailure("VALIDATION_FAILED", message, false, field));
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function requireActiveAdminAssignee(
  transaction: Prisma.TransactionClient,
  assigneeUserId: string | null | undefined
) {
  if (assigneeUserId === undefined || assigneeUserId === null) return;
  const assignee = await transaction.user.findUnique({
    where: { id: assigneeUserId },
    select: { role: true, deactivatedAt: true }
  });
  if (!assignee || assignee.deactivatedAt || (assignee.role !== UserRole.ADMIN && assignee.role !== UserRole.GOD)) {
    throw new FeedbackCommandFailure("VALIDATION_FAILED", "Assign feedback only to an active administrator.", false, "assigneeUserId");
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
      target: { type: "FeedbackTicket", id: targetId },
      fingerprint: commandFingerprint
    })
  ) {
    throw new FeedbackCommandFailure("VALIDATION_FAILED", "That command id has already been used for another administrator operation.");
  }
  if (!audit.after || typeof audit.after !== "object" || Array.isArray(audit.after)) {
    throw new FeedbackCommandFailure("COMMAND_FAILED", "The stored command receipt is incomplete. An administrator must review the audit log.");
  }
  return {
    commandId,
    auditLogId: audit.id,
    status: "completed" as const,
    replayed: true,
    result: audit.after as FeedbackTicketSnapshot
  } satisfies AdminCommandReceipt<FeedbackTicketSnapshot>;
}

export async function transitionFeedbackTicket(actorUserId: string, input: AdminFeedbackTicketTransitionCommand | unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return failed(new FeedbackCommandFailure("FORBIDDEN", "Admin access required."));
  }
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Invalid feedback transition.", parsed.error.issues[0]?.path.join("."));
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
      const current = await transaction.feedbackTicket.findUnique({ where: { id: command.target.id } });
      if (!current) throw new FeedbackCommandFailure("TARGET_NOT_FOUND", "Feedback ticket not found.");
      if (current.version !== command.expectedVersion) {
        throw new FeedbackCommandFailure("VERSION_CONFLICT", `Feedback ticket changed from version ${command.expectedVersion} to ${current.version}.`, true);
      }
      if (current.status !== command.payload.fromStatus) {
        throw new FeedbackCommandFailure("VERSION_CONFLICT", `Feedback ticket is now ${current.status}, not ${command.payload.fromStatus}.`, true);
      }
      if (!canTransitionFeedbackTicket(current.status, command.payload.toStatus)) {
        throw new FeedbackCommandFailure("VALIDATION_FAILED", `A feedback ticket cannot move from ${current.status} to ${command.payload.toStatus}.`, false, "toStatus");
      }
      await requireActiveAdminAssignee(transaction, command.payload.assigneeUserId);

      const terminal = TERMINAL_STATUSES.has(command.payload.toStatus);
      const changed = await transaction.feedbackTicket.updateMany({
        where: { id: current.id, version: command.expectedVersion, status: command.payload.fromStatus },
        data: {
          status: command.payload.toStatus,
          ...(command.payload.assigneeUserId !== undefined ? { assignedToUserId: command.payload.assigneeUserId } : {}),
          resolvedByUserId: terminal ? actorUserId : null,
          resolution: terminal ? command.payload.note : null,
          resolvedAt: terminal ? new Date() : null,
          version: { increment: 1 }
        }
      });
      if (changed.count !== 1) throw new FeedbackCommandFailure("VERSION_CONFLICT", "Feedback ticket changed while this command was being applied.", true);
      const updated = await transaction.feedbackTicket.findUniqueOrThrow({ where: { id: current.id } });
      const before = ticketSnapshot(current);
      const after = ticketSnapshot(updated);
      const eventMetadata = {
        commandId: command.commandId,
        commandFingerprint,
        fromStatus: current.status,
        toStatus: updated.status,
        note: command.payload.note,
        reason: command.reason,
        assignedToUserId: updated.assignedToUserId
      } satisfies Prisma.InputJsonObject;
      await transaction.feedbackTicketEvent.create({
        data: { ticketId: current.id, actorId: actorUserId, action: "status.transitioned", metadata: eventMetadata }
      });
      await transaction.adminAction.create({
        data: {
          actorUserId,
          actionKey: "feedback-tickets",
          module: MODULE_KEY,
          status: "completed",
          metadata: eventMetadata
        }
      });
      const audit = await transaction.auditLog.create({
        data: {
          operationId: command.commandId,
          requestId: command.commandId,
          actorUserId,
          module: MODULE_KEY,
          action: command.action,
          targetType: "FeedbackTicket",
          targetId: current.id,
          severity: terminal ? "warning" : "info",
          outcome: "SUCCESS",
          before: before as Prisma.InputJsonObject,
          after: after as Prisma.InputJsonObject,
          metadata: eventMetadata
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
      } satisfies AdminCommandReceipt<FeedbackTicketSnapshot>
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      try {
        const replay = await findReplay(command.commandId, actorUserId, command.action, command.target.id, commandFingerprint);
        if (replay) return { ok: true as const, receipt: replay };
      } catch (replayError) {
        if (replayError instanceof FeedbackCommandFailure) return failed(replayError);
        throw replayError;
      }
    }
    if (error instanceof FeedbackCommandFailure) return failed(error);
    throw error;
  }
}

export async function assignFeedbackTicket(actorUserId: string, input: AdminFeedbackTicketAssignmentCommand | unknown) {
  if (!(await isAdminUser(actorUserId))) return failed(new FeedbackCommandFailure("FORBIDDEN", "Admin access required."));
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Invalid feedback assignment.", parsed.error.issues[0]?.path.join("."));
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
      const current = await transaction.feedbackTicket.findUnique({ where: { id: command.target.id } });
      if (!current) throw new FeedbackCommandFailure("TARGET_NOT_FOUND", "Feedback ticket not found.");
      if (current.version !== command.expectedVersion) {
        throw new FeedbackCommandFailure("VERSION_CONFLICT", `Feedback ticket changed from version ${command.expectedVersion} to ${current.version}.`, true);
      }
      await requireActiveAdminAssignee(transaction, command.payload.assigneeUserId);
      const changed = await transaction.feedbackTicket.updateMany({
        where: { id: current.id, version: command.expectedVersion },
        data: { assignedToUserId: command.payload.assigneeUserId, version: { increment: 1 } }
      });
      if (changed.count !== 1) throw new FeedbackCommandFailure("VERSION_CONFLICT", "Feedback ticket changed while this command was being applied.", true);
      const updated = await transaction.feedbackTicket.findUniqueOrThrow({ where: { id: current.id } });
      const before = ticketSnapshot(current);
      const after = ticketSnapshot(updated);
      const metadata = {
        commandId: command.commandId,
        commandFingerprint,
        previousAssigneeUserId: current.assignedToUserId,
        assignedToUserId: updated.assignedToUserId,
        note: command.payload.note,
        reason: command.reason
      } satisfies Prisma.InputJsonObject;
      await transaction.feedbackTicketEvent.create({ data: { ticketId: current.id, actorId: actorUserId, action: "assignment.changed", metadata } });
      await transaction.adminAction.create({
        data: { actorUserId, actionKey: "feedback-tickets", module: MODULE_KEY, status: "completed", metadata }
      });
      const audit = await transaction.auditLog.create({
        data: {
          operationId: command.commandId,
          requestId: command.commandId,
          actorUserId,
          module: MODULE_KEY,
          action: command.action,
          targetType: "FeedbackTicket",
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
      } satisfies AdminCommandReceipt<FeedbackTicketSnapshot>
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      try {
        const replay = await findReplay(command.commandId, actorUserId, command.action, command.target.id, commandFingerprint);
        if (replay) return { ok: true as const, receipt: replay };
      } catch (replayError) {
        if (replayError instanceof FeedbackCommandFailure) return failed(replayError);
        throw replayError;
      }
    }
    if (error instanceof FeedbackCommandFailure) return failed(error);
    throw error;
  }
}

export async function addFeedbackTicketNote(actorUserId: string, input: AdminFeedbackTicketNoteCommand | unknown) {
  if (!(await isAdminUser(actorUserId))) return failed(new FeedbackCommandFailure("FORBIDDEN", "Admin access required."));
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Invalid feedback note.", parsed.error.issues[0]?.path.join("."));
  const command = parsed.data;
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action: command.action,
    target: command.target,
    payload: {
      reason: command.reason,
      expectedVersion: command.expectedVersion,
      note: command.payload.note
    }
  });

  try {
    const replay = await findReplay(command.commandId, actorUserId, command.action, command.target.id, commandFingerprint);
    if (replay) return { ok: true as const, receipt: replay };
    const completed = await prisma.$transaction(async (transaction) => {
      const current = await transaction.feedbackTicket.findUnique({ where: { id: command.target.id } });
      if (!current) throw new FeedbackCommandFailure("TARGET_NOT_FOUND", "Feedback ticket not found.");
      if (current.version !== command.expectedVersion) {
        throw new FeedbackCommandFailure("VERSION_CONFLICT", `Feedback ticket changed from version ${command.expectedVersion} to ${current.version}.`, true);
      }
      const changed = await transaction.feedbackTicket.updateMany({
        where: { id: current.id, version: command.expectedVersion },
        data: { version: { increment: 1 } }
      });
      if (changed.count !== 1) throw new FeedbackCommandFailure("VERSION_CONFLICT", "Feedback ticket changed while this command was being applied.", true);
      const updated = await transaction.feedbackTicket.findUniqueOrThrow({ where: { id: current.id } });
      const before = ticketSnapshot(current);
      const after = ticketSnapshot(updated);
      const metadata = {
        commandId: command.commandId,
        commandFingerprint,
        note: command.payload.note,
        reason: command.reason
      } satisfies Prisma.InputJsonObject;
      await transaction.feedbackTicketEvent.create({ data: { ticketId: current.id, actorId: actorUserId, action: "note.added", metadata } });
      await transaction.adminAction.create({ data: { actorUserId, actionKey: "feedback-tickets", module: MODULE_KEY, status: "completed", metadata } });
      const audit = await transaction.auditLog.create({
        data: {
          operationId: command.commandId,
          requestId: command.commandId,
          actorUserId,
          module: MODULE_KEY,
          action: command.action,
          targetType: "FeedbackTicket",
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
      } satisfies AdminCommandReceipt<FeedbackTicketSnapshot>
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      try {
        const replay = await findReplay(command.commandId, actorUserId, command.action, command.target.id, commandFingerprint);
        if (replay) return { ok: true as const, receipt: replay };
      } catch (replayError) {
        if (replayError instanceof FeedbackCommandFailure) return failed(replayError);
        throw replayError;
      }
    }
    if (error instanceof FeedbackCommandFailure) return failed(error);
    throw error;
  }
}
