import {
  ConductIncidentSource,
  ConductLocationType,
  ConductReportStatus,
  ConductReportType,
  ConductReviewStatus,
  GroupMemberRole,
  Prisma,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { canModerateConductLocation } from "@/modules/conduct-reporting/permissions";
import { asJson, createConductFingerprint, createConductReference } from "@/modules/conduct-reporting/references";
import {
  CONDUCT_REPORT_TRANSACTION_OPTIONS,
  retryConductReportCreation
} from "@/modules/conduct-reporting/conduct-reporting.service";
import {
  deriveConductIncidentStatus,
  recomputeLockedConductIncidentStatus
} from "@/modules/conduct-reporting/incident-status.service";
import { applyPairwiseConductRestriction, CONDUCT_RESTRICTION_DAYS } from "@/modules/conduct-reporting/restrictions.service";
import { getConductConfig } from "@/modules/conduct-reporting/scanner.service";

type ConductConfigPatch = {
  manualEnabled?: boolean;
  automaticEnabled?: boolean;
  scheduledEnabled?: boolean;
  scannerEnabled?: boolean;
  shadowMode?: boolean;
  createAutomatedReports?: boolean;
  sendAutomatedWarnings?: boolean;
  applyAutomatedRestrictions?: boolean;
  timezone?: string;
  scheduleLocalTime?: string;
  automaticIntervalMinutes?: number;
  maxItemsPerRun?: number;
  maxItemsPerDay?: number;
  maxBackfillDays?: number;
  contextBefore?: number;
  contextAfter?: number;
  primaryModel?: string;
  fallbackModel?: string;
  providerCallBudget?: number;
  tokenBudget?: number;
  estimatedCostBudgetUsd?: number;
  reviewThreshold?: number;
  restrictionDecayDays?: number;
  triggerDictionary?: Prisma.InputJsonValue | null;
  policyVersion?: string;
};

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function updateConductConfig(actorUserId: string, patch: ConductConfigPatch) {
  const current = await getConductConfig();
  const timezone = typeof patch.timezone === "string" && validTimezone(patch.timezone.trim()) ? patch.timezone.trim() : current.timezone;
  const scheduleLocalTime = typeof patch.scheduleLocalTime === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(patch.scheduleLocalTime)
    ? patch.scheduleLocalTime
    : current.scheduleLocalTime;
  const modelName = (value: unknown, fallback: string) =>
    typeof value === "string" && /^[a-z0-9._-]{2,100}$/i.test(value.trim()) ? value.trim() : fallback;
  const policyVersion = typeof patch.policyVersion === "string" && /^[a-z0-9._-]{2,80}$/i.test(patch.policyVersion.trim())
    ? patch.policyVersion.trim()
    : current.policyVersion;

  const data = {
    manualEnabled: patch.manualEnabled ?? current.manualEnabled,
    automaticEnabled: patch.automaticEnabled ?? current.automaticEnabled,
    scheduledEnabled: patch.scheduledEnabled ?? current.scheduledEnabled,
    scannerEnabled: patch.scannerEnabled ?? current.scannerEnabled,
    shadowMode: patch.shadowMode ?? current.shadowMode,
    createAutomatedReports: patch.createAutomatedReports ?? current.createAutomatedReports,
    sendAutomatedWarnings: patch.sendAutomatedWarnings ?? current.sendAutomatedWarnings,
    applyAutomatedRestrictions: patch.applyAutomatedRestrictions ?? current.applyAutomatedRestrictions,
    timezone,
    scheduleLocalTime,
    automaticIntervalMinutes: clampInteger(patch.automaticIntervalMinutes, 15, 10_080, current.automaticIntervalMinutes),
    maxItemsPerRun: clampInteger(patch.maxItemsPerRun, 10, 10_000, current.maxItemsPerRun),
    maxItemsPerDay: clampInteger(patch.maxItemsPerDay, 10, 50_000, current.maxItemsPerDay),
    maxBackfillDays: clampInteger(patch.maxBackfillDays, 1, 365, current.maxBackfillDays),
    contextBefore: clampInteger(patch.contextBefore, 0, 10, current.contextBefore),
    contextAfter: clampInteger(patch.contextAfter, 0, 10, current.contextAfter),
    primaryModel: modelName(patch.primaryModel, current.primaryModel),
    fallbackModel: modelName(patch.fallbackModel, current.fallbackModel),
    providerCallBudget: clampInteger(patch.providerCallBudget, 0, 10_000, current.providerCallBudget),
    tokenBudget: clampInteger(patch.tokenBudget, 0, 50_000_000, current.tokenBudget),
    estimatedCostBudgetUsd: clampNumber(patch.estimatedCostBudgetUsd, 0, 10_000, current.estimatedCostBudgetUsd),
    reviewThreshold: clampNumber(patch.reviewThreshold, 0, 1, current.reviewThreshold),
    restrictionDecayDays: clampInteger(patch.restrictionDecayDays, 1, 365, current.restrictionDecayDays),
    triggerDictionary: patch.triggerDictionary === null ? undefined : patch.triggerDictionary,
    policyVersion,
    updatedByUserId: actorUserId
  };
  const config = await prisma.conductConfig.update({ where: { id: "default" }, data });
  await prisma.auditLog.create({
    data: {
      actorUserId,
      module: "conduct-reporting",
      action: "configuration_updated",
      targetType: "ConductConfig",
      targetId: config.id,
      metadata: asJson({
        automaticEnabled: config.automaticEnabled,
        scheduledEnabled: config.scheduledEnabled,
        scannerEnabled: config.scannerEnabled,
        shadowMode: config.shadowMode,
        createAutomatedReports: config.createAutomatedReports,
        sendAutomatedWarnings: config.sendAutomatedWarnings,
        applyAutomatedRestrictions: config.applyAutomatedRestrictions
      })
    }
  });
  return config;
}

export type ConductAdminViewQuery = {
  take?: number;
  query?: string;
  status?: ConductReportStatus;
  assigneeUserId?: string | null;
};

function boundedAdminText(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}\u2026`;
}

function boundedEvidenceSummary(value: Prisma.JsonValue, maxLength = 6000) {
  try {
    return boundedAdminText(JSON.stringify(value, null, 2), maxLength);
  } catch {
    return "Context could not be displayed.";
  }
}

type RankedConductReportId = { id: string; relevance: number };

export const CONDUCT_ADMIN_VIEW_TRANSACTION_OPTIONS = Object.freeze({
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
});

function conductSearchNeedle(query: string) {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

function escapedConductSearchText(query: string) {
  return query.replace(/[\\%_]/g, "\\$&");
}

function relatedConductMemberMatches(needle: string) {
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "User" AS member
    LEFT JOIN "Profile" AS profile ON profile."userId" = member."id"
    WHERE member."id" IN (
      report."reportedUserId",
      report."reporterUserId",
      report."resolvedByUserId",
      incident."subjectAuthorUserId",
      incident."assignedModeratorUserId"
    )
    AND (
      member."username" ILIKE ${needle} ESCAPE '\\'
      OR profile."displayName" ILIKE ${needle} ESCAPE '\\'
    )
  )`;
}

export function buildRankedConductReportQuery(input: {
  take: number;
  query: string;
  status?: ConductReportStatus;
  assigneeUserId?: string | null;
}) {
  const enumNeedle = input.query.toUpperCase().replace(/[\s-]+/g, "_");
  const matchingType = Object.values(ConductReportType).find((candidate) => candidate === enumNeedle);
  const matchingSource = Object.values(ConductIncidentSource).find((candidate) => candidate === enumNeedle);
  const matchingLocation = Object.values(ConductLocationType).find((candidate) => candidate === enumNeedle);
  const textNeedle = conductSearchNeedle(input.query);
  const exactNeedle = escapedConductSearchText(input.query);
  const prefixNeedle = `${exactNeedle}%`;
  const filters: Prisma.Sql[] = [];

  if (input.status) {
    filters.push(Prisma.sql`report."status"::text = ${input.status}`);
  }
  if (input.assigneeUserId !== undefined) {
    filters.push(input.assigneeUserId === null
      ? Prisma.sql`incident."assignedModeratorUserId" IS NULL`
      : Prisma.sql`incident."assignedModeratorUserId" = ${input.assigneeUserId}`);
  }

  filters.push(Prisma.sql`(
    report."reference" ILIKE ${textNeedle} ESCAPE '\\'
    OR report."reasonCode" ILIKE ${textNeedle} ESCAPE '\\'
    OR report."context" ILIKE ${textNeedle} ESCAPE '\\'
    OR report."resolutionReason" ILIKE ${textNeedle} ESCAPE '\\'
    OR ${input.query} = ANY(report."policyCodes")
    OR incident."reference" ILIKE ${textNeedle} ESCAPE '\\'
    OR incident."subjectContentId" ILIKE ${textNeedle} ESCAPE '\\'
    OR incident."permalink" ILIKE ${textNeedle} ESCAPE '\\'
    OR ${input.query} = ANY(incident."policyCodes")
    ${matchingType ? Prisma.sql`OR report."type"::text = ${matchingType}` : Prisma.empty}
    ${matchingSource ? Prisma.sql`OR incident."source"::text = ${matchingSource}` : Prisma.empty}
    ${matchingLocation ? Prisma.sql`OR incident."locationType"::text = ${matchingLocation}` : Prisma.empty}
    OR ${relatedConductMemberMatches(textNeedle)}
  )`);

  return Prisma.sql`
    SELECT report."id",
      CASE
        WHEN report."reference" ILIKE ${exactNeedle} ESCAPE '\\'
          OR incident."reference" ILIKE ${exactNeedle} ESCAPE '\\' THEN 0
        WHEN report."reference" ILIKE ${prefixNeedle} ESCAPE '\\'
          OR incident."reference" ILIKE ${prefixNeedle} ESCAPE '\\' THEN 1
        WHEN ${relatedConductMemberMatches(exactNeedle)} THEN 2
        WHEN ${relatedConductMemberMatches(prefixNeedle)} THEN 3
        ELSE 4
      END AS "relevance"
    FROM "ConductReport" AS report
    INNER JOIN "ConductIncident" AS incident ON incident."id" = report."incidentId"
    WHERE ${Prisma.join(filters, " AND ")}
    ORDER BY "relevance" ASC, report."updatedAt" DESC, report."id" DESC
    LIMIT ${input.take}
  `;
}

export async function getConductAdminView(options: ConductAdminViewQuery = {}) {
  const take = clampInteger(options.take, 1, 100, 100);
  const query = boundedAdminText(options.query, 120);
  const reportWhere: Prisma.ConductReportWhereInput = {
    ...(options.status ? { status: options.status } : {}),
    ...(options.assigneeUserId !== undefined
      ? { incident: { assignedModeratorUserId: options.assigneeUserId } }
      : {})
  };

  const { reports, activeAssignees, members } = await prisma.$transaction(async (transaction) => {
    const rankedReportIds = query
      ? await transaction.$queryRaw<RankedConductReportId[]>(buildRankedConductReportQuery({
          take,
          query,
          status: options.status,
          assigneeUserId: options.assigneeUserId
        }))
      : null;
    const rankedReportIdOrder = rankedReportIds
      ? new Map(rankedReportIds.map((report, index) => [report.id, index]))
      : null;
    const reports = await transaction.conductReport.findMany({
      where: rankedReportIds
        ? { ...reportWhere, id: { in: rankedReportIds.map((report) => report.id) } }
        : reportWhere,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take,
      include: {
        incident: {
          select: {
            id: true,
            reference: true,
            status: true,
            version: true,
            source: true,
            locationType: true,
            subjectContentId: true,
            subjectAuthorUserId: true,
            permalink: true,
            evidenceSnapshot: true,
            policyCodes: true,
            assignedModeratorUserId: true,
            createdAt: true,
            updatedAt: true
          }
        },
        dispute: { select: { reference: true, status: true } }
      }
    });
    if (rankedReportIdOrder) {
      reports.sort((left, right) =>
        (rankedReportIdOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER)
        - (rankedReportIdOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER));
    }

    const activeAssignees = await transaction.user.findMany({
      where: {
        deactivatedAt: null,
        role: { in: [UserRole.ADMIN, UserRole.GOD] }
      },
      orderBy: { username: "asc" },
      take: 1000,
      select: { id: true, username: true, role: true, profile: { select: { displayName: true } } }
    });
    const memberIds = new Set<string>();
    for (const report of reports) {
      memberIds.add(report.reportedUserId);
      if (report.reporterUserId) memberIds.add(report.reporterUserId);
      memberIds.add(report.incident.subjectAuthorUserId);
      if (report.incident.assignedModeratorUserId) memberIds.add(report.incident.assignedModeratorUserId);
      if (report.resolvedByUserId) memberIds.add(report.resolvedByUserId);
    }
    for (const assignee of activeAssignees) memberIds.add(assignee.id);
    const members = memberIds.size === 0
      ? []
      : await transaction.user.findMany({
          where: { id: { in: [...memberIds] } },
          select: { id: true, username: true, profile: { select: { displayName: true } } }
        });
    return { reports, activeAssignees, members };
  }, CONDUCT_ADMIN_VIEW_TRANSACTION_OPTIONS);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const memberView = (userId: string) => {
    const member = memberById.get(userId);
    if (!member) return { id: userId, username: null, label: "Unavailable member" };
    const displayName = member.profile?.displayName?.trim();
    return {
      id: member.id,
      username: member.username,
      label: displayName ? `${displayName} (@${member.username})` : `@${member.username}`
    };
  };

  return {
    generatedAt: new Date().toISOString(),
    reports: reports.map((report) => ({
      id: report.id,
      reference: report.reference,
      type: report.type,
      status: report.status,
      version: report.version,
      reasonCode: report.reasonCode,
      context: boundedAdminText(report.context, 4000),
      policyCodes: report.policyCodes.slice(0, 50),
      reportedMember: memberView(report.reportedUserId),
      reporterMember: report.reporterUserId ? memberView(report.reporterUserId) : null,
      resolvedByMember: report.resolvedByUserId ? memberView(report.resolvedByUserId) : null,
      resolutionReason: boundedAdminText(report.resolutionReason, 4000),
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
      dispute: report.dispute ? { reference: report.dispute.reference, status: report.dispute.status } : null,
      incident: {
        id: report.incident.id,
        reference: report.incident.reference,
        status: report.incident.status,
        version: report.incident.version,
        source: report.incident.source,
        locationType: report.incident.locationType,
        subjectContentId: report.incident.subjectContentId,
        subjectMember: memberView(report.incident.subjectAuthorUserId),
        permalink: report.incident.permalink,
        contextSummary: boundedEvidenceSummary(report.incident.evidenceSnapshot),
        policyCodes: report.incident.policyCodes.slice(0, 50),
        assignedModeratorUserId: report.incident.assignedModeratorUserId,
        assignedModerator: report.incident.assignedModeratorUserId
          ? memberView(report.incident.assignedModeratorUserId)
          : null,
        createdAt: report.incident.createdAt.toISOString(),
        updatedAt: report.incident.updatedAt.toISOString()
      }
    })),
    assignees: activeAssignees.map((assignee) => ({
      id: assignee.id,
      username: assignee.username,
      role: assignee.role === UserRole.GOD ? "GOD" as const : "ADMIN" as const,
      label: assignee.profile?.displayName?.trim()
        ? `${assignee.profile.displayName.trim()} (@${assignee.username})`
        : `@${assignee.username}`
    }))
  };
}

export class ConductCandidateOperationError extends Error {}

const MUTABLE_CONDUCT_CANDIDATE_STATUSES = new Set<ConductReviewStatus>([
  ConductReviewStatus.PENDING,
  ConductReviewStatus.ASSIGNED
]);

type ConductCandidateScope = {
  id: string;
  authorUserId: string;
  groupId: string | null;
  locationType: ConductLocationType;
};

type LockedConductCandidateUser = {
  id: string;
  role: UserRole;
  deactivatedAt: Date | null;
};

type LockedConductCandidateMembership = {
  userId: string;
  role: GroupMemberRole;
};

type ConductCandidateLockOptions = {
  assigneeUserId?: string | null;
  requireActiveSubject?: boolean;
};

export function orderedConductCandidateUserIds(userIds: readonly (string | null | undefined)[]) {
  return [...new Set(userIds.filter((value): value is string => Boolean(value?.trim())))].sort();
}

async function lockConductCandidateUsers(
  transaction: Prisma.TransactionClient,
  userIds: readonly (string | null | undefined)[]
) {
  const orderedIds = orderedConductCandidateUserIds(userIds);
  return transaction.$queryRaw<LockedConductCandidateUser[]>(Prisma.sql`
    SELECT "id", "role", "deactivatedAt"
    FROM "User"
    WHERE "id" IN (${Prisma.join(orderedIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

async function lockConductCandidateMemberships(
  transaction: Prisma.TransactionClient,
  candidate: ConductCandidateScope,
  userIds: readonly string[]
) {
  if (!candidate.groupId || !candidate.locationType.startsWith("GROUP_") || userIds.length === 0) {
    return [] satisfies LockedConductCandidateMembership[];
  }
  return transaction.$queryRaw<LockedConductCandidateMembership[]>(Prisma.sql`
    SELECT "userId", "role"
    FROM "GroupMember"
    WHERE "groupId" = ${candidate.groupId}
      AND "userId" IN (${Prisma.join(userIds)})
    ORDER BY "userId"
    FOR UPDATE
  `);
}

function activeLockedConductCandidateUser(users: readonly LockedConductCandidateUser[], userId: string) {
  const user = users.find((candidate) => candidate.id === userId);
  return user && !user.deactivatedAt ? user : null;
}

function lockedUserCanModerateCandidate(
  user: LockedConductCandidateUser,
  candidate: ConductCandidateScope,
  memberships: readonly LockedConductCandidateMembership[]
) {
  if (user.role === UserRole.ADMIN || user.role === UserRole.GOD) return true;
  if (!candidate.groupId || !candidate.locationType.startsWith("GROUP_")) return false;
  const membership = memberships.find((item) => item.userId === user.id);
  return membership?.role === GroupMemberRole.OWNER || membership?.role === GroupMemberRole.MODERATOR;
}

function sameConductCandidateScope(
  candidate: ConductCandidateScope,
  expected: ConductCandidateScope
) {
  return candidate.id === expected.id
    && candidate.authorUserId === expected.authorUserId
    && candidate.groupId === expected.groupId
    && candidate.locationType === expected.locationType;
}

export async function lockAndAuthorizeConductCandidate(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  expectedCandidate: ConductCandidateScope,
  options: ConductCandidateLockOptions = {}
) {
  const lockedUserIds = orderedConductCandidateUserIds([
    actorUserId,
    options.assigneeUserId,
    options.requireActiveSubject ? expectedCandidate.authorUserId : null
  ]);
  const users = await lockConductCandidateUsers(transaction, lockedUserIds);
  const actor = activeLockedConductCandidateUser(users, actorUserId);
  if (!actor) {
    throw new ConductCandidateOperationError("That review candidate is not available.");
  }

  const memberships = await lockConductCandidateMemberships(
    transaction,
    expectedCandidate,
    lockedUserIds
  );
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "ConductReviewCandidate"
    WHERE "id" = ${expectedCandidate.id}
    FOR UPDATE
  `);
  const candidate = await transaction.conductReviewCandidate.findUnique({ where: { id: expectedCandidate.id } });
  if (!candidate || !sameConductCandidateScope(candidate, expectedCandidate)) {
    throw new ConductCandidateOperationError("That review candidate changed. Refresh it and try again.");
  }
  if (!lockedUserCanModerateCandidate(actor, candidate, memberships)) {
    throw new ConductCandidateOperationError("That review candidate is not available.");
  }

  if (options.requireActiveSubject && !activeLockedConductCandidateUser(users, candidate.authorUserId)) {
    throw new ConductCandidateOperationError("The account named by that review candidate is no longer active.");
  }
  if (options.assigneeUserId) {
    const assignee = activeLockedConductCandidateUser(users, options.assigneeUserId);
    if (!assignee || !lockedUserCanModerateCandidate(assignee, candidate, memberships)) {
      throw new ConductCandidateOperationError(
        "Assign this review only to an active administrator or a qualified moderator for this group."
      );
    }
  }
  return candidate;
}

function assertMutableConductCandidate(status: ConductReviewStatus) {
  if (!MUTABLE_CONDUCT_CANDIDATE_STATUSES.has(status)) {
    throw new ConductCandidateOperationError("That review candidate has already been completed.");
  }
}

export function candidateOperationFailure(error: unknown) {
  if (error instanceof ConductCandidateOperationError) {
    return { ok: false as const, error: error.message };
  }
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
  if (code === "P2034" || code === "P2002") {
    return {
      ok: false as const,
      error: "The review candidate changed while this request was being applied. Refresh it and try again."
    };
  }
  throw error;
}

export async function assignConductCandidate(actorUserId: string, candidateReference: string, moderatorUserId: string | null) {
  const candidate = await prisma.conductReviewCandidate.findUnique({ where: { reference: candidateReference.trim().toUpperCase() } });
  if (!candidate) {
    return { ok: false as const, error: "That review candidate is not available." };
  }
  try {
    const updated = await retryConductReportCreation(() => prisma.$transaction(async (transaction) => {
      const locked = await lockAndAuthorizeConductCandidate(transaction, actorUserId, candidate, {
        assigneeUserId: moderatorUserId
      });
      assertMutableConductCandidate(locked.status);
      return transaction.conductReviewCandidate.update({
        where: { id: locked.id },
        data: {
          assignedModeratorUserId: moderatorUserId,
          status: moderatorUserId ? ConductReviewStatus.ASSIGNED : ConductReviewStatus.PENDING
        }
      });
    }, CONDUCT_REPORT_TRANSACTION_OPTIONS));
    return { ok: true as const, candidate: updated };
  } catch (error) {
    return candidateOperationFailure(error);
  }
}

export async function dismissConductCandidate(actorUserId: string, candidateReference: string, reasonInput: unknown) {
  const reason = typeof reasonInput === "string" ? reasonInput.trim().slice(0, 2000) : "";
  const candidate = await prisma.conductReviewCandidate.findUnique({ where: { reference: candidateReference.trim().toUpperCase() } });
  if (!candidate) {
    return { ok: false as const, error: "That review candidate is not available." };
  }
  if (reason.length < 5) return { ok: false as const, error: "Enter a dismissal reason." };
  try {
    await retryConductReportCreation(() => prisma.$transaction(async (transaction) => {
      const locked = await lockAndAuthorizeConductCandidate(transaction, actorUserId, candidate);
      assertMutableConductCandidate(locked.status);
      await transaction.conductReviewCandidate.update({
        where: { id: locked.id },
        data: { status: ConductReviewStatus.DISMISSED, reviewReason: reason, assignedModeratorUserId: actorUserId }
      });
      await transaction.auditLog.create({
        data: {
          actorUserId,
          module: "conduct-reporting",
          action: "candidate_dismissed",
          targetType: "ConductReviewCandidate",
          targetId: locked.id,
          metadata: asJson({ reference: locked.reference, reason })
        }
      });
    }, CONDUCT_REPORT_TRANSACTION_OPTIONS));
    return { ok: true as const };
  } catch (error) {
    return candidateOperationFailure(error);
  }
}

export async function createApprovedCandidateReportRecord(
  transaction: Prisma.TransactionClient,
  expectedCandidate: ConductCandidateScope,
  actorUserId: string,
  reason: string
) {
  const candidate = await lockAndAuthorizeConductCandidate(transaction, actorUserId, expectedCandidate, {
    requireActiveSubject: true
  });

  if (candidate.status === ConductReviewStatus.APPROVED && candidate.incidentId) {
    const [incident, report] = await Promise.all([
      transaction.conductIncident.findUnique({ where: { id: candidate.incidentId } }),
      transaction.conductReport.findFirst({
        where: { incidentId: candidate.incidentId, type: ConductReportType.AUTOMATED }
      })
    ]);
    if (incident && report) return { replayed: true as const, candidate, incident, report };
  }
  assertMutableConductCandidate(candidate.status);

  const incidentFingerprint = createConductFingerprint([candidate.locationType, candidate.contentId]);
  const lockedIncident = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ConductIncident"
    WHERE "fingerprint" = ${incidentFingerprint}
    FOR UPDATE
  `);
  const existingIncident = lockedIncident[0]
    ? await transaction.conductIncident.findUnique({ where: { id: lockedIncident[0].id } })
    : null;
  if (lockedIncident[0] && !existingIncident) {
    throw new Error("The locked conduct incident is no longer available.");
  }

  const incident = existingIncident ?? await transaction.conductIncident.create({
    data: {
      reference: createConductReference("INC"),
      source: ConductIncidentSource.AUTOMATED_REVIEW,
      locationType: candidate.locationType,
      groupId: candidate.groupId,
      subjectContentId: candidate.contentId,
      subjectAuthorUserId: candidate.authorUserId,
      permalink: candidate.permalink,
      fingerprint: incidentFingerprint,
      evidenceSnapshot: candidate.contextSnapshot as Prisma.InputJsonValue,
      evidenceHashes: candidate.evidenceHashes as Prisma.InputJsonValue,
      evidenceContentIds: [candidate.contentId],
      policyCodes: candidate.policyCodes,
      status: deriveConductIncidentStatus([ConductReportStatus.UNDER_REVIEW]),
      createdByUserId: actorUserId,
      assignedModeratorUserId: actorUserId,
      modelMetadata: candidate.providerResult as Prisma.InputJsonValue | undefined
    }
  });

  let report = await transaction.conductReport.findFirst({
    where: { incidentId: incident.id, type: ConductReportType.AUTOMATED }
  });
  let createdReport = false;
  if (!report) {
    report = await transaction.conductReport.create({
      data: {
        reference: createConductReference("RPT"),
        incidentId: incident.id,
        reportedUserId: candidate.authorUserId,
        reporterUserId: null,
        type: ConductReportType.AUTOMATED,
        status: ConductReportStatus.UNDER_REVIEW,
        reasonCode: "human_review_approved",
        context: reason,
        policyCodes: candidate.policyCodes,
        evidenceContentIds: [candidate.contentId]
      }
    });
    createdReport = true;
  }

  const aggregateIncident = existingIncident && createdReport
    ? await recomputeLockedConductIncidentStatus(transaction, incident.id)
    : incident;
  return { replayed: false as const, candidate, incident: aggregateIncident, report };
}

export async function approveConductCandidate(actorUserId: string, candidateReference: string, reasonInput: unknown) {
  const reason = typeof reasonInput === "string" ? reasonInput.trim().slice(0, 2000) : "";
  const candidate = await prisma.conductReviewCandidate.findUnique({ where: { reference: candidateReference.trim().toUpperCase() } });
  if (!candidate) {
    return { ok: false as const, error: "That review candidate is not available." };
  }
  if (reason.length < 5) return { ok: false as const, error: "Enter an approval reason." };

  try {
    const result = await retryConductReportCreation(() => prisma.$transaction(async (transaction) => {
      const creation = await createApprovedCandidateReportRecord(transaction, candidate, actorUserId, reason);
      if (creation.replayed) return creation;
      await transaction.conductReviewCandidate.update({
        where: { id: creation.candidate.id },
        data: {
          status: ConductReviewStatus.APPROVED,
          reviewReason: reason,
          assignedModeratorUserId: actorUserId,
          incidentId: creation.incident.id
        }
      });
      await transaction.conductEvent.create({
        data: {
          incidentId: creation.incident.id,
          reportId: creation.report.id,
          actorUserId,
          type: "REVIEW_CANDIDATE_APPROVED",
          metadata: asJson({ candidateReference: creation.candidate.reference, reason })
        }
      });
      await transaction.notification.create({
        data: {
          userId: creation.candidate.authorUserId,
          title: "A conduct report concerns your account",
          body: `${creation.report.reference} was approved by a human reviewer and is available for review or dispute.`,
          href: `/settings/reports?report=${encodeURIComponent(creation.report.reference)}`
        }
      });
      return creation;
    }, CONDUCT_REPORT_TRANSACTION_OPTIONS));
    return { ok: true as const, incidentReference: result.incident.reference, reportReference: result.report.reference };
  } catch (error) {
    return candidateOperationFailure(error);
  }
}

export async function restrictConductCandidatePair(input: {
  actorUserId: string;
  candidateReference: string;
  otherUserId: string;
  requestedDays: number;
  reason: string;
}) {
  const candidate = await prisma.conductReviewCandidate.findUnique({ where: { reference: input.candidateReference.trim().toUpperCase() } });
  if (!candidate || !(await canModerateConductLocation(input.actorUserId, candidate.locationType, candidate.groupId))) {
    return { ok: false as const, error: "That review candidate is not available." };
  }
  if (!CONDUCT_RESTRICTION_DAYS.includes(input.requestedDays as (typeof CONDUCT_RESTRICTION_DAYS)[number])) {
    return { ok: false as const, error: "Choose a 3, 7, 14, or 30 day restriction." };
  }
  if (input.reason.trim().length < 10) return { ok: false as const, error: "Enter a specific restriction reason." };
  const restriction = await applyPairwiseConductRestriction({
    firstUserId: candidate.authorUserId,
    secondUserId: input.otherUserId,
    requestedDays: input.requestedDays as (typeof CONDUCT_RESTRICTION_DAYS)[number],
    reason: input.reason,
    createdByUserId: input.actorUserId
  });
  return { ok: true as const, restrictionReference: restriction.reference };
}

export type ConductCandidateFilter = {
  status?: ConductReviewStatus;
  locationType?: ConductLocationType;
  groupId?: string;
  authorUserId?: string;
  assignedModeratorUserId?: string;
};

export async function listConductCandidates(filter: ConductCandidateFilter = {}, take = 100) {
  return prisma.conductReviewCandidate.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.locationType ? { locationType: filter.locationType } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.authorUserId ? { authorUserId: filter.authorUserId } : {}),
      ...(filter.assignedModeratorUserId ? { assignedModeratorUserId: filter.assignedModeratorUserId } : {})
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(take, 1), 250)
  });
}
