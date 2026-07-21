import {
  ConductDisputeStatus,
  ConductReportStatus,
  GroupMemberRole,
  Prisma,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { recomputeLockedConductIncidentStatus } from "@/modules/conduct-reporting/incident-status.service";
import { canModerateConductLocation, canViewConductIncident } from "@/modules/conduct-reporting/permissions";
import { asJson, createConductReference } from "@/modules/conduct-reporting/references";

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\r\n/g, "\n").slice(0, maxLength);
}

function cleanLinkedContentUrl(value: unknown) {
  const clean = cleanText(value, 600);
  if (!clean) return null;
  if (!clean.startsWith("/") || clean.startsWith("//") || clean.includes("\\")) return null;
  return clean;
}

type LockedDisputeUser = { id: string; role: UserRole; deactivatedAt: Date | null };
type LockedGroupMembership = { role: GroupMemberRole };

class ConductDisputeStateConflict extends Error {}

function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

export function conductDisputeConcurrencyMessage(error: unknown) {
  return isSerializationConflict(error) || error instanceof ConductDisputeStateConflict
    ? "The dispute changed while this request was being applied. Refresh it and try again."
    : null;
}

export async function retryConductDisputeSerializable<T>(operation: () => Promise<T>, maxAttempts = 3) {
  const attempts = Math.min(5, Math.max(1, Math.trunc(maxAttempts)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryable = isSerializationConflict(error) || error instanceof ConductDisputeStateConflict;
      if (!retryable || attempt === attempts - 1) throw error;
    }
  }
  throw new Error("The dispute transaction could not be completed safely.");
}

async function runConductDisputeTransaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
  try {
    return await retryConductDisputeSerializable(() => prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }));
  } catch (error) {
    const concurrencyMessage = conductDisputeConcurrencyMessage(error);
    if (concurrencyMessage) {
      return {
        ok: false as const,
        error: concurrencyMessage
      };
    }
    throw error;
  }
}

export function orderedConductDisputeUserIds(userIds: readonly (string | null | undefined)[]) {
  return [...new Set(userIds.filter((value): value is string => Boolean(value?.trim())))].sort();
}

function sameConductDisputeUsers(left: readonly string[], right: readonly string[]) {
  const orderedLeft = orderedConductDisputeUserIds(left);
  const orderedRight = orderedConductDisputeUserIds(right);
  return orderedLeft.length === orderedRight.length && orderedLeft.every((id, index) => id === orderedRight[index]);
}

async function lockConductDisputeUsers(
  transaction: Prisma.TransactionClient,
  userIds: readonly (string | null | undefined)[]
) {
  const orderedIds = orderedConductDisputeUserIds(userIds);
  if (orderedIds.length === 0) return [];
  return transaction.$queryRaw<LockedDisputeUser[]>(Prisma.sql`
    SELECT "id", "role", "deactivatedAt"
    FROM "User"
    WHERE "id" IN (${Prisma.join(orderedIds)})
    ORDER BY "id"
    FOR SHARE
  `);
}

async function lockConductGroupMembership(
  transaction: Prisma.TransactionClient,
  groupId: string | null,
  userId: string
) {
  if (!groupId) return null;
  const memberships = await transaction.$queryRaw<LockedGroupMembership[]>(Prisma.sql`
    SELECT "role"
    FROM "GroupMember"
    WHERE "groupId" = ${groupId} AND "userId" = ${userId}
    FOR SHARE
  `);
  return memberships[0] ?? null;
}

function activeLockedUser(users: readonly LockedDisputeUser[], userId: string) {
  const user = users.find((candidate) => candidate.id === userId);
  return user && !user.deactivatedAt ? user : null;
}

export function availableConductDisputeReporterUserId(
  users: readonly Pick<LockedDisputeUser, "id" | "deactivatedAt">[],
  reporterUserId: string | null
) {
  if (!reporterUserId) return null;
  const reporter = users.find((candidate) => candidate.id === reporterUserId);
  return reporter && !reporter.deactivatedAt ? reporter.id : null;
}

export function conductDisputeOpeningParticipantUserIds(
  users: readonly Pick<LockedDisputeUser, "id" | "deactivatedAt">[],
  subjectUserId: string,
  reporterUserId: string | null
) {
  return orderedConductDisputeUserIds([
    subjectUserId,
    availableConductDisputeReporterUserId(users, reporterUserId)
  ]);
}

export function conductDisputeReporterNotificationUserId(
  users: readonly Pick<LockedDisputeUser, "id" | "deactivatedAt">[],
  subjectUserId: string,
  reporterUserId: string | null
) {
  const activeReporterUserId = availableConductDisputeReporterUserId(users, reporterUserId);
  return activeReporterUserId && activeReporterUserId !== subjectUserId ? activeReporterUserId : null;
}

function lockedUserCanModerate(
  user: LockedDisputeUser,
  locationType: string,
  groupId: string | null,
  membership: LockedGroupMembership | null
) {
  if (user.role === UserRole.ADMIN || user.role === UserRole.GOD) return true;
  return Boolean(
    groupId &&
    locationType.startsWith("GROUP_") &&
    (membership?.role === GroupMemberRole.OWNER || membership?.role === GroupMemberRole.MODERATOR)
  );
}

async function lockConductReportRow(transaction: Prisma.TransactionClient, reportId: string) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id" FROM "ConductReport" WHERE "id" = ${reportId} FOR UPDATE
  `);
}

async function lockConductIncidentRow(transaction: Prisma.TransactionClient, incidentId: string) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id" FROM "ConductIncident" WHERE "id" = ${incidentId} FOR UPDATE
  `);
}

async function lockConductDisputeRow(transaction: Prisma.TransactionClient, disputeId: string) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id" FROM "ConductDispute" WHERE "id" = ${disputeId} FOR UPDATE
  `);
}

async function lockConductDisputeParticipants(transaction: Prisma.TransactionClient, disputeId: string) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "ConductDisputeParticipant"
    WHERE "disputeId" = ${disputeId}
    ORDER BY "userId"
    FOR UPDATE
  `);
}

export async function lockConductDisputeTargetRows(
  transaction: Prisma.TransactionClient,
  target: { reportId: string; incidentId: string; disputeId?: string | null }
) {
  await lockConductReportRow(transaction, target.reportId);
  await lockConductIncidentRow(transaction, target.incidentId);
  if (target.disputeId) {
    await lockConductDisputeRow(transaction, target.disputeId);
    await lockConductDisputeParticipants(transaction, target.disputeId);
  }
}

export async function openConductDispute(userId: string, reportReference: string, openingStatement?: unknown) {
  const statement = cleanText(openingStatement, 5000);
  const reference = reportReference.trim().toUpperCase();

  return runConductDisputeTransaction(async (transaction) => {
    const target = await transaction.conductReport.findUnique({
      where: { reference },
      select: { id: true, incidentId: true, reportedUserId: true, reporterUserId: true }
    });
    if (!target) return { ok: false as const, error: "That report is not available for dispute." };

    const users = await lockConductDisputeUsers(transaction, [userId, target.reportedUserId, target.reporterUserId]);
    if (!activeLockedUser(users, userId)) {
      return { ok: false as const, error: "That report is not available for dispute." };
    }
    await lockConductDisputeTargetRows(transaction, {
      reportId: target.id,
      incidentId: target.incidentId
    });
    const report = await transaction.conductReport.findUnique({
      where: { id: target.id },
      include: { dispute: true }
    });
    if (
      !report ||
      report.incidentId !== target.incidentId ||
      report.reportedUserId !== userId ||
      report.reporterUserId !== target.reporterUserId
    ) {
      return { ok: false as const, error: "That report is not available for dispute." };
    }
    if (report.dispute) {
      await lockConductDisputeRow(transaction, report.dispute.id);
      const existing = await transaction.conductDispute.findUnique({
        where: { id: report.dispute.id },
        select: { reference: true }
      });
      if (!existing) throw new ConductDisputeStateConflict("The existing dispute changed while it was being loaded.");
      return { ok: true as const, disputeReference: existing.reference, existing: true as const };
    }
    if (report.status === ConductReportStatus.RESOLVED || report.status === ConductReportStatus.DISMISSED) {
      return { ok: false as const, error: "That report is already closed." };
    }
    const activeReporterUserId = availableConductDisputeReporterUserId(users, report.reporterUserId);
    const reporterNotificationUserId = conductDisputeReporterNotificationUserId(users, userId, report.reporterUserId);
    const reporterParticipantUnavailable = Boolean(report.reporterUserId && !activeReporterUserId);

    const dispute = await transaction.conductDispute.create({
      data: {
        reference: createConductReference("DSP"),
        reportId: report.id,
        incidentId: report.incidentId,
        openedByUserId: userId,
        participants: {
          create: conductDisputeOpeningParticipantUserIds(users, userId, report.reporterUserId).map(
            (participantUserId) => ({ userId: participantUserId, required: true })
          )
        },
        ...(statement
          ? { messages: { create: { authorUserId: userId, body: statement } } }
          : {})
      }
    });
    const changedReport = await transaction.conductReport.updateMany({
      where: { id: report.id, status: report.status, version: report.version },
      data: { status: ConductReportStatus.DISPUTED, version: { increment: 1 } }
    });
    if (changedReport.count !== 1) throw new ConductDisputeStateConflict("The report changed while its dispute was opening.");
    await recomputeLockedConductIncidentStatus(transaction, report.incidentId);
    await transaction.conductEvent.create({
      data: {
        incidentId: report.incidentId,
        reportId: report.id,
        disputeId: dispute.id,
        actorUserId: userId,
        type: "DISPUTE_OPENED",
        metadata: asJson({ openingStatementIncluded: Boolean(statement), reporterParticipantUnavailable })
      }
    });
    if (reporterNotificationUserId) {
      await transaction.notification.create({
        data: {
          userId: reporterNotificationUserId,
          title: "A conduct report was disputed",
          body: `${dispute.reference} is open. You may add a statement and participate in resolution.`,
          href: `/settings/reports/disputes/${encodeURIComponent(dispute.reference)}`
        }
      });
    }
    return { ok: true as const, disputeReference: dispute.reference, existing: false as const };
  });
}

async function loadDisputeAccess(userId: string, reference: string) {
  const dispute = await prisma.conductDispute.findUnique({
    where: { reference: reference.trim().toUpperCase() },
    include: { incident: true, participants: true }
  });
  if (!dispute) return null;
  const participant = dispute.participants.some((item) => item.userId === userId);
  const moderator = await canModerateConductLocation(userId, dispute.incident.locationType, dispute.incident.groupId);
  return participant || moderator ? { dispute, participant, moderator } : null;
}

export async function addConductDisputeStatement(
  userId: string,
  disputeReference: string,
  bodyInput: unknown,
  linkedContentUrlInput?: unknown
) {
  const body = cleanText(bodyInput, 5000);
  const linkedContentUrl = cleanLinkedContentUrl(linkedContentUrlInput);
  if (body.length < 2) return { ok: false as const, error: "Enter a statement before submitting." };
  const reference = disputeReference.trim().toUpperCase();

  return runConductDisputeTransaction(async (transaction) => {
    const target = await transaction.conductDispute.findUnique({
      where: { reference },
      select: {
        id: true,
        reportId: true,
        incidentId: true,
        participants: { select: { userId: true } },
        incident: { select: { locationType: true, groupId: true } }
      }
    });
    if (!target) return { ok: false as const, error: "That open dispute is not available to you." };
    const users = await lockConductDisputeUsers(transaction, [
      userId,
      ...target.participants.map((participant) => participant.userId)
    ]);
    const actor = activeLockedUser(users, userId);
    if (!actor) return { ok: false as const, error: "That open dispute is not available to you." };
    const membership = target.incident.locationType.startsWith("GROUP_")
      ? await lockConductGroupMembership(transaction, target.incident.groupId, userId)
      : null;
    await lockConductDisputeTargetRows(transaction, {
      reportId: target.reportId,
      incidentId: target.incidentId,
      disputeId: target.id
    });
    const dispute = await transaction.conductDispute.findUnique({
      where: { id: target.id },
      include: { incident: true, participants: true }
    });
    if (!dispute || dispute.reportId !== target.reportId || dispute.incidentId !== target.incidentId) {
      return { ok: false as const, error: "That open dispute is not available to you." };
    }
    if (
      dispute.incident.locationType !== target.incident.locationType ||
      dispute.incident.groupId !== target.incident.groupId ||
      !sameConductDisputeUsers(
        target.participants.map((item) => item.userId),
        dispute.participants.map((item) => item.userId)
      )
    ) {
      throw new ConductDisputeStateConflict("Dispute access changed while the statement was being added.");
    }
    const participant = dispute.participants.some((item) => item.userId === userId);
    const moderator = lockedUserCanModerate(
      actor,
      dispute.incident.locationType,
      dispute.incident.groupId,
      membership
    );
    if ((!participant && !moderator) || dispute.status !== ConductDisputeStatus.OPEN) {
      return { ok: false as const, error: "That open dispute is not available to you." };
    }

    const message = await transaction.conductDisputeMessage.create({
      data: { disputeId: dispute.id, authorUserId: userId, body, linkedContentUrl }
    });
    await transaction.conductDisputeParticipant.updateMany({
      where: { disputeId: dispute.id, required: true },
      data: { selectedResolvedAt: null }
    });
    await transaction.conductEvent.create({
      data: {
        incidentId: dispute.incidentId,
        reportId: dispute.reportId,
        disputeId: dispute.id,
        actorUserId: userId,
        type: "DISPUTE_STATEMENT_ADDED",
        metadata: asJson({ messageId: message.id, linkedContentUrl })
      }
    });
    return { ok: true as const, messageId: message.id };
  });
}

export async function selectConductDisputeResolved(userId: string, disputeReference: string) {
  const reference = disputeReference.trim().toUpperCase();

  return runConductDisputeTransaction(async (transaction) => {
    const target = await transaction.conductDispute.findUnique({
      where: { reference },
      select: {
        id: true,
        reportId: true,
        incidentId: true,
        participants: { select: { userId: true } }
      }
    });
    if (!target) return { ok: false as const, error: "You are not a participant in that open dispute." };
    const users = await lockConductDisputeUsers(transaction, [
      userId,
      ...target.participants.map((participant) => participant.userId)
    ]);
    if (!activeLockedUser(users, userId)) {
      return { ok: false as const, error: "You are not a participant in that open dispute." };
    }
    await lockConductDisputeTargetRows(transaction, {
      reportId: target.reportId,
      incidentId: target.incidentId,
      disputeId: target.id
    });
    const dispute = await transaction.conductDispute.findUnique({
      where: { id: target.id },
      include: { participants: true, report: true }
    });
    if (dispute && !sameConductDisputeUsers(
      target.participants.map((item) => item.userId),
      dispute.participants.map((item) => item.userId)
    )) {
      throw new ConductDisputeStateConflict("Dispute participants changed while resolution was being selected.");
    }
    const participant = dispute?.participants.find((item) => item.userId === userId);
    if (!dispute || !participant || dispute.status !== ConductDisputeStatus.OPEN) {
      return { ok: false as const, error: "You are not a participant in that open dispute." };
    }
    if (dispute.report.status !== ConductReportStatus.DISPUTED) {
      return { ok: false as const, error: "That dispute no longer has an open report to resolve." };
    }

    await transaction.conductDisputeParticipant.updateMany({
      where: { id: participant.id, disputeId: dispute.id, userId, selectedResolvedAt: null },
      data: { selectedResolvedAt: new Date() }
    });
    const participants = await transaction.conductDisputeParticipant.findMany({
      where: { disputeId: dispute.id, required: true },
      select: { selectedResolvedAt: true }
    });
    const fullyResolved = participants.length > 0 && participants.every((participant) => participant.selectedResolvedAt);
    if (fullyResolved) {
      const now = new Date();
      const changedDispute = await transaction.conductDispute.updateMany({
        where: { id: dispute.id, status: ConductDisputeStatus.OPEN },
        data: { status: ConductDisputeStatus.RESOLVED, resolvedAt: now }
      });
      if (changedDispute.count !== 1) throw new ConductDisputeStateConflict("The dispute closed while participants were resolving it.");
      const changedReport = await transaction.conductReport.updateMany({
        where: {
          id: dispute.reportId,
          status: ConductReportStatus.DISPUTED,
          version: dispute.report.version
        },
        data: { status: ConductReportStatus.RESOLVED, resolvedAt: now, version: { increment: 1 } }
      });
      if (changedReport.count !== 1) throw new ConductDisputeStateConflict("The disputed report changed before resolution completed.");
      await recomputeLockedConductIncidentStatus(transaction, dispute.incidentId);
    }
    await transaction.conductEvent.create({
      data: {
        incidentId: dispute.incidentId,
        reportId: dispute.reportId,
        disputeId: dispute.id,
        actorUserId: userId,
        type: fullyResolved ? "DISPUTE_RESOLVED_BY_PARTICIPANTS" : "DISPUTE_PARTICIPANT_MARKED_RESOLVED"
      }
    });
    return { ok: true as const, resolved: fullyResolved };
  });
}

export async function overrideConductDisputeResolution(
  moderatorUserId: string,
  disputeReference: string,
  outcome: "RESOLVED" | "DISMISSED",
  reasonInput: unknown
) {
  const reason = cleanText(reasonInput, 2000);
  if (reason.length < 10) return { ok: false as const, error: "Enter a specific override reason." };
  const disputeStatus = outcome === "RESOLVED" ? ConductDisputeStatus.RESOLVED : ConductDisputeStatus.DISMISSED;
  const reportStatus = outcome === "RESOLVED" ? ConductReportStatus.RESOLVED : ConductReportStatus.DISMISSED;
  const reference = disputeReference.trim().toUpperCase();

  const result = await runConductDisputeTransaction(async (transaction) => {
    const target = await transaction.conductDispute.findUnique({
      where: { reference },
      select: {
        id: true,
        reportId: true,
        incidentId: true,
        participants: { select: { userId: true } },
        incident: { select: { locationType: true, groupId: true } }
      }
    });
    if (!target) return { ok: false as const, error: "Moderator access to that open dispute is required." };
    const users = await lockConductDisputeUsers(transaction, [
      moderatorUserId,
      ...target.participants.map((participant) => participant.userId)
    ]);
    const actor = activeLockedUser(users, moderatorUserId);
    if (!actor) return { ok: false as const, error: "Moderator access to that open dispute is required." };
    const membership = target.incident.locationType.startsWith("GROUP_")
      ? await lockConductGroupMembership(transaction, target.incident.groupId, moderatorUserId)
      : null;
    await lockConductDisputeTargetRows(transaction, {
      reportId: target.reportId,
      incidentId: target.incidentId,
      disputeId: target.id
    });
    const dispute = await transaction.conductDispute.findUnique({
      where: { id: target.id },
      include: { incident: true, report: true, participants: true }
    });
    if (dispute && (
      dispute.incident.locationType !== target.incident.locationType ||
      dispute.incident.groupId !== target.incident.groupId ||
      !sameConductDisputeUsers(
        target.participants.map((item) => item.userId),
        dispute.participants.map((item) => item.userId)
      )
    )) {
      throw new ConductDisputeStateConflict("Dispute authority changed while the override was being applied.");
    }
    if (
      !dispute ||
      dispute.status !== ConductDisputeStatus.OPEN ||
      dispute.report.status !== ConductReportStatus.DISPUTED ||
      !lockedUserCanModerate(actor, dispute.incident.locationType, dispute.incident.groupId, membership)
    ) {
      return { ok: false as const, error: "Moderator access to that open dispute is required." };
    }

    const now = new Date();
    const changedDispute = await transaction.conductDispute.updateMany({
      where: { id: dispute.id, status: ConductDisputeStatus.OPEN },
      data: {
        status: disputeStatus,
        resolvedAt: now,
        overrideByUserId: moderatorUserId,
        overrideReason: reason
      }
    });
    if (changedDispute.count !== 1) throw new ConductDisputeStateConflict("The dispute closed before the override was applied.");
    const changedReport = await transaction.conductReport.updateMany({
      where: {
        id: dispute.reportId,
        status: ConductReportStatus.DISPUTED,
        version: dispute.report.version
      },
      data: { status: reportStatus, resolvedAt: now, version: { increment: 1 } }
    });
    if (changedReport.count !== 1) throw new ConductDisputeStateConflict("The disputed report changed before the override was applied.");
    await recomputeLockedConductIncidentStatus(transaction, dispute.incidentId);
    await transaction.conductEvent.create({
      data: {
        incidentId: dispute.incidentId,
        reportId: dispute.reportId,
        disputeId: dispute.id,
        actorUserId: moderatorUserId,
        type: `DISPUTE_MODERATOR_OVERRIDE_${outcome}`,
        metadata: asJson({ reason })
      }
    });
    return { ok: true as const };
  });
  return result;
}

export async function getConductDisputeView(userId: string, disputeReference: string) {
  const access = await loadDisputeAccess(userId, disputeReference);
  if (!access || !(await canViewConductIncident(userId, access.dispute.incidentId))) return null;
  const dispute = await prisma.conductDispute.findUnique({
    where: { id: access.dispute.id },
    include: {
      report: { select: { reference: true, reasonCode: true, status: true } },
      incident: { select: { reference: true, permalink: true, locationType: true, evidenceSnapshot: true } },
      participants: true,
      messages: { orderBy: { createdAt: "asc" } }
    }
  });
  if (!dispute) return null;
  return {
    ...dispute,
    createdAt: dispute.createdAt.toISOString(),
    updatedAt: dispute.updatedAt.toISOString(),
    resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
    messages: dispute.messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })),
    participants: dispute.participants.map((participant) => ({
      ...participant,
      createdAt: participant.createdAt.toISOString(),
      selectedResolvedAt: participant.selectedResolvedAt?.toISOString() ?? null
    })),
    canModerate: access.moderator,
    isParticipant: access.participant
  };
}
