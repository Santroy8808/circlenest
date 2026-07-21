import {
  ConductIncidentSource,
  ConductLocationType,
  ConductReportStatus,
  ConductReportType,
  GroupMemberRole,
  Prisma,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { asJson, createConductReference } from "@/modules/conduct-reporting/references";
import {
  deriveConductIncidentStatus,
  recomputeLockedConductIncidentStatus
} from "@/modules/conduct-reporting/incident-status.service";
import {
  resolveConductContentForViewer,
  type ConductContentSource
} from "@/modules/conduct-reporting/source-resolver";
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

async function moderationRecipientCandidates(transaction: Prisma.TransactionClient, groupId: string | null) {
  const admins = await transaction.user.findMany({
    where: { role: { in: [UserRole.ADMIN, UserRole.GOD] } },
    select: { id: true }
  });
  if (!groupId) {
    return { adminUserIds: admins.map((admin) => admin.id), groupModeratorUserIds: [] as string[] };
  }
  const groupModerators = await transaction.groupMember.findMany({
    where: { groupId, role: { in: [GroupMemberRole.MODERATOR, GroupMemberRole.OWNER] } },
    select: { userId: true }
  });
  return {
    adminUserIds: admins.map((admin) => admin.id),
    groupModeratorUserIds: groupModerators.map((member) => member.userId)
  };
}

type LockedConductNotificationUser = { id: string; role: UserRole; deactivatedAt: Date | null };
type LockedConductModerationMembership = { userId: string; role: GroupMemberRole };

export function orderedConductNotificationUserIds(userIds: readonly (string | null | undefined)[]) {
  return [...new Set(userIds.filter((value): value is string => Boolean(value?.trim())))].sort();
}

export async function lockConductNotificationUsers(
  transaction: Prisma.TransactionClient,
  userIds: readonly (string | null | undefined)[]
) {
  const orderedIds = orderedConductNotificationUserIds(userIds);
  if (orderedIds.length === 0) return [];
  return transaction.$queryRaw<LockedConductNotificationUser[]>(Prisma.sql`
    SELECT "id", "role", "deactivatedAt"
    FROM "User"
    WHERE "id" IN (${Prisma.join(orderedIds)})
    ORDER BY "id"
    FOR SHARE
  `);
}

export async function lockConductModerationMemberships(
  transaction: Prisma.TransactionClient,
  groupId: string | null,
  userIds: readonly string[]
) {
  const orderedIds = orderedConductNotificationUserIds(userIds);
  if (!groupId || orderedIds.length === 0) return [];
  return transaction.$queryRaw<LockedConductModerationMembership[]>(Prisma.sql`
    SELECT "userId", "role"
    FROM "GroupMember"
    WHERE "groupId" = ${groupId} AND "userId" IN (${Prisma.join(orderedIds)})
    ORDER BY "userId"
    FOR SHARE
  `);
}

export function eligibleLockedConductModerationRecipients(input: {
  candidateUserIds: readonly string[];
  excludedUserIds: readonly string[];
  users: readonly LockedConductNotificationUser[];
  memberships: readonly LockedConductModerationMembership[];
}) {
  const excluded = new Set(input.excludedUserIds);
  const memberships = new Map(input.memberships.map((membership) => [membership.userId, membership.role]));
  return orderedConductNotificationUserIds(input.candidateUserIds).filter((userId) => {
    if (excluded.has(userId)) return false;
    const user = input.users.find((candidate) => candidate.id === userId);
    if (!user || user.deactivatedAt) return false;
    if (user.role === UserRole.ADMIN || user.role === UserRole.GOD) return true;
    const membership = memberships.get(userId);
    return membership === GroupMemberRole.MODERATOR || membership === GroupMemberRole.OWNER;
  });
}

export async function lockAndRevalidateConductModerationRecipients(
  transaction: Prisma.TransactionClient,
  input: {
    reporterUserId: string;
    authorUserId: string;
    groupId: string | null;
    adminUserIds: readonly string[];
    groupModeratorUserIds: readonly string[];
  }
) {
  const candidateUserIds = orderedConductNotificationUserIds([
    ...input.adminUserIds,
    ...input.groupModeratorUserIds
  ]);
  const users = await lockConductNotificationUsers(transaction, [
    input.reporterUserId,
    input.authorUserId,
    ...candidateUserIds
  ]);
  const memberships = await lockConductModerationMemberships(
    transaction,
    input.groupId,
    input.groupModeratorUserIds
  );
  return eligibleLockedConductModerationRecipients({
    candidateUserIds,
    excludedUserIds: [input.reporterUserId, input.authorUserId],
    users,
    memberships
  });
}

export async function retryConductReportCreation<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  const attempts = Math.min(Math.max(maxAttempts, 1), 5);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
      if ((code !== "P2034" && code !== "P2002") || attempt === attempts) throw error;
    }
  }
  throw new Error("Conduct report creation retry loop ended unexpectedly.");
}

export function conductReportCreationConcurrencyMessage(error: unknown) {
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
  return code === "P2034" || code === "P2002"
    ? "The report queue changed while your report was being submitted. Refresh the item and try again."
    : null;
}

export const CONDUCT_REPORT_TRANSACTION_OPTIONS = Object.freeze({
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable
});

async function lockOrCreateConductIncident(
  transaction: Prisma.TransactionClient,
  input: ConductContentSource,
  actorUserId: string,
  source: ConductIncidentSource
) {
  const locked = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ConductIncident"
    WHERE "fingerprint" = ${input.fingerprint}
    FOR UPDATE
  `);
  if (locked[0]) {
    const incident = await transaction.conductIncident.findUnique({ where: { id: locked[0].id } });
    if (!incident) throw new Error("The locked conduct incident is no longer available.");
    return { incident, isNew: false as const };
  }
  const incident = await transaction.conductIncident.create({
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
      status: deriveConductIncidentStatus([ConductReportStatus.ACTIVE]),
      createdByUserId: actorUserId
    }
  });
  return { incident, isNew: true as const };
}

export async function createManualConductReportRecord(
  transaction: Prisma.TransactionClient,
  input: {
    source: ConductContentSource;
    reporterUserId: string;
    reasonCode: string;
    context: string | null;
  }
) {
  const incidentResult = await lockOrCreateConductIncident(
    transaction,
    input.source,
    input.reporterUserId,
    ConductIncidentSource.MEMBER_REPORT
  );
  const duplicate = await transaction.conductReport.findFirst({
    where: { incidentId: incidentResult.incident.id, reporterUserId: input.reporterUserId }
  });
  if (duplicate) {
    return { created: false as const, duplicate };
  }

  const report = await transaction.conductReport.create({
    data: {
      reference: createConductReference("RPT"),
      incidentId: incidentResult.incident.id,
      reportedUserId: input.source.authorUserId,
      reporterUserId: input.reporterUserId,
      type: ConductReportType.MANUAL,
      status: ConductReportStatus.ACTIVE,
      reasonCode: input.reasonCode,
      context: input.context,
      policyCodes: [],
      evidenceContentIds: [input.source.contentId]
    }
  });

  const incident = incidentResult.isNew
    ? incidentResult.incident
    : await recomputeLockedConductIncidentStatus(transaction, incidentResult.incident.id);
  return { created: true as const, incident, report };
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

  try {
    return await retryConductReportCreation(() => prisma.$transaction(async (transaction) => {
      const candidates = await moderationRecipientCandidates(transaction, source.groupId);
      const recipients = await lockAndRevalidateConductModerationRecipients(transaction, {
        reporterUserId,
        authorUserId: source.authorUserId,
        groupId: source.groupId,
        ...candidates
      });
      const creation = await createManualConductReportRecord(transaction, {
        source,
        reporterUserId,
        reasonCode,
        context
      });
      if (!creation.created) {
        return { ok: false as const, error: `You already submitted report ${creation.duplicate.reference} for this item.` };
      }
      const { incident, report } = creation;

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
    }, CONDUCT_REPORT_TRANSACTION_OPTIONS));
  } catch (error) {
    const concurrencyMessage = conductReportCreationConcurrencyMessage(error);
    if (concurrencyMessage) return { ok: false as const, error: concurrencyMessage };
    throw error;
  }
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
