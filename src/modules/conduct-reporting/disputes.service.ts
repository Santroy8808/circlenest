import { ConductDisputeStatus, ConductIncidentStatus, ConductReportStatus } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
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

export async function openConductDispute(userId: string, reportReference: string, openingStatement?: unknown) {
  const report = await prisma.conductReport.findUnique({
    where: { reference: reportReference.trim().toUpperCase() },
    include: { incident: true, dispute: true }
  });
  if (!report || report.reportedUserId !== userId) {
    return { ok: false as const, error: "That report is not available for dispute." };
  }
  if (report.dispute) {
    return { ok: true as const, disputeReference: report.dispute.reference, existing: true as const };
  }
  if (report.status === ConductReportStatus.RESOLVED || report.status === ConductReportStatus.DISMISSED) {
    return { ok: false as const, error: "That report is already closed." };
  }
  const statement = cleanText(openingStatement, 5000);

  return prisma.$transaction(async (transaction) => {
    const dispute = await transaction.conductDispute.create({
      data: {
        reference: createConductReference("DSP"),
        reportId: report.id,
        incidentId: report.incidentId,
        openedByUserId: userId,
        participants: {
          create: Array.from(new Set([userId, report.reporterUserId].filter((value): value is string => Boolean(value)))).map(
            (participantUserId) => ({ userId: participantUserId, required: true })
          )
        },
        ...(statement
          ? { messages: { create: { authorUserId: userId, body: statement } } }
          : {})
      }
    });
    await transaction.conductReport.update({ where: { id: report.id }, data: { status: ConductReportStatus.DISPUTED } });
    await transaction.conductIncident.update({
      where: { id: report.incidentId },
      data: { status: ConductIncidentStatus.DISPUTED }
    });
    await transaction.conductEvent.create({
      data: {
        incidentId: report.incidentId,
        reportId: report.id,
        disputeId: dispute.id,
        actorUserId: userId,
        type: "DISPUTE_OPENED",
        metadata: asJson({ openingStatementIncluded: Boolean(statement) })
      }
    });
    if (report.reporterUserId && report.reporterUserId !== userId) {
      await transaction.notification.create({
        data: {
          userId: report.reporterUserId,
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
  const access = await loadDisputeAccess(userId, disputeReference);
  if (!access || access.dispute.status !== ConductDisputeStatus.OPEN) {
    return { ok: false as const, error: "That open dispute is not available to you." };
  }
  const body = cleanText(bodyInput, 5000);
  const linkedContentUrl = cleanLinkedContentUrl(linkedContentUrlInput);
  if (body.length < 2) return { ok: false as const, error: "Enter a statement before submitting." };

  return prisma.$transaction(async (transaction) => {
    const message = await transaction.conductDisputeMessage.create({
      data: { disputeId: access.dispute.id, authorUserId: userId, body, linkedContentUrl }
    });
    await transaction.conductDisputeParticipant.updateMany({
      where: { disputeId: access.dispute.id, userId },
      data: { selectedResolvedAt: null }
    });
    await transaction.conductEvent.create({
      data: {
        incidentId: access.dispute.incidentId,
        reportId: access.dispute.reportId,
        disputeId: access.dispute.id,
        actorUserId: userId,
        type: "DISPUTE_STATEMENT_ADDED",
        metadata: asJson({ messageId: message.id, linkedContentUrl })
      }
    });
    return { ok: true as const, messageId: message.id };
  });
}

export async function selectConductDisputeResolved(userId: string, disputeReference: string) {
  const access = await loadDisputeAccess(userId, disputeReference);
  if (!access?.participant || access.dispute.status !== ConductDisputeStatus.OPEN) {
    return { ok: false as const, error: "You are not a participant in that open dispute." };
  }

  return prisma.$transaction(async (transaction) => {
    await transaction.conductDisputeParticipant.update({
      where: { disputeId_userId: { disputeId: access.dispute.id, userId } },
      data: { selectedResolvedAt: new Date() }
    });
    const participants = await transaction.conductDisputeParticipant.findMany({
      where: { disputeId: access.dispute.id, required: true },
      select: { selectedResolvedAt: true }
    });
    const fullyResolved = participants.length > 0 && participants.every((participant) => participant.selectedResolvedAt);
    if (fullyResolved) {
      const now = new Date();
      await transaction.conductDispute.update({
        where: { id: access.dispute.id },
        data: { status: ConductDisputeStatus.RESOLVED, resolvedAt: now }
      });
      await transaction.conductReport.update({
        where: { id: access.dispute.reportId },
        data: { status: ConductReportStatus.RESOLVED, resolvedAt: now }
      });
      await transaction.conductIncident.update({
        where: { id: access.dispute.incidentId },
        data: { status: ConductIncidentStatus.RESOLVED }
      });
    }
    await transaction.conductEvent.create({
      data: {
        incidentId: access.dispute.incidentId,
        reportId: access.dispute.reportId,
        disputeId: access.dispute.id,
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
  const access = await loadDisputeAccess(moderatorUserId, disputeReference);
  if (!access?.moderator || access.dispute.status !== ConductDisputeStatus.OPEN) {
    return { ok: false as const, error: "Moderator access to that open dispute is required." };
  }
  const reason = cleanText(reasonInput, 2000);
  if (reason.length < 10) return { ok: false as const, error: "Enter a specific override reason." };
  const disputeStatus = outcome === "RESOLVED" ? ConductDisputeStatus.RESOLVED : ConductDisputeStatus.DISMISSED;
  const reportStatus = outcome === "RESOLVED" ? ConductReportStatus.RESOLVED : ConductReportStatus.DISMISSED;
  const incidentStatus = outcome === "RESOLVED" ? ConductIncidentStatus.RESOLVED : ConductIncidentStatus.DISMISSED;

  await prisma.$transaction(async (transaction) => {
    const now = new Date();
    await transaction.conductDispute.update({
      where: { id: access.dispute.id },
      data: {
        status: disputeStatus,
        resolvedAt: now,
        overrideByUserId: moderatorUserId,
        overrideReason: reason
      }
    });
    await transaction.conductReport.update({
      where: { id: access.dispute.reportId },
      data: { status: reportStatus, resolvedAt: now }
    });
    await transaction.conductIncident.update({
      where: { id: access.dispute.incidentId },
      data: { status: incidentStatus }
    });
    await transaction.conductEvent.create({
      data: {
        incidentId: access.dispute.incidentId,
        reportId: access.dispute.reportId,
        disputeId: access.dispute.id,
        actorUserId: moderatorUserId,
        type: `DISPUTE_MODERATOR_OVERRIDE_${outcome}`,
        metadata: asJson({ reason })
      }
    });
  });
  return { ok: true as const };
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
