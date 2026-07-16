import {
  ConductIncidentSource,
  ConductIncidentStatus,
  ConductLocationType,
  ConductReportStatus,
  ConductReportType,
  GroupMemberRole,
  Prisma,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { asJson, createConductReference } from "@/modules/conduct-reporting/references";
import { resolveConductContentForViewer } from "@/modules/conduct-reporting/source-resolver";
import {
  CONDUCT_COMMENDATION_CATEGORIES,
  CONDUCT_REPORT_REASONS
} from "@/modules/conduct-reporting/policy";

type ManualReportInput = {
  locationType: ConductLocationType;
  contentId: string;
  reasonCode: string;
  context?: string | null;
};

type CommendationInput = {
  locationType: ConductLocationType;
  contentId: string;
  category: string;
  note?: string | null;
};

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\r\n/g, "\n").slice(0, maxLength);
}

function cleanEnumValue<T extends readonly string[]>(value: unknown, allowed: T) {
  const clean = cleanText(value, 80);
  return (allowed as readonly string[]).includes(clean) ? clean : "";
}

async function moderationRecipients(transaction: Prisma.TransactionClient, groupId: string | null) {
  const admins = await transaction.user.findMany({
    where: { role: { in: [UserRole.ADMIN, UserRole.GOD] }, deactivatedAt: null },
    select: { id: true }
  });
  if (!groupId) return admins.map((admin) => admin.id);
  const groupModerators = await transaction.groupMember.findMany({
    where: { groupId, role: { in: [GroupMemberRole.MODERATOR, GroupMemberRole.OWNER] } },
    select: { userId: true }
  });
  return Array.from(new Set([...admins.map((admin) => admin.id), ...groupModerators.map((member) => member.userId)]));
}

async function createIncidentIfMissing(
  transaction: Prisma.TransactionClient,
  input: Awaited<ReturnType<typeof resolveConductContentForViewer>> & {},
  actorUserId: string,
  source: ConductIncidentSource
) {
  if (!input) throw new Error("Conduct source is required.");
  const existing = await transaction.conductIncident.findUnique({ where: { fingerprint: input.fingerprint } });
  if (existing) return existing;
  return transaction.conductIncident.create({
    data: {
      reference: createConductReference("INC"),
      source,
      locationType: input.locationType,
      groupId: input.groupId,
      subjectContentId: input.contentId,
      subjectAuthorUserId: input.authorUserId,
      permalink: input.permalink,
      fingerprint: input.fingerprint,
      evidenceSnapshot: asJson(input.evidenceSnapshot),
      evidenceHashes: asJson([input.evidenceHash]),
      evidenceContentIds: [input.contentId],
      policyCodes: [],
      createdByUserId: actorUserId
    }
  });
}

async function createConductNotification(
  transaction: Prisma.TransactionClient,
  input: { userId: string; title: string; body: string; href: string }
) {
  await transaction.notification.create({ data: input });
}

export async function submitManualConductReport(reporterUserId: string, input: ManualReportInput) {
  const reasonCode = cleanEnumValue(input.reasonCode, CONDUCT_REPORT_REASONS);
  const context = cleanText(input.context, 2000) || null;
  if (!reasonCode) return { ok: false as const, error: "Choose a valid report reason." };

  const source = await resolveConductContentForViewer(reporterUserId, input.locationType, input.contentId);
  if (!source) return { ok: false as const, error: "That public or group item is not available to report." };
  if (source.authorUserId === reporterUserId) {
    return { ok: false as const, error: "You cannot report your own item through this form." };
  }

  return prisma.$transaction(async (transaction) => {
    const incident = await createIncidentIfMissing(transaction, source, reporterUserId, ConductIncidentSource.MEMBER_REPORT);
    const duplicate = await transaction.conductReport.findFirst({
      where: { incidentId: incident.id, reporterUserId }
    });
    if (duplicate) {
      return { ok: false as const, error: `You already submitted report ${duplicate.reference} for this item.` };
    }

    const report = await transaction.conductReport.create({
      data: {
        reference: createConductReference("RPT"),
        incidentId: incident.id,
        reportedUserId: source.authorUserId,
        reporterUserId,
        type: ConductReportType.MANUAL,
        reasonCode,
        context,
        policyCodes: [],
        evidenceContentIds: [source.contentId]
      }
    });

    await transaction.conductEvent.create({
      data: {
        incidentId: incident.id,
        reportId: report.id,
        actorUserId: reporterUserId,
        type: "REPORT_SUBMITTED",
        metadata: asJson({ reasonCode, locationType: source.locationType, contentId: source.contentId })
      }
    });
    await createConductNotification(transaction, {
      userId: reporterUserId,
      title: "Report received",
      body: `${report.reference} was added to the moderation queue. A report is not a finding.`,
      href: `/settings/reports?report=${encodeURIComponent(report.reference)}`
    });
    await createConductNotification(transaction, {
      userId: source.authorUserId,
      title: "A conduct report concerns your account",
      body: `${report.reference} is available in Reports and Commendations. You may review it and open a dispute.`,
      href: `/settings/reports?report=${encodeURIComponent(report.reference)}`
    });

    const recipients = (await moderationRecipients(transaction, source.groupId)).filter(
      (userId) => userId !== reporterUserId && userId !== source.authorUserId
    );
    if (recipients.length) {
      await transaction.alert.createMany({
        data: recipients.map((userId) => ({
          userId,
          title: "Conduct report needs review",
          body: `${report.reference} concerns ${source.locationType.toLowerCase().replace(/_/g, " ")}.`,
          href: `/admin/actions/conduct-review?candidate=${encodeURIComponent(incident.reference)}`
        }))
      });
    }

    await transaction.auditLog.create({
      data: {
        actorUserId: reporterUserId,
        module: "conduct-reporting",
        action: "manual_report_submitted",
        targetType: "ConductReport",
        targetId: report.id,
        metadata: asJson({ reference: report.reference, incidentReference: incident.reference })
      }
    });

    return { ok: true as const, reportReference: report.reference, incidentReference: incident.reference };
  });
}

export async function submitConductCommendation(submittingUserId: string, input: CommendationInput) {
  const category = cleanEnumValue(input.category, CONDUCT_COMMENDATION_CATEGORIES);
  const note = cleanText(input.note, 1000) || null;
  if (!category) return { ok: false as const, error: "Choose a valid commendation category." };

  const source = await resolveConductContentForViewer(submittingUserId, input.locationType, input.contentId);
  if (!source) return { ok: false as const, error: "That public or group item is not available to commend." };
  if (source.authorUserId === submittingUserId) {
    return { ok: false as const, error: "You cannot commend your own item." };
  }

  return prisma.$transaction(async (transaction) => {
    const duplicate = await transaction.conductCommendation.findUnique({
      where: { contentId_submittingUserId: { contentId: source.contentId, submittingUserId } }
    });
    if (duplicate) {
      return { ok: false as const, error: `You already commended this item as ${duplicate.reference}.` };
    }
    const commendation = await transaction.conductCommendation.create({
      data: {
        reference: createConductReference("COM"),
        locationType: source.locationType,
        groupId: source.groupId,
        contentId: source.contentId,
        permalink: source.permalink,
        commendedUserId: source.authorUserId,
        submittingUserId,
        category,
        note,
        evidenceHash: source.evidenceHash
      }
    });
    await createConductNotification(transaction, {
      userId: source.authorUserId,
      title: "You received a commendation",
      body: `${commendation.reference}: ${category.replace(/_/g, " ")}.`,
      href: `/settings/reports?commendation=${encodeURIComponent(commendation.reference)}`
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: submittingUserId,
        module: "conduct-reporting",
        action: "commendation_submitted",
        targetType: "ConductCommendation",
        targetId: commendation.id,
        metadata: asJson({ reference: commendation.reference, category })
      }
    });
    return { ok: true as const, commendationReference: commendation.reference };
  });
}

export async function getConductFolder(userId: string) {
  const [receivedReports, submittedReports, commendations, restrictions] = await Promise.all([
    prisma.conductReport.findMany({
      where: { reportedUserId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        incident: { select: { reference: true, locationType: true, permalink: true, status: true, createdAt: true } },
        dispute: { select: { reference: true, status: true, createdAt: true, resolvedAt: true } }
      },
      take: 100
    }),
    prisma.conductReport.findMany({
      where: { reporterUserId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        incident: { select: { reference: true, locationType: true, permalink: true, status: true, createdAt: true } }
      },
      take: 100
    }),
    prisma.conductCommendation.findMany({
      where: { commendedUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.conductRestriction.findMany({
      where: { active: true, restrictedUntil: { gt: new Date() }, OR: [{ userLowId: userId }, { userHighId: userId }] },
      orderBy: { restrictedUntil: "desc" }
    })
  ]);

  return {
    receivedReports: receivedReports.map((report) => ({
      reference: report.reference,
      reasonCode: report.reasonCode,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      incident: { ...report.incident, createdAt: report.incident.createdAt.toISOString() },
      dispute: report.dispute
        ? {
            ...report.dispute,
            createdAt: report.dispute.createdAt.toISOString(),
            resolvedAt: report.dispute.resolvedAt?.toISOString() ?? null
          }
        : null
    })),
    submittedReports: submittedReports.map((report) => ({
      reference: report.reference,
      reasonCode: report.reasonCode,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      incident: { ...report.incident, createdAt: report.incident.createdAt.toISOString() }
    })),
    commendations: commendations.map((item) => ({
      reference: item.reference,
      category: item.category,
      note: item.note,
      permalink: item.permalink,
      status: item.status,
      createdAt: item.createdAt.toISOString()
    })),
    restrictions: restrictions.map((item) => ({
      reference: item.reference,
      otherUserId: item.userLowId === userId ? item.userHighId : item.userLowId,
      levelDays: item.levelDays,
      restrictedUntil: item.restrictedUntil.toISOString()
    }))
  };
}

export async function updateConductReportStatus(
  reportId: string,
  status: ConductReportStatus,
  actorUserId: string,
  reason: string
) {
  return prisma.$transaction(async (transaction) => {
    const report = await transaction.conductReport.update({
      where: { id: reportId },
      data: {
        status,
        resolvedAt:
          status === ConductReportStatus.RESOLVED || status === ConductReportStatus.DISMISSED ? new Date() : null,
        incident: { update: { status: status as unknown as ConductIncidentStatus } }
      }
    });
    await transaction.conductEvent.create({
      data: { reportId, incidentId: report.incidentId, actorUserId, type: `REPORT_${status}`, metadata: asJson({ reason }) }
    });
    return report;
  });
}
